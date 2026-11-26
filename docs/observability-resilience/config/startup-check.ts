import type { AppEnv } from './appEnv';

/**
 * The server's environment, declared. The process checks this list at
 * startup and the admin panel shows it: names and presence only, never a
 * value.
 *
 * - `fatal`: the process is pointless or unsafe without it; startup stops
 *   with a non-zero exit.
 * - `warn`: a feature quietly does not work; one line in the startup block.
 * - `info`: optional; listed in the admin table only.
 *
 * `scope` is `all`, or `deployed` (staging and production only). Job flags
 * are judged by what they resolve to: a default-on job with its variable
 * unset is fine, and any job resolved off is reported with what stops.
 */
export type EnvSeverity = 'fatal' | 'warn' | 'info';
export type EnvScope = 'all' | 'deployed';

export interface EnvVarSpec {
  name: string;
  severity: EnvSeverity;
  scope: EnvScope;
  /** What happens without it, in a few words. */
  effect: string;
  /** A boolean job flag, with the job's default when unset. */
  flag?: { default: boolean };
}

const jobFlag = (name: string, effect: string, defaultOn = true, severity: EnvSeverity = 'warn'): EnvVarSpec => ({
  name,
  severity,
  scope: 'all',
  effect,
  flag: { default: defaultOn },
});

/**
 * A representative excerpt. The production list declares every variable
 * the server reads, and a test keeps it in step with `.env.example` and
 * with every job flag in the code.
 */
export const ENV_CHECKS: readonly EnvVarSpec[] = [
  { name: 'DATABASE_URL', severity: 'fatal', scope: 'all', effect: 'no database: the server cannot start' },
  { name: 'AUTH_JWKS_URL', severity: 'fatal', scope: 'all', effect: 'no auth keys: no request can be authenticated' },
  { name: 'JWT_ISSUER', severity: 'fatal', scope: 'deployed', effect: 'tokens are not pinned to an issuer' },
  { name: 'JWT_AUDIENCE', severity: 'fatal', scope: 'deployed', effect: 'tokens are not pinned to an audience' },
  { name: 'APP_ENV', severity: 'info', scope: 'all', effect: 'unset = development (database and env file selection)' },
  { name: 'PORT', severity: 'info', scope: 'all', effect: 'listens on 3000' },
  { name: 'CLIENT_ORIGIN', severity: 'warn', scope: 'deployed', effect: 'CORS allows only the local dev origin: the web app cannot call the API' },
  { name: 'SENTRY_DSN', severity: 'warn', scope: 'deployed', effect: 'errors will not be reported' },
  { name: 'ORCHESTRATOR_ADDR', severity: 'warn', scope: 'all', effect: 'AI will not run: no generation and no document conversion' },
  { name: 'STORAGE_BUCKET', severity: 'warn', scope: 'deployed', effect: 'file uploads and downloads fail' },
  { name: 'MAIL_API_KEY', severity: 'warn', scope: 'deployed', effect: 'no email is sent' },
  jobFlag('API_ERROR_CLEANUP_ENABLED', 'the API error log is never trimmed'),
  jobFlag('FILES_PURGE_ENABLED', 'trashed files are never purged'),
  jobFlag('VERSIONS_PRUNE_ENABLED', 'document versions are never pruned'),
  jobFlag('LINKS_BACKFILL_ENABLED', 'the link graph is not backfilled (opt-in)', false, 'info'),
  {
    name: 'PROCESS_ROLE',
    severity: 'info',
    scope: 'all',
    effect: 'this process serves HTTP, runs every job and hosts the realtime socket (all)',
  },
];

export type EnvRowStatus = 'ok' | 'missing' | 'off' | 'not-applicable';

export interface EnvCheckRow {
  name: string;
  set: boolean;
  severity: EnvSeverity;
  scope: EnvScope;
  status: EnvRowStatus;
  effect: string;
}

export interface EnvCheckResult {
  appEnv: AppEnv;
  rows: EnvCheckRow[];
  fatal: EnvCheckRow[];
  warn: EnvCheckRow[];
  ok: number;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

function flagValue(raw: string | undefined, fallback: boolean): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return fallback;
}

function rowStatus(spec: EnvVarSpec, raw: string | undefined, isSet: boolean, deployed: boolean): EnvRowStatus {
  if (spec.flag) {
    return flagValue(raw, spec.flag.default) ? 'ok' : 'off';
  }
  if (isSet) {
    return 'ok';
  }
  const applies = spec.scope === 'all' || deployed;
  return applies ? 'missing' : 'not-applicable';
}

const isProblem = (row: EnvCheckRow) => row.status === 'missing' || row.status === 'off';

/** `get` returns the raw variable; only its presence, and a flag's on/off, is read. */
export function checkEnv(
  get: (name: string) => string | undefined,
  appEnv: AppEnv,
  specs: readonly EnvVarSpec[] = ENV_CHECKS,
): EnvCheckResult {
  const deployed = appEnv !== 'development';

  const rows = specs.map((spec): EnvCheckRow => {
    const raw = get(spec.name);
    const isSet = typeof raw === 'string' && raw.trim() !== '';
    return {
      name: spec.name,
      set: isSet,
      severity: spec.severity,
      scope: spec.scope,
      status: rowStatus(spec, raw, isSet, deployed),
      effect: spec.effect,
    };
  });

  return {
    appEnv,
    rows,
    fatal: rows.filter((row) => row.severity === 'fatal' && isProblem(row)),
    warn: rows.filter((row) => row.severity === 'warn' && isProblem(row)),
    ok: rows.filter((row) => row.status === 'ok').length,
  };
}

function summaryLine(row: EnvCheckRow): string {
  const label = row.severity === 'fatal' ? 'FATAL' : 'WARN ';
  const state = row.status === 'off' ? 'is off' : 'is not set';
  return `  ${label} ${row.name} ${state} — ${row.effect}`;
}

/** The startup block: counts, then every fatal and warn with what it stops. Names only. */
export function formatEnvSummary(result: EnvCheckResult): string[] {
  const header = `env check (${result.appEnv}): ${result.fatal.length} fatal · ${result.warn.length} warn · ${result.ok} ok`;
  return [header, ...result.fatal.map(summaryLine), ...result.warn.map(summaryLine)];
}
