import type { Detail, ListItem } from './api.js';
import { wrapUserContent } from './userContent.js';

/** `YYYY-MM-DD` from an ISO timestamp. */
const DATE_LENGTH = 10;
const WHITESPACE_RUN = /\s+/g;
const UNNAMED = 'unnamed';

export function formatListItem(item: ListItem): string {
  const meta = [
    item.id,
    item.type,
    item.status,
    item.severity ?? 'no-severity',
    `${item.commentCount} comments`,
    item.agentFixedAt ? 'fix-ready' : null,
    item.createdAt.slice(0, DATE_LENGTH),
  ];
  return `${meta.filter(Boolean).join(' | ')}\n  ${wrapUserContent(item.title.replace(WHITESPACE_RUN, ' '))}`;
}

/** Authors appear by display name only: a ticket's text is all a fix needs, not emails. */
export function formatDetail(item: Detail): string {
  const lines = [
    `id: ${item.id}`,
    `type: ${item.type}`,
    `status: ${item.status}`,
    `severity: ${item.severity ?? 'not set'}`,
    `tags: ${item.tags?.join(', ') || 'none'}`,
    `created: ${item.createdAt}`,
    `author: ${wrapUserContent(item.submittedBy.displayName ?? UNNAMED)}`,
    '',
    `title: ${wrapUserContent(item.title)}`,
    '',
    'description:',
    wrapUserContent(item.description),
  ];
  if (item.agentFixedAt) {
    lines.push(
      '',
      `fix ready: ${item.agentFixedAt}, commit ${item.agentFixCommit}, branch ${item.agentFixBranch ?? 'not set'}`,
      wrapUserContent(item.agentFixSummary ?? ''),
    );
  }
  lines.push('', 'internal notes (admin only, may quote users):');
  lines.push(item.internalNotes ? wrapUserContent(item.internalNotes) : 'none');
  lines.push('', `comments (${item.comments.length}):`);
  for (const comment of item.comments) {
    const who = comment.isAdmin ? 'admin' : 'user';
    lines.push(`- ${comment.createdAt} ${who} ${wrapUserContent(comment.user.displayName ?? UNNAMED)}:`);
    lines.push(wrapUserContent(comment.body));
  }
  const attachments = item.attachments ?? [];
  lines.push('', `attachments (${attachments.length}); get_attachment shows an image:`);
  for (const file of attachments) {
    lines.push(`- ${file.id} ${file.mime} ${wrapUserContent(file.filename)}`, `  ${file.url}`);
  }
  return lines.join('\n');
}
