/**
 * The Library half of the History entry check: documentation moves with the
 * change. Pure; `require-entry.ts` reads the files and reports.
 *
 *   - a new entry with `type: feature` and `audience: user|admin` lists the
 *     articles it touched in `articles`; an empty list fails unless the PR
 *     description says why, in a line `Library: none — <reason>`;
 *   - an article whose `covers` globs match a file the PR changes, while the
 *     article itself is unchanged, is reported as a warning.
 */

export interface SourceFile {
  path: string;
  content: string;
}

export interface LibraryFeatureProblem {
  path: string;
  message: string;
}

export interface CoversWarning {
  article: string;
  files: string[];
}

/** `Library: none — the button only moved` (also `-`, `–` or `:`); the reason is required. */
const LIBRARY_NONE_LINE = /^\s*library:\s*none\s*[—–:-]+\s*\S.*$/im;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const LINE_BREAK = /\r?\n/;
const LIST_ITEM = /^\s+-\s+(.*)$/;
const KEY_VALUE = /^([A-Za-z_][\w-]*):\s*(.*)$/;
const TRAILING_COMMENT = /\s+#.*$/;
const QUOTED = /^(['"])(.*)\1$/;
const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;
const WILDCARD = /[*?]/;

const DOCUMENTED_AUDIENCES = new Set(['user', 'admin']);
const FEATURE_TYPE = 'feature';
const MISSING_ARTICLE_MESSAGE =
  'a new feature with `articles: []` — add or extend a Library article and list it, or explain in the PR description: "Library: none — <reason>"';

export function hasLibraryNone(body: string): boolean {
  return LIBRARY_NONE_LINE.test(body);
}

const unquote = (value: string) => value.trim().replace(QUOTED, '$2');

/**
 * The YAML subset used at the top level of Library frontmatter: scalars,
 * flow lists (`[a, b]`) and block lists (`- a`). Enough to read `type`,
 * `audience`, `articles`, `id` and `covers`; nested blocks such as `shot:`
 * never leak into top-level fields. The full parse belongs to the compiler.
 */
export function readFrontmatter(content: string): Record<string, string | string[]> {
  const match = FRONTMATTER.exec(content);
  if (!match) {
    return {};
  }

  const fields: Record<string, string | string[]> = {};
  let listKey: string | null = null;

  for (const line of match[1].split(LINE_BREAK)) {
    const item = LIST_ITEM.exec(line);
    if (item && listKey) {
      (fields[listKey] as string[]).push(unquote(item[1].replace(TRAILING_COMMENT, '')));
      continue;
    }

    const pair = KEY_VALUE.exec(line);
    if (!pair) continue;

    const [, key, rawValue] = pair;
    const value = rawValue.replace(TRAILING_COMMENT, '').trim();
    listKey = null;

    if (value === '') {
      fields[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      fields[key] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
    } else {
      fields[key] = unquote(value);
    }
  }

  return fields;
}

const asList = (value: string | string[] | undefined): string[] =>
  Array.isArray(value) ? value : value ? [value] : [];

function isUndocumentedFeature(entry: SourceFile): boolean {
  const fields = readFrontmatter(entry.content);
  return (
    fields.type === FEATURE_TYPE &&
    typeof fields.audience === 'string' &&
    DOCUMENTED_AUDIENCES.has(fields.audience) &&
    asList(fields.articles).length === 0
  );
}

/** New user or admin feature entries that name no article, when the PR gives no reason. */
export function featureEntriesWithoutArticles(addedEntries: SourceFile[], prBody: string): LibraryFeatureProblem[] {
  if (hasLibraryNone(prBody)) {
    return [];
  }

  return addedEntries
    .filter(isUndocumentedFeature)
    .map((entry) => ({ path: entry.path, message: MISSING_ARTICLE_MESSAGE }));
}

/** `server/src/ai/**`, `client/src/x/*.tsx` → a RegExp over repository paths. A glob without wildcards also matches below it. */
export function globToRegExp(glob: string): RegExp {
  const pattern = glob.trim().replace(/^\.\//, '');
  let source = '';

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') {
        i++;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(REGEX_SPECIAL, '\\$&');
    }
  }

  const matchesBelow = !WILDCARD.test(pattern);
  return new RegExp(`^${source}${matchesBelow ? '(?:/.*)?' : ''}$`);
}

/**
 * Articles whose `covers` match a changed file while neither of the
 * article's locale files changed. `changed` holds the paths the PR adds or
 * modifies.
 */
export function coversWarnings(articleFiles: SourceFile[], changed: string[]): CoversWarning[] {
  const articles = new Map<string, { paths: string[]; covers: RegExp[] }>();

  for (const file of articleFiles) {
    const fields = readFrontmatter(file.content);
    const id = typeof fields.id === 'string' ? fields.id : file.path;
    const article = articles.get(id) ?? { paths: [], covers: [] };

    article.paths.push(file.path);
    // Both locales declare the same `covers` (the build checks it); either one is enough.
    if (article.covers.length === 0) {
      article.covers = asList(fields.covers).filter(Boolean).map(globToRegExp);
    }
    articles.set(id, article);
  }

  const changedPaths = new Set(changed);
  const warnings: CoversWarning[] = [];

  for (const [id, article] of [...articles].sort(([a], [b]) => a.localeCompare(b))) {
    const reviewed = article.paths.some((path) => changedPaths.has(path));
    if (article.covers.length === 0 || reviewed) continue;

    const files = changed.filter((path) => article.covers.some((pattern) => pattern.test(path)));
    if (files.length > 0) {
      warnings.push({ article: id, files });
    }
  }

  return warnings;
}
