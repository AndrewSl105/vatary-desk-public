export interface ListParams {
  type?: string;
  status?: string;
  severity?: string;
  q?: string;
  agentFixed?: boolean;
  page?: number;
}

export interface ListItem {
  id: string;
  type: string;
  status: string;
  severity: string | null;
  title: string;
  commentCount: number;
  agentFixedAt: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  url: string;
}

export interface Detail {
  id: string;
  type: string;
  status: string;
  severity: string | null;
  title: string;
  description: string;
  tags?: string[];
  createdAt: string;
  internalNotes: string | null;
  agentFixedAt: string | null;
  agentFixCommit: string | null;
  agentFixBranch: string | null;
  agentFixSummary: string | null;
  submittedBy: { displayName: string | null };
  comments: Array<{
    isAdmin: boolean;
    body: string;
    createdAt: string;
    user: { displayName: string | null };
  }>;
  attachments?: Attachment[];
}

export const PAGE_SIZE = 20;
const TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_CHARS = 500;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const TRAILING_SLASHES = /\/+$/;

const ERROR_HINTS: Record<number, string> = {
  [HTTP_UNAUTHORIZED]: ' (token invalid, revoked or expired)',
  [HTTP_NOT_FOUND]: ' (no such ticket, or this API has no agent routes)',
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The API, and nothing else: this package never touches the database. */
export class FeedbackApi {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    this.base = baseUrl.replace(TRAILING_SLASHES, '');
  }

  list(params: ListParams) {
    const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return this.request<{ total: number; page: number; items: ListItem[] }>(`/api/feedback?${query}`);
  }

  detail(id: string) {
    return this.request<Detail>(`/api/feedback/${encodeURIComponent(id)}`);
  }

  startWork(id: string, reason?: string) {
    return this.post(id, 'agent-start', { reason });
  }

  addNote(id: string, text: string) {
    return this.post(id, 'agent-note', { text });
  }

  addComment(id: string, body: string) {
    return this.post(id, 'comments', { body });
  }

  markFixed(id: string, fix: { commitSha: string; branch?: string; summary: string }) {
    return this.post(id, 'agent-fix', fix);
  }

  /** Attachment URLs are presigned storage links: the token never goes there. */
  async fetchBytes(url: string, maxBytes: number): Promise<Buffer> {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new ApiError(res.status, `Attachment download failed: HTTP ${res.status}`);
    const tooLarge = () => new ApiError(HTTP_PAYLOAD_TOO_LARGE, `Attachment is over ${maxBytes} bytes`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw tooLarge();
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw tooLarge();
    return bytes;
  }

  private post(id: string, action: string, body: unknown) {
    return this.request<unknown>(`/api/feedback/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new ApiError(res.status, await errorText(res));
    return (await res.json()) as T;
  }
}

async function errorText(res: Response): Promise<string> {
  const hint = ERROR_HINTS[res.status] ?? '';
  const body = await res.text().catch(() => '');
  return `HTTP ${res.status}${hint}: ${body.slice(0, MAX_ERROR_BODY_CHARS)}`;
}
