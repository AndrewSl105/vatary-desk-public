import type { FeedbackItem, FeedbackStatus, UserRole } from '../../generated/prisma/client';

/** Statuses of a ticket still waiting for someone to work on it. */
const QUEUE_STATUSES: readonly FeedbackStatus[] = ['OPEN', 'UNDER_REVIEW', 'PLANNED'];

/** The longest internal notes the admin form can still save. */
export const MAX_INTERNAL_NOTES = 20_000;

const NOTE_AUTHOR = 'Claude Code';
/** `YYYY-MM-DDTHH:MM` from an ISO timestamp. */
const NOTE_TIMESTAMP_LENGTH = 16;
const NOTE_SEPARATOR = '\n\n';
const ADMIN_ROLE: UserRole = 'SUPER_ADMIN';

/** Whether an agent may take a ticket in this status. Closed tickets stay closed. */
export function canStartWork(status: FeedbackStatus): boolean {
  return QUEUE_STATUSES.includes(status);
}

/** Appends a dated, attributed note; existing notes are never replaced. */
export function appendNote(existing: string | null, text: string, at: Date): string {
  const timestamp = at.toISOString().slice(0, NOTE_TIMESTAMP_LENGTH).replace('T', ' ');
  const entry = `[${timestamp} UTC · ${NOTE_AUTHOR}]\n${text}`;
  return existing ? `${existing}${NOTE_SEPARATOR}${entry}` : entry;
}

/** The "fix ready" fields as a viewer may see them: admins only. */
export function agentFixView(
  item: Pick<FeedbackItem, 'agentFixedAt' | 'agentFixCommit' | 'agentFixBranch' | 'agentFixSummary'>,
  viewerRole: UserRole,
) {
  const isAdmin = viewerRole === ADMIN_ROLE;
  return {
    agentFixedAt: isAdmin ? (item.agentFixedAt?.toISOString() ?? null) : null,
    agentFixCommit: isAdmin ? item.agentFixCommit : null,
    agentFixBranch: isAdmin ? item.agentFixBranch : null,
    agentFixSummary: isAdmin ? item.agentFixSummary : null,
  };
}
