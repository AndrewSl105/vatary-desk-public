/**
 * What this process does. One image and one module graph; `PROCESS_ROLE`
 * selects the roles of an instance:
 *
 *   api       serve HTTP
 *   jobs      run the scheduled jobs (each job keeps its own on/off flag)
 *   realtime  host the collaborative-editing WebSocket
 *
 * Unset, empty or `all` means every role. HTTP is always served, for the
 * container health checks, so `api` is implied. Unknown words are ignored
 * with a warning rather than refused: a typo must not take a deploy down.
 */
export const PROCESS_ROLES = ['api', 'jobs', 'realtime'] as const;
export type ProcessRole = (typeof PROCESS_ROLES)[number];

const ALL_ROLES_KEYWORD = 'all';
const ROLE_SEPARATOR = ',';
const IMPLIED_ROLE: ProcessRole = 'api';

export interface ProcessRoles {
  roles: ReadonlySet<ProcessRole>;
  /** Words in the variable that are not roles (logged and ignored). */
  unknown: string[];
  /** The variable as read, for the startup line. */
  raw: string;
}

function isProcessRole(word: string): word is ProcessRole {
  return (PROCESS_ROLES as readonly string[]).includes(word);
}

export function parseProcessRoles(raw: string | undefined): ProcessRoles {
  const text = (raw ?? '').trim();

  if (!text || text.toLowerCase() === ALL_ROLES_KEYWORD) {
    return { roles: new Set(PROCESS_ROLES), unknown: [], raw: text || ALL_ROLES_KEYWORD };
  }

  const roles = new Set<ProcessRole>([IMPLIED_ROLE]);
  const unknown: string[] = [];

  for (const part of text.split(ROLE_SEPARATOR)) {
    const word = part.trim().toLowerCase();
    if (!word) continue;

    if (isProcessRole(word)) roles.add(word);
    else unknown.push(word);
  }

  return { roles, unknown, raw: text };
}

let cached: ProcessRoles | null = null;

/** The roles of this process, read once from `PROCESS_ROLE`. */
export function processRoles(): ProcessRoles {
  cached ??= parseProcessRoles(process.env.PROCESS_ROLE);
  return cached;
}

export const runsJobs = (): boolean => processRoles().roles.has('jobs');
export const runsRealtime = (): boolean => processRoles().roles.has('realtime');

/** The boot log line, e.g. `process roles: api, jobs, realtime (PROCESS_ROLE=all)`. */
export function processRolesLine(roles: ProcessRoles = processRoles()): string {
  const list = PROCESS_ROLES.filter((role) => roles.roles.has(role)).join(', ');
  const ignored = roles.unknown.length ? `; ignored: ${roles.unknown.join(', ')}` : '';
  return `process roles: ${list} (PROCESS_ROLE=${roles.raw})${ignored}`;
}
