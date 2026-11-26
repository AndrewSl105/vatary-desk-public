#!/usr/bin/env node

/**
 * Refactor ratchet: a counter may shrink, never grow.
 *
 *   node scripts/refactor/ratchet.mjs               check: fail only if a count grew past the baseline
 *   node scripts/refactor/ratchet.mjs --baseline    rewrite the baseline file
 *   node scripts/refactor/ratchet.mjs --report      print the counts as a Markdown table (CI step summary)
 *
 * An existing violation never fails the build; a new one does. Counters:
 *   - files over 500 lines per package (hand-written code only)
 *   - `: any` and `eslint-disable` in the client and the server
 *   - file-level import cycles in the client (dependency-cruiser)
 *   - client eslint errors
 *   - server eslint errors, with the formatting rule off (the repo never runs a formatter)
 * The eslint counters need the package's dependencies installed and are
 * skipped with a note otherwise, so the script also runs on a bare checkout.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = join(ROOT, 'docs/refactor/data/ratchet-baseline.json');
const METRICS_SCRIPT = join(ROOT, 'scripts/refactor/metrics.mjs');
const DEPCRUISE_CONFIG = join(ROOT, 'scripts/refactor/depcruise.client.cjs');
const DEPCRUISE_BIN = join(ROOT, 'server/node_modules/.bin/depcruise');

/** Child process output can be large (a full eslint JSON report): 256 MiB. */
const MAX_OUTPUT_BYTES = 1 << 28;
/** Type-aware linting of the whole server needs more than Node's default heap. */
const ESLINT_HEAP_MB = 4096;
const STDERR_TAIL_LINES = 5;
const KEY_COLUMN_WIDTH = 24;
const NUMBER_COLUMN_WIDTH = 6;
const JSON_INDENT = 2;

const mode = process.argv.includes('--baseline') ? 'baseline' : process.argv.includes('--report') ? 'report' : 'check';

const metrics = JSON.parse(execFileSync(process.execPath, [METRICS_SCRIPT, '--json'], { encoding: 'utf8' }));

const counts = {};
const skipped = [];

for (const [name, pkg] of Object.entries(metrics.packages)) {
  counts[`${name}.over500`] = pkg.over500;
  if (pkg.any != null) counts[`${name}.any`] = pkg.any;
  if (pkg.eslintDisable != null) counts[`${name}.eslintDisable`] = pkg.eslintDisable;
}

const hasModules = (pkg) => existsSync(join(ROOT, pkg, 'node_modules/.bin/eslint'));

/** A cycle as a stable key: its module names, sorted. */
function cycleKey(source, cycle) {
  return [source, ...(cycle ?? [])]
    .map((entry) => (typeof entry === 'string' ? entry : entry.name))
    .sort()
    .join('|');
}

if (existsSync(DEPCRUISE_BIN)) {
  const out = execFileSync(DEPCRUISE_BIN, ['--config', DEPCRUISE_CONFIG, '--output-type', 'json', 'src'], {
    cwd: join(ROOT, 'client'),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });

  const cycles = new Set();
  for (const module of JSON.parse(out).modules) {
    for (const dependency of module.dependencies) {
      if (dependency.circular) cycles.add(cycleKey(module.source, dependency.cycle));
    }
  }
  counts['client.cycles'] = cycles.size;
} else {
  skipped.push('client.cycles (server/node_modules missing)');
}

/**
 * `eslint -f json` in a package, parsed. A run that produced no JSON
 * (crashed, out of memory) is an error with its own stderr, never a count.
 */
function eslintJson(pkg, args) {
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${ESLINT_HEAP_MB}`.trim() };
  let out;
  let stderr = '';
  let status = 0;

  try {
    out = execFileSync(join(ROOT, `${pkg}/node_modules/.bin/eslint`), args, {
      cwd: join(ROOT, pkg),
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = e.stdout;
    stderr = String(e.stderr ?? '');
    status = e.status;
  }

  try {
    return JSON.parse(out);
  } catch {
    const tail = stderr.trim().split('\n').slice(-STDERR_TAIL_LINES).join(' | ') || '(no stderr)';
    throw new Error(`${pkg} eslint produced no JSON report (exit ${status}): ${tail}`);
  }
}

const errorCount = (report) => report.reduce((sum, file) => sum + file.errorCount, 0);

if (hasModules('client')) {
  counts['client.eslintErrors'] = errorCount(eslintJson('client', ['.', '-f', 'json']));
} else {
  skipped.push('client.eslintErrors (client/node_modules missing)');
}

if (hasModules('server')) {
  counts['server.eslintErrors'] = errorCount(
    eslintJson('server', ['{src,test}/**/*.ts', '--rule', 'prettier/prettier: off', '-f', 'json']),
  );
} else {
  skipped.push('server.eslintErrors (server/node_modules missing)');
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};

if (mode === 'baseline') {
  const next = { generatedAt: metrics.generatedAt, counts: { ...baseline.counts, ...counts } };
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, JSON_INDENT) + '\n');
  console.log('baseline written:', BASELINE_PATH);
  process.exit(0);
}

const rows = Object.entries(counts).map(([key, now]) => {
  const before = baseline.counts?.[key];
  return { key, now, baseline: before, grew: before != null && now > before };
});

function trend(row) {
  if (row.grew) return ' ⬆ **GREW**';
  if (row.baseline != null && row.now < row.baseline) return ' ⬇';
  return '';
}

if (mode === 'report') {
  console.log('| counter | baseline | now |\n|---|---|---|');
  for (const row of rows) console.log(`| ${row.key} | ${row.baseline ?? '—'} | ${row.now}${trend(row)} |`);
  for (const note of skipped) console.log(`\n_skipped: ${note}_`);
} else {
  for (const row of rows) {
    const status = row.grew ? 'GREW ' : '  ok ';
    const before = String(row.baseline ?? '—').padStart(NUMBER_COLUMN_WIDTH);
    console.log(`${status} ${row.key.padEnd(KEY_COLUMN_WIDTH)} ${before} → ${row.now}`);
  }
  for (const note of skipped) console.log('skip ', note);

  const grew = rows.filter((row) => row.grew);
  if (grew.length > 0) {
    const list = grew.map((row) => `${row.key} ${row.baseline}→${row.now}`).join(', ');
    console.error(`\n::error::refactor ratchet: ${list}. Fix, or after a real improvement run: node scripts/refactor/ratchet.mjs --baseline`);
    process.exit(1);
  }

  const missing = rows.filter((row) => row.baseline == null);
  if (missing.length > 0) {
    console.log(`\n(no baseline yet for: ${missing.map((row) => row.key).join(', ')} — run --baseline)`);
  }
}
