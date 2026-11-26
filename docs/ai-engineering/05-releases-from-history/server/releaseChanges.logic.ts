import type { HistoryChangeType, ReleaseListedChange } from '../contracts/library/changes';
import { renderLibraryMarkdown } from '../contracts/library/markdown';
import type { JournalEntry } from '../library/journal.logic';

/**
 * History → release draft, the pure half (`ReleaseChangesService` does the
 * I/O). A History entry seeds a slide rather than becoming one: the admin
 * rewrites it in the release editor, so the seed is the entry's own words,
 * title and body per locale, with no media.
 */

/** A release holds at most this many slides. */
export const MAX_RELEASE_SLIDES = 20;

const MAX_SLIDE_TITLE_LENGTH = 200;
const MAX_CAPTION_LENGTH = 10_000;

const LISTED_TYPES = new Set<string>(['feature', 'improvement', 'fix', 'internal']);
const FALLBACK_LISTED_TYPE: HistoryChangeType = 'improvement';
const LIST_PLACEMENT = 'list';

export interface SeedSlide {
  mediaType: 'image';
  layout: 'below';
  fileId: null;
  titleUk: string;
  titleEn: string;
  bodyUk: string;
  bodyEn: string;
}

/** Markdown syntax → its plain words, applied in order. */
const MARKDOWN_TO_PLAIN: ReadonlyArray<[RegExp, string | ((match: string, ...groups: string[]) => string)]> = [
  [/\r\n/g, '\n'],
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_match, id: string, label?: string) => label ?? id],
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  [/\{\{kbd:([^}]+)\}\}/g, '$1'],
  [/(\*\*|__|~~|`)(.+?)\1/g, '$2'],
  [/(^|[^*\w])\*(\S(?:.*?\S)?)\*(?!\*)/gm, '$1$2'],
  [/^#{1,6}\s+/gm, ''],
  [/^:::.*$/gm, ''],
  [/\n{3,}/g, '\n\n'],
];

/**
 * An entry body is Markdown; a slide caption is HTML or plain text. Plain
 * text reaches every surface unchanged: inline markers are dropped,
 * paragraphs and list lines kept.
 */
export function markdownToCaption(markdown: string): string {
  const plain = MARKDOWN_TO_PLAIN.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement as never),
    markdown,
  );
  return plain.trim().slice(0, MAX_CAPTION_LENGTH);
}

export function seedSlide(entry: JournalEntry): SeedSlide {
  return {
    mediaType: 'image',
    layout: 'below',
    fileId: null,
    titleUk: entry.title.uk.slice(0, MAX_SLIDE_TITLE_LENGTH),
    titleEn: entry.title.en.slice(0, MAX_SLIDE_TITLE_LENGTH),
    bodyUk: markdownToCaption(entry.body.uk),
    bodyEn: markdownToCaption(entry.body.en),
  };
}

export type AttachProblem =
  | { kind: 'unknown'; ids: string[] }
  | { kind: 'not-public'; ids: string[] }
  | { kind: 'too-many-slides'; have: number; adding: number };

export interface AttachPlan {
  problem: AttachProblem | null;
  toLink: JournalEntry[];
  skipped: string[];
}

/**
 * Which of `ids` may be linked. Every id must be a known History entry meant
 * for users, because a release is public. Already-linked ids are skipped, so
 * no entry gets a second slide; the rest keep the order they were given in.
 */
export function planAttach(
  ids: string[],
  known: Map<string, JournalEntry>,
  alreadyLinked: Set<string>,
): AttachPlan {
  const unique = [...new Set(ids)];

  const unknown = unique.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return { problem: { kind: 'unknown', ids: unknown }, toLink: [], skipped: [] };
  }

  const notPublic = unique.filter((id) => !known.get(id)!.releasable);
  if (notPublic.length > 0) {
    return { problem: { kind: 'not-public', ids: notPublic }, toLink: [], skipped: [] };
  }

  return {
    problem: null,
    toLink: unique.filter((id) => !alreadyLinked.has(id)).map((id) => known.get(id)!),
    skipped: unique.filter((id) => alreadyLinked.has(id)),
  };
}

export function attachProblemMessage(problem: AttachProblem): string {
  switch (problem.kind) {
    case 'unknown':
      return `Not in this server's History: ${problem.ids.join(', ')}`;
    case 'not-public':
      return `Only entries for users go into a release (it is public); admin and internal entries stay in History: ${problem.ids.join(', ')}`;
    case 'too-many-slides':
      return `A release holds at most ${MAX_RELEASE_SLIDES} slides — it has ${problem.have}, these entries would add ${problem.adding}`;
  }
}

/** The entry's text as stored on its release link, frozen on publish. */
export interface ChangeSnapshot {
  snapType: string;
  snapTitleUk: string;
  snapTitleEn: string;
  snapBodyUk: string;
  snapBodyEn: string;
}

export function snapshotOf(entry: JournalEntry): ChangeSnapshot {
  return {
    snapType: entry.type,
    snapTitleUk: entry.title.uk,
    snapTitleEn: entry.title.en,
    snapBodyUk: entry.body.uk,
    snapBodyEn: entry.body.en,
  };
}

const renderBody = (markdown: string): string => (markdown.trim() ? renderLibraryMarkdown(markdown).html : '');

/**
 * The `list` links of a published release, as users see them: the frozen
 * text, with the body rendered by the Library's Markdown renderer. A row
 * with an empty snapshot is dropped: an empty card is worse than none.
 */
export function listedChanges(
  rows: ReadonlyArray<ChangeSnapshot & { changeId: string; placement: string }>,
): ReleaseListedChange[] {
  return rows
    .filter((row) => row.placement === LIST_PLACEMENT && (row.snapTitleUk.trim() || row.snapTitleEn.trim()))
    .map((row) => ({
      id: row.changeId,
      type: (LISTED_TYPES.has(row.snapType) ? row.snapType : FALLBACK_LISTED_TYPE) as HistoryChangeType,
      title: { uk: row.snapTitleUk, en: row.snapTitleEn },
      bodyHtml: { uk: renderBody(row.snapBodyUk), en: renderBody(row.snapBodyEn) },
    }));
}
