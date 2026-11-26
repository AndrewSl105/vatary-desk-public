/**
 * CI: a pull request that changes product code adds a History entry.
 *
 *   node scripts/changes/require-entry.ts <base-sha> <head-sha>
 *
 * The PR's labels, title and body are read from $GITHUB_EVENT_PATH, never
 * from interpolated shell text. The check fails when the PR touches
 * client/src or server/src outside tests and Markdown and adds no new
 * `changes/<YYYY-MM-DD>-<slug>.md`. A change nobody needs to hear about
 * can opt out with:
 *   - the `no-changelog` label;
 *   - a line `Changelog: none` in the PR description;
 *   - a title starting with `refactor` (behaviour-neutral by definition).
 *
 * It then applies the Library rules (`library-rules.ts`).
 *
 * Plain TypeScript run by Node's type stripping: no imports beyond `node:`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { coversWarnings, featureEntriesWithoutArticles, type SourceFile } from './library-rules.ts';

export interface ChangedFile {
  /** git's --name-status letter: A, M, D, R…, C… */
  status: string;
  path: string;
}

export interface PullRequestInfo {
  title: string;
  body: string;
  labels: string[];
}

export interface Verdict {
  ok: boolean;
  reason: string;
  /** The product files that called for an entry. */
  product: string[];
}

const PRODUCT_PATH = /^(client|server)\/src\//;
const TEST_PATH = /(\.(test|spec|int-spec|e2e-spec)\.[cm]?[jt]sx?$)|(\/__tests__\/)|(\/test\/)|(\.fixture\.[jt]sx?$)/;
/** A real entry such as `changes/2026-10-18-slug.md`, not `README.md` or `_template.md`. */
const ENTRY_PATH = /^changes\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const OPT_OUT_LINE = /^\s*changelog:\s*none\s*$/im;
const REFACTOR_TITLE = /^\s*refactor(\([^)]*\))?!?:/i;
const LOCALIZED_ARTICLE = /\.(uk|en)\.md$/;

const ARTICLES_DIR = 'library/articles';
const ADDED = 'A';
const DELETED = 'D';
const FIELD_SEPARATOR = '\t';

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const MAX_FILES_PER_WARNING = 5;
const MAX_LISTED_PRODUCT_FILES = 20;

export const NO_CHANGELOG_LABEL = 'no-changelog';

const isAdded = (file: ChangedFile) => file.status.startsWith(ADDED);
const isDeleted = (file: ChangedFile) => file.status.startsWith(DELETED);

/** The entries this PR adds: the only ones the Library rule judges. */
export function addedEntryPaths(files: ChangedFile[]): string[] {
  return files.filter((file) => isAdded(file) && ENTRY_PATH.test(file.path)).map((file) => file.path);
}

export function isProductFile(path: string): boolean {
  return PRODUCT_PATH.test(path) && !TEST_PATH.test(path) && !path.endsWith('.md');
}

export function judge(files: ChangedFile[], pr: PullRequestInfo): Verdict {
  const product = files.filter((file) => !isDeleted(file) && isProductFile(file.path)).map((file) => file.path);

  if (product.length === 0) {
    return { ok: true, reason: 'no product code changed (client/src, server/src outside tests)', product };
  }
  if (pr.labels.includes(NO_CHANGELOG_LABEL)) {
    return { ok: true, reason: `label "${NO_CHANGELOG_LABEL}"`, product };
  }
  if (OPT_OUT_LINE.test(pr.body)) {
    return { ok: true, reason: '"Changelog: none" in the PR description', product };
  }
  if (REFACTOR_TITLE.test(pr.title)) {
    return { ok: true, reason: 'a pure refactor (title starts with "refactor")', product };
  }

  const added = addedEntryPaths(files);
  if (added.length > 0) {
    return { ok: true, reason: `new entry: ${added.join(', ')}`, product };
  }

  return { ok: false, reason: 'product code changed and no new changes/<YYYY-MM-DD>-<slug>.md was added', product };
}

export function parseNameStatus(output: string): ChangedFile[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(FIELD_SEPARATOR);
      // A rename is "R100\told\tnew": the new path is what the PR adds.
      return { status: parts[0], path: parts[parts.length - 1] };
    });
}

function readPullRequest(): PullRequestInfo {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return { title: '', body: '', labels: [] };
  }

  const event = JSON.parse(readFileSync(eventPath, 'utf8')) as {
    pull_request?: { title?: string; body?: string | null; labels?: { name: string }[] };
  };
  const pr = event.pull_request ?? {};

  return { title: pr.title ?? '', body: pr.body ?? '', labels: (pr.labels ?? []).map((label) => label.name) };
}

/** Every article source in both locales: `library/articles/<section>/<slug>.<locale>.md`. */
function articleFiles(): string[] {
  if (!existsSync(ARTICLES_DIR)) {
    return [];
  }

  return (readdirSync(ARTICLES_DIR, { recursive: true }) as string[])
    .map((path) => join(ARTICLES_DIR, path).split('\\').join('/'))
    .filter((path) => LOCALIZED_ARTICLE.test(path))
    .sort();
}

function preview(files: string[], limit: number): string {
  const shown = files.slice(0, limit).join(', ');
  return files.length > limit ? `${shown}, …` : shown;
}

function main(): void {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error('usage: node scripts/changes/require-entry.ts <base-sha> <head-sha>');
    process.exit(EXIT_USAGE);
  }

  // Three dots: what the PR adds on top of the merge base, not what the base moved on to.
  const diff = execFileSync('git', ['diff', '--name-status', '-M', `${base}...${head}`], { encoding: 'utf8' });
  const files = parseNameStatus(diff);
  const pr = readPullRequest();
  const verdict = judge(files, pr);
  const read = (path: string): SourceFile => ({ path, content: readFileSync(path, 'utf8') });

  const changed = files.filter((file) => !isDeleted(file)).map((file) => file.path);
  for (const warning of coversWarnings(articleFiles().map(read), changed)) {
    console.log(
      `::warning::Library article "${warning.article}" covers code this PR changes, and the article is unchanged — check it: ${preview(warning.files, MAX_FILES_PER_WARNING)}`,
    );
  }

  const libraryProblems = featureEntriesWithoutArticles(addedEntryPaths(files).filter(existsSync).map(read), pr.body);
  for (const problem of libraryProblems) {
    console.error(`::error file=${problem.path}::${problem.message}`);
  }

  if (verdict.ok && libraryProblems.length === 0) {
    console.log(`History entry check: ok — ${verdict.reason}.`);
    return;
  }
  if (verdict.ok) {
    process.exit(EXIT_FAILURE);
  }

  console.error(`::error::${verdict.reason}.`);
  console.error('Product files in this PR:');
  for (const path of verdict.product.slice(0, MAX_LISTED_PRODUCT_FILES)) {
    console.error(`  ${path}`);
  }
  console.error(
    '\nAdd changes/<YYYY-MM-DD>-<slug>.md (format: changes/README.md, start from changes/_template.md) and run `npm run library:check`.' +
      `\nNothing an admin needs to hear about? Add the "${NO_CHANGELOG_LABEL}" label or a line "Changelog: none" to the PR description.`,
  );
  process.exit(EXIT_FAILURE);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
