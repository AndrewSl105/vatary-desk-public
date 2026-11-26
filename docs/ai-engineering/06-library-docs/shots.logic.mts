/**
 * `npm run library:screenshots`, the pure half: the manifest, the command
 * line, and where each picture goes. No browser and no I/O, so every rule
 * is covered by plain unit tests.
 */

export const SHOT_LOCALES = ['uk', 'en'] as const;
export type ShotLocale = (typeof SHOT_LOCALES)[number];
export type ShotAccount = 'user' | 'admin';

/** Share of differing pixels below which a picture counts as unchanged (antialiasing, font hinting). */
export const UNCHANGED_RATIO = 0.002;

const DEFAULT_ACCOUNT: ShotAccount = 'user';
const DEFAULT_THEME = 'light';
const VIEWPORT = 'viewport';
/** A change entry ships one picture per release slide. */
const CHANGE_DEFAULT_LOCALES: readonly ShotLocale[] = ['uk'];
const CHANGE_SHOT_NAME = 'shot';
const CHANGE_ARTICLE_PREFIX = 'change:';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOCAL_HOSTNAME_SUFFIXES = ['.localhost', '.test'] as const;

const SHOT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARIA_ROLE = /^[a-z]+$/;
const FRONTMATTER = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const LINE_ENDINGS = /\r\n?/g;
const BYTE_ORDER_MARK = /^﻿/;
const LOCALE_PLACEHOLDER = /\{locale\}/g;
const SEED_PLACEHOLDER = /\{seed\.([a-z0-9.-]+)\}/gi;

const TARGET_HELP = 'a target is { testid } | { role, name } | { text } | { css }';
const STEP_HELP = 'a step is click | fill (+ value) | wait | press';

type Localized = string | { uk: string; en: string };

/** One interaction before the picture. */
export type ShotStep =
  | { click: ShotTarget }
  | { fill: ShotTarget; value: string }
  | { wait: ShotTarget | number }
  | { press: string };

/** A test id, a role and accessible name, a visible text, or (last resort) a CSS selector. */
export type ShotTarget = { testid: string } | { role: string; name: Localized } | { css: string } | { text: Localized };

export interface Shot {
  article: string;
  name: string;
  account: ShotAccount;
  /** App path; `{seed.<key>}` is replaced from the demo seed's ids, `{locale}` by uk/en. */
  route: string;
  steps: ShotStep[];
  /** A CSS selector to crop to, or the whole viewport. */
  area: { selector: string } | typeof VIEWPORT;
  locales: ShotLocale[];
  theme: typeof DEFAULT_THEME;
  /** CSS selectors hidden before the picture: anything that changes on every run. */
  hide: string[];
  /** Set for a change entry's `shot:`; `article` and `name` are then only labels. */
  change?: string;
}

export interface ShotsArgs {
  article: string | null;
  /** `--change <id>`: only that change entry's `shot:`. */
  change: string | null;
  onlyMissing: boolean;
  /** Accepted for compatibility: the demo seed runs on every run. */
  seed: boolean;
  /** Write even when the picture is unchanged. */
  force: boolean;
  help: boolean;
}

/** Reads an option's value from `--name value` or `--name=value`. */
function optionValue(argv: string[], index: number, name: string, example: string): { value: string; consumed: number } | null {
  const arg = argv[index];
  if (arg === name) {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} needs ${example}`);
    return { value, consumed: 2 };
  }
  if (arg.startsWith(`${name}=`)) {
    return { value: arg.slice(name.length + 1), consumed: 1 };
  }
  return null;
}

export function parseArgs(argv: string[]): ShotsArgs {
  const args: ShotsArgs = { article: null, change: null, onlyMissing: false, seed: false, force: false, help: false };

  for (let i = 0; i < argv.length; ) {
    const article = optionValue(argv, i, '--article', 'an article id, e.g. --article admin.history');
    if (article) {
      args.article = article.value;
      i += article.consumed;
      continue;
    }

    const change = optionValue(argv, i, '--change', 'a change id, e.g. --change 2026-11-11-release-list-entries');
    if (change) {
      args.change = change.value;
      i += change.consumed;
      continue;
    }

    const flag = argv[i];
    if (flag === '--only-missing') args.onlyMissing = true;
    else if (flag === '--seed') args.seed = true;
    else if (flag === '--force') args.force = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
    else throw new Error(`unknown option "${flag}" (try --help)`);
    i += 1;
  }

  if (args.article && args.change) throw new Error('--article and --change are separate runs');
  return args;
}

function isLocalized(value: unknown): value is Localized {
  if (typeof value === 'string') return true;
  const pair = value as { uk?: unknown; en?: unknown } | null;
  return !!pair && typeof pair === 'object' && typeof pair.uk === 'string' && typeof pair.en === 'string';
}

function readTarget(value: unknown, where: string): ShotTarget {
  if (!value || typeof value !== 'object') throw new Error(`${where}: ${TARGET_HELP}`);
  const o = value as Record<string, unknown>;

  if (typeof o.testid === 'string') return { testid: o.testid };
  if (typeof o.role === 'string' && ARIA_ROLE.test(o.role) && isLocalized(o.name)) return { role: o.role, name: o.name as string };
  if (isLocalized(o.text)) return { text: o.text as string };
  if (typeof o.css === 'string') return { css: o.css };

  throw new Error(`${where}: ${TARGET_HELP}`);
}

function readStep(value: unknown, where: string): ShotStep {
  const o = (value ?? {}) as Record<string, unknown>;

  if ('click' in o) return { click: readTarget(o.click, `${where}.click`) };
  if ('fill' in o) {
    if (typeof o.value !== 'string') throw new Error(`${where}: fill needs a value`);
    return { fill: readTarget(o.fill, `${where}.fill`), value: o.value };
  }
  if ('wait' in o) return { wait: typeof o.wait === 'number' ? o.wait : readTarget(o.wait, `${where}.wait`) };
  if ('press' in o && typeof o.press === 'string') return { press: o.press };

  throw new Error(`${where}: ${STEP_HELP}`);
}

function readArea(value: unknown): Shot['area'] | null {
  if (value === undefined || value === VIEWPORT) return VIEWPORT;
  const selector = (value as { selector?: unknown } | null)?.selector;
  return typeof selector === 'string' ? { selector } : null;
}

/** What a shot does: the same rules for a manifest row and a change entry's `shot:`. */
function readShotBody(o: Record<string, unknown>, where: string, defaultLocales: readonly ShotLocale[]): Omit<Shot, 'article' | 'name' | 'change'> {
  const account = o.account ?? DEFAULT_ACCOUNT;
  if (account !== 'user' && account !== 'admin') throw new Error(`${where}: account is user | admin`);

  if (typeof o.route !== 'string' || !o.route.startsWith('/')) throw new Error(`${where}: route must be an app path starting with "/"`);

  const area = readArea(o.area);
  if (!area) throw new Error(`${where}: area is "viewport" or { selector }`);

  const locales = (o.locales ?? [...defaultLocales]) as unknown[];
  const validLocales =
    Array.isArray(locales) && locales.length > 0 && locales.every((locale) => (SHOT_LOCALES as readonly unknown[]).includes(locale));
  if (!validLocales) throw new Error(`${where}: locales ⊆ [uk, en]`);

  if ((o.theme ?? DEFAULT_THEME) !== DEFAULT_THEME) throw new Error(`${where}: only theme: light is shot`);

  const steps = ((o.steps ?? []) as unknown[]).map((step, j) => readStep(step, `${where}.steps[${j}]`));

  const hide = (o.hide ?? []) as unknown[];
  if (!Array.isArray(hide) || hide.some((selector) => typeof selector !== 'string' || !selector.trim())) {
    throw new Error(`${where}: hide is a list of CSS selectors`);
  }

  return { account, route: o.route, steps, area, locales: locales as ShotLocale[], theme: DEFAULT_THEME, hide: hide as string[] };
}

/** The parsed manifest → shots, checked against the Library's article ids. Reports every problem at once. */
export function readManifest(raw: unknown, articleIds: ReadonlySet<string>): { shots: Shot[]; problems: string[] } {
  const list = (raw as { shots?: unknown })?.shots;
  if (!Array.isArray(list)) return { shots: [], problems: ['shots.yaml: expected `shots:` with a list'] };

  const shots: Shot[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  list.forEach((value, i) => {
    const where = `shots[${i}]`;
    try {
      const o = (value ?? {}) as Record<string, unknown>;
      const article = String(o.article ?? '');
      const name = String(o.name ?? '');
      const key = `${article}/${name}`;

      if (!articleIds.has(article)) throw new Error(`${where}: unknown article "${article}"`);
      if (!SHOT_NAME.test(name)) throw new Error(`${where}: name "${name}" must be lowercase words joined by "-"`);
      if (seen.has(key)) throw new Error(`${where}: duplicate ${key}`);

      seen.add(key);
      shots.push({ article, name, ...readShotBody(o, where, SHOT_LOCALES) });
    } catch (e) {
      problems.push((e as Error).message);
    }
  });

  return { shots, problems };
}

/** A change entry's frontmatter as the script reads it: the id and its `shot:` (absent = none). */
export interface ChangeShotSource {
  id: string;
  path: string;
  shot: unknown;
}

/** The YAML between the `---` lines of a change entry, or null when there is none. */
export function changeFrontmatter(text: string): string | null {
  const normalized = text.replace(LINE_ENDINGS, '\n').replace(BYTE_ORDER_MARK, '');
  return FRONTMATTER.exec(normalized)?.[1] ?? null;
}

/** Change entries' `shot:` → shots. Problems name the file. */
export function readChangeShots(sources: readonly ChangeShotSource[]): { shots: Shot[]; problems: string[] } {
  const shots: Shot[] = [];
  const problems: string[] = [];

  for (const source of sources) {
    if (source.shot === undefined || source.shot === null) continue;
    try {
      if (typeof source.shot !== 'object' || Array.isArray(source.shot)) {
        throw new Error(`${source.path}: shot: is a mapping (route, steps, …)`);
      }
      const body = readShotBody(source.shot as Record<string, unknown>, `${source.path}: shot`, CHANGE_DEFAULT_LOCALES);
      shots.push({ article: `${CHANGE_ARTICLE_PREFIX}${source.id}`, name: CHANGE_SHOT_NAME, ...body, change: source.id });
    } catch (e) {
      problems.push((e as Error).message);
    }
  }

  return { shots, problems };
}

/**
 * Where the picture goes, repository-relative. Change pictures never go
 * under the public article assets: a change may show something unreleased.
 */
export function assetPath(shot: Pick<Shot, 'article' | 'name' | 'change'>, locale: ShotLocale): string {
  if (shot.change) return `changes/assets/${shot.change}.${locale}.webp`;
  return `library/assets/${shot.article}/${shot.name}.${locale}.webp`;
}

/** `{seed.page.{locale}}` → the seeded id; an unknown key is an error, never a broken URL. */
export function resolveRoute(route: string, locale: ShotLocale, seed: Readonly<Record<string, string>>): string {
  return route.replace(LOCALE_PLACEHOLDER, locale).replace(SEED_PLACEHOLDER, (_match, key: string) => {
    const id = seed[key];
    if (!id) throw new Error(`route ${route}: no seeded "${key}" — add it to the demo seed or fix the key`);
    return encodeURIComponent(id);
  });
}

export function localized(value: Localized, locale: ShotLocale): string {
  return typeof value === 'string' ? value : value[locale];
}

/**
 * Which shots this run takes: one article's, one change's, or everything.
 * A change's picture records the release it went into, so outside
 * `--change <id>` it is taken only while missing.
 */
export function selectShots(
  shots: Shot[],
  args: Pick<ShotsArgs, 'article' | 'onlyMissing'> & { change?: string | null },
  exists: (path: string) => boolean,
): { shot: Shot; locale: ShotLocale }[] {
  const inScope = (shot: Shot) => {
    if (args.article) return !shot.change && shot.article === args.article;
    if (args.change) return shot.change === args.change;
    return true;
  };

  return shots
    .filter(inScope)
    .flatMap((shot) => shot.locales.map((locale) => ({ shot, locale })))
    .filter(({ shot, locale }) => {
      const onlyIfMissing = args.onlyMissing || (Boolean(shot.change) && args.change !== shot.change);
      return !onlyIfMissing || !exists(assetPath(shot, locale));
    });
}

/** Screenshots run against a local app only: the demo seed writes into the accounts it signs in to. */
export function assertLocalBase(base: string): URL {
  const url = new URL(base);
  const isLocal = LOCAL_HOSTNAMES.has(url.hostname) || LOCAL_HOSTNAME_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  if (!isLocal) {
    throw new Error(`${base} is not a local app — screenshots (and the demo seed) run against a local dev stack only`);
  }
  return url;
}
