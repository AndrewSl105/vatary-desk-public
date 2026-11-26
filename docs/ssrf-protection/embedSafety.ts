import type { IncomingMessage } from 'node:http';
import * as net from 'node:net';
import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';

import * as safeNet from './safe-fetch';

/**
 * URL safety for every outbound embed request: content-type probing, the
 * PDF streaming proxy and link previews.
 *
 * Every endpoint validates the URL itself and never trusts an earlier
 * check, since calls can race and DNS can change. The connection is pinned
 * through `safeLookup`, so the address that was judged is the address the
 * socket opens; the up-front DNS check only turns an obvious refusal into a
 * clean 400 early.
 */

export const FETCH_TIMEOUT_MS = 5_000;
export const BODY_IDLE_MS = 15_000;
export const BODY_TOTAL_MS = 60_000;
export const MAX_REDIRECTS = 3;
export const USER_AGENT = 'VataryDeskEmbedBot/1.0 (+link-preview/pdf-proxy; SSRF-guarded)';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
/** An empty port means the scheme default. */
const ALLOWED_PORTS = new Set(['', '80', '443']);

const TRACKING_PARAM_PREFIX = 'utm_';
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
]);

const MAX_HEADER_FILENAME_LENGTH = 200;
const DEFAULT_FILENAME = 'document.pdf';
const HEADER_UNSAFE_CHARS = /[\r\n"\\]/g;
const FILENAME_STAR_PARAM = /filename\*=(?:UTF-8'')?["']?([^"';]+)/i;
const FILENAME_PARAM = /filename=["']?([^"';]+)/i;
const IPV6_BRACKETS = /^\[|\]$/g;

const HTTP_STATUS = {
  minValid: 200,
  maxValid: 599,
  redirectMin: 300,
  redirectMax: 399,
  notModified: 304,
} as const;

/** Statuses a `Response` may not carry a body with. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const MESSAGES = {
  missingUrl: 'Missing url',
  invalidUrl: 'Invalid URL',
  protocol: 'Only http/https URLs are allowed',
  port: 'Only standard web ports are allowed',
  unresolved: 'Could not resolve host',
  privateAddress: 'Refusing to fetch private/loopback address',
  internalHost: 'Refusing to fetch internal host',
  tooManyRedirects: 'Too many redirects',
  invalidRedirect: 'Invalid redirect location',
  nonHttpRedirect: 'Refusing to follow non-http redirect',
} as const;

function stripBrackets(hostname: string): string {
  return hostname.replace(IPV6_BRACKETS, '');
}

function isAllowedProtocol(url: URL): boolean {
  return ALLOWED_PROTOCOLS.has(url.protocol);
}

/** Whether an address is non-routable or private. Anything that is not an IP counts as private. */
export function isPrivateAddress(address: string): boolean {
  return safeNet.isPrivateAddress(address);
}

function resolveAll(hostname: string, resolve: safeNet.Resolver): Promise<{ address: string }[]> {
  return new Promise((ok, fail) =>
    resolve(hostname, { all: true }, (err, list) => (err ? fail(err) : ok(list ?? []))),
  );
}

/** Resolves the host and refuses any answer that maps to a private address. */
export async function assertHostIsPublic(
  rawHostname: string,
  resolve: safeNet.Resolver = safeNet.systemResolve,
): Promise<void> {
  assertHostSyntax(rawHostname);

  const hostname = stripBrackets(rawHostname);
  if (net.isIP(hostname)) {
    return;
  }

  const records = await resolveAll(hostname, resolve).catch(() => {
    throw new BadRequestException(MESSAGES.unresolved);
  });

  if (records.length === 0) {
    throw new BadRequestException(MESSAGES.unresolved);
  }
  if (records.some(({ address }) => isPrivateAddress(address))) {
    throw new BadRequestException(MESSAGES.privateAddress);
  }
}

/** The checks that need no DNS, run on every hop: internal names and IP literals. */
function assertHostSyntax(rawHostname: string): void {
  const hostname = stripBrackets(rawHostname);

  if (safeNet.isInternalHostname(hostname)) {
    throw new BadRequestException(MESSAGES.internalHost);
  }
  if (net.isIP(hostname) && isPrivateAddress(hostname)) {
    throw new BadRequestException(MESSAGES.privateAddress);
  }
}

function assertStandardPort(url: URL): void {
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new BadRequestException(MESSAGES.port);
  }
}

function assertHopIsAllowed(url: URL): void {
  if (!isAllowedProtocol(url)) {
    throw new BadRequestException(MESSAGES.protocol);
  }
  assertStandardPort(url);
  assertHostSyntax(url.hostname);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** A download filename from Content-Disposition (RFC 5987 first), else from the URL path. */
export function fileNameFrom(headers: Headers, url: URL): string | undefined {
  const disposition = headers.get('content-disposition');

  if (disposition) {
    const raw = FILENAME_STAR_PARAM.exec(disposition)?.[1] ?? FILENAME_PARAM.exec(disposition)?.[1];
    if (raw) {
      return safeDecode(raw);
    }
  }

  const lastSegment = url.pathname.split('/').filter(Boolean).pop();
  if (lastSegment?.includes('.')) {
    return safeDecode(lastSegment);
  }

  return undefined;
}

/** Strips characters that could break out of a Content-Disposition header. */
export function sanitizeHeaderFilename(name: string): string {
  return name.replace(HEADER_UNSAFE_CHARS, '').slice(0, MAX_HEADER_FILENAME_LENGTH) || DEFAULT_FILENAME;
}

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.startsWith(TRACKING_PARAM_PREFIX) || TRACKING_PARAMS.has(lower);
}

function stripTrackingParams(url: URL): void {
  const tracking = [...url.searchParams.keys()].filter(isTrackingParam);
  for (const key of tracking) {
    url.searchParams.delete(key);
  }

  if ([...url.searchParams.keys()].length === 0) {
    url.search = '';
  }
}

/**
 * Parses and normalizes a user-supplied URL: http/https only, standard
 * ports only, tracking parameters, credentials and fragment removed.
 * Purely syntactic, no DNS.
 */
export function normalizeUrl(raw: string): URL {
  if (!raw || typeof raw !== 'string') {
    throw new BadRequestException(MESSAGES.missingUrl);
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException(MESSAGES.invalidUrl);
  }

  if (!isAllowedProtocol(url)) {
    throw new BadRequestException(MESSAGES.protocol);
  }
  assertStandardPort(url);
  stripTrackingParams(url);

  url.username = '';
  url.password = '';
  url.hash = '';

  return url;
}

/** The shared gate: normalize, then confirm the host resolves to a public address. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  const url = normalizeUrl(raw);
  await assertHostIsPublic(url.hostname);
  return url;
}

export interface SafeFetchOptions {
  method?: safeNet.HttpMethod;
  headers?: Record<string, string>;
  /** Time to response headers, per hop. */
  timeoutMs?: number;
  maxRedirects?: number;
  /** No body chunk for this long ends the response. */
  bodyIdleMs?: number;
  /** The body streaming this long in total ends the response. */
  bodyTotalMs?: number;
  /** Test seam: the resolver used by the connection's `safeLookup`. */
  resolve?: safeNet.Resolver;
  /** Test seam: the request itself; it must resolve through the lookup it is given. */
  transport?: safeNet.Transport;
}

function isRedirect(status: number): boolean {
  return (
    status >= HTTP_STATUS.redirectMin &&
    status <= HTTP_STATUS.redirectMax &&
    status !== HTTP_STATUS.notModified
  );
}

function lowerCaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function resolveRedirect(location: string, base: URL): URL {
  let next: URL;
  try {
    next = new URL(location, base);
  } catch {
    throw new BadRequestException(MESSAGES.invalidRedirect);
  }

  if (!isAllowedProtocol(next)) {
    throw new BadRequestException(MESSAGES.nonHttpRedirect);
  }
  return next;
}

/**
 * Fetch with per-hop SSRF validation and a pinned connection.
 *
 * Every hop, the original URL and each redirect, has its scheme, port and
 * host syntax checked and is connected through `safeLookup`, so there is no
 * second DNS resolution to rebind. Redirects are followed manually: a
 * redirect into a private address is refused like a direct request.
 * The head has `timeoutMs`; the body has its own idle and total clocks.
 * The caller owns the returned body.
 */
export async function safeFetch(
  startUrl: URL,
  {
    method = 'GET',
    headers = {},
    timeoutMs = FETCH_TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS,
    bodyIdleMs = BODY_IDLE_MS,
    bodyTotalMs = BODY_TOTAL_MS,
    resolve,
    transport,
  }: SafeFetchOptions = {},
): Promise<Response> {
  const lookup = safeNet.safeLookup(resolve ?? safeNet.systemResolve);
  const send = transport ?? safeNet.nodeTransport;
  const requestHeaders = { 'user-agent': USER_AGENT, ...lowerCaseKeys(headers) };
  let url = startUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    assertHopIsAllowed(url);

    const abort = new AbortController();
    const headTimer = setTimeout(() => abort.abort(), timeoutMs);
    let response: IncomingMessage;

    try {
      response = await send(url, lookup, requestHeaders, abort.signal, method);
    } catch (err) {
      if (safeNet.isPrivateRefusal(err)) {
        throw new BadRequestException(MESSAGES.privateAddress);
      }
      throw err;
    } finally {
      clearTimeout(headTimer);
    }

    const status = response.statusCode ?? 0;
    const location = response.headers.location;

    if (isRedirect(status) && location) {
      response.destroy();
      if (hop >= maxRedirects) {
        throw new BadRequestException(MESSAGES.tooManyRedirects);
      }
      url = resolveRedirect(location, url);
      continue;
    }

    return toResponse(response, url, method, { idleMs: bodyIdleMs, totalMs: bodyTotalMs });
  }

  throw new BadRequestException(MESSAGES.tooManyRedirects);
}

/**
 * The node response as a WHATWG `Response`. `url` is the final URL after
 * redirects, which link previews resolve relative links against.
 */
function toResponse(
  response: IncomingMessage,
  url: URL,
  method: safeNet.HttpMethod,
  clocks: safeNet.BodyClocks,
): Response {
  const status = response.statusCode ?? 0;

  if (status < HTTP_STATUS.minValid || status > HTTP_STATUS.maxValid) {
    response.destroy();
    throw new BadRequestException(`Upstream answered status ${status}`);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(key, String(item));
    }
  }

  let body: ReadableStream<Uint8Array> | null = null;
  if (method === 'HEAD' || NULL_BODY_STATUSES.has(status)) {
    response.resume();
  } else {
    body = Readable.toWeb(safeNet.withBodyTimeouts(response, clocks)) as ReadableStream<Uint8Array>;
  }

  const result = new Response(body, { status, headers });
  Object.defineProperty(result, 'url', { value: url.toString() });
  return result;
}

const FRAME_ANCESTORS = 'frame-ancestors';
const FRAME_ANCESTORS_NONE = new Set(["'none'", 'none']);
const WILDCARD_SOURCE = '*';

export interface FramingDecision {
  blocked: boolean;
  reason?: string;
}

/**
 * Whether a page's headers allow it to be framed. We are never same-origin
 * with the embedded site, so any non-wildcard restriction blocks framing.
 */
export function decideFraming(headers: Headers): FramingDecision {
  const frameOptions = headers.get('x-frame-options')?.toLowerCase();
  if (frameOptions?.includes('deny')) {
    return { blocked: true, reason: 'X-Frame-Options: DENY' };
  }
  if (frameOptions?.includes('sameorigin')) {
    return { blocked: true, reason: 'X-Frame-Options: SAMEORIGIN' };
  }

  const directive = headers
    .get('content-security-policy')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(FRAME_ANCESTORS));

  if (directive) {
    const value = directive.slice(FRAME_ANCESTORS.length).trim().toLowerCase();

    if (FRAME_ANCESTORS_NONE.has(value)) {
      return { blocked: true, reason: 'frame-ancestors none' };
    }
    if (!value.split(/\s+/).includes(WILDCARD_SOURCE)) {
      return { blocked: true, reason: `frame-ancestors ${value}` };
    }
  }

  return { blocked: false };
}
