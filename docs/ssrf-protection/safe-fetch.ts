import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { pipeline, Transform } from 'node:stream';

/**
 * The SSRF layer for every server-side fetch of a user- or model-supplied URL.
 *
 * The address that was checked is the address that is connected to.
 * Resolving a name, judging the answer and then handing the name to a
 * client that resolves it again leaves a time-of-check / time-of-use gap
 * that DNS rebinding walks through. Instead, the socket is opened with
 * `safeLookup` as its `lookup`: one resolution is judged, and the socket
 * connects to exactly that address.
 *
 * IP literals never go through `lookup`, so callers judge them separately
 * along with scheme, port and internal names.
 */

const IPV4 = 4;
const IPV6 = 6;

/** Non-public IPv4 ranges: private, loopback, link-local, CGNAT, documentation, multicast, reserved. */
const BLOCKED_IPV4_SUBNETS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const;

/** Non-public IPv6 ranges. `::/96` also covers `::`, `::1` and IPv4-compatible addresses. */
const BLOCKED_IPV6_SUBNETS = [
  ['::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96],
  ['100::', 64],
] as const;

const INTERNAL_HOSTNAME = 'localhost';
const INTERNAL_HOSTNAME_SUFFIXES = ['.localhost', '.internal', '.local'] as const;

const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
const HEX_RADIX = 16;

const IPV4_MAPPED_DOTTED = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/;
const IPV4_MAPPED_HEX = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;
const IPV6_BRACKETS = /^\[|\]$/g;
const TRAILING_DOT = /\.$/;

const BLOCKED = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) BLOCKED.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) BLOCKED.addSubnet(network, prefix, 'ipv6');

function stripBrackets(raw: string): string {
  return raw.replace(IPV6_BRACKETS, '');
}

/**
 * An address a request must never reach. IPv4-mapped IPv6 is judged as the
 * IPv4 it maps, in both its dotted and hex spellings. Anything that is not
 * an IP address is refused.
 */
export function isPrivateAddress(raw: string): boolean {
  const address = stripBrackets(raw);
  const family = isIP(address);

  if (family === IPV4) {
    return BLOCKED.check(address, 'ipv4');
  }

  if (family === IPV6) {
    const mapped = mappedIpv4(address);
    return mapped ? BLOCKED.check(mapped, 'ipv4') : BLOCKED.check(address, 'ipv6');
  }

  return true;
}

/** `::ffff:a.b.c.d` or `::ffff:XXXX:YYYY` → `a.b.c.d`; null for anything else. */
function mappedIpv4(address: string): string | null {
  const lower = address.toLowerCase();

  const dotted = IPV4_MAPPED_DOTTED.exec(lower);
  if (dotted) {
    return dotted[1];
  }

  const hex = IPV4_MAPPED_HEX.exec(lower);
  if (!hex) {
    return null;
  }

  const high = parseInt(hex[1], HEX_RADIX);
  const low = parseInt(hex[2], HEX_RADIX);
  return [high >> BYTE_BITS, high & BYTE_MASK, low >> BYTE_BITS, low & BYTE_MASK].join('.');
}

/** Names that are internal by definition, whatever a resolver answers for them. */
export function isInternalHostname(raw: string): boolean {
  const hostname = stripBrackets(raw).toLowerCase().replace(TRAILING_DOT, '');
  return (
    hostname === INTERNAL_HOSTNAME ||
    INTERNAL_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

/** The resolver behind `safeLookup`: callback-style `dns.lookup` with `{ all: true }`. */
export type Resolver = (
  hostname: string,
  options: { all: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/** The system resolver, exported so tests can replace it. */
export const systemResolve: Resolver = (hostname, options, callback) =>
  dnsLookup(hostname, options, callback);

/** The error code of a refused connection, whatever error class wraps it. */
export const EPRIVATE = 'EPRIVATE';

export function isPrivateRefusal(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as NodeJS.ErrnoException).code === EPRIVATE;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * The lookup every connection uses: resolve once, refuse the whole answer
 * if any address in it is private or if there is no address, and hand the
 * socket exactly what was checked.
 */
export function safeLookup(resolve: Resolver = systemResolve): LookupFunction {
  return (hostname: string, options: unknown, callback: LookupCallback) => {
    const wantsAll = typeof options === 'object' && options !== null && Boolean((options as { all?: boolean }).all);

    const refuse = (message: string) => {
      const error = new Error(message) as NodeJS.ErrnoException;
      error.code = EPRIVATE;
      callback(error, '', 0);
    };

    if (isInternalHostname(hostname)) {
      return refuse(`${hostname} is an internal name`);
    }

    resolve(hostname, { all: true }, (err, addresses) => {
      if (err) {
        return callback(err, '', 0);
      }

      const list = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0) {
        return refuse(`${hostname} resolves to nothing`);
      }
      if (list.some(({ address }) => isPrivateAddress(address))) {
        return refuse(`${hostname} resolves to a private address`);
      }

      if (wantsAll) {
        return callback(null, list);
      }
      return callback(null, list[0].address, list[0].family);
    });
  };
}

export type HttpMethod = 'GET' | 'HEAD';

/**
 * One request. It must resolve the host through the given `lookup`, as the
 * real socket does, so a test transport meets the same refusal. Resolves on
 * the response head.
 */
export type Transport = (
  url: URL,
  lookup: LookupFunction,
  headers: Record<string, string>,
  signal: AbortSignal,
  method?: HttpMethod,
) => Promise<IncomingMessage>;

/**
 * Node's http/https with the safe lookup and no agent: a pooled keep-alive
 * socket must never carry a request past the check that would refuse it.
 */
export const nodeTransport: Transport = (url, lookup, headers, signal, method = 'GET') =>
  new Promise((resolve, reject) => {
    const send = url.protocol === 'http:' ? httpRequest : httpsRequest;
    const request = send(url, { method, lookup, signal, headers, agent: false }, resolve);
    request.on('error', reject);
    request.end();
  });

export type BodyTimeoutKind = 'idle' | 'total';

/** A response body that stalled or ran too long. */
export class BodyTimeout extends Error {
  constructor(readonly kind: BodyTimeoutKind) {
    super(kind === 'idle' ? 'upstream body stalled' : 'upstream body took too long');
    this.name = 'BodyTimeout';
  }
}

export interface BodyClocks {
  idleMs: number;
  totalMs: number;
}

/**
 * A response body with a clock on it: no chunk for `idleMs`, or `totalMs`
 * since the head arrived, destroys it with `BodyTimeout`. Without it, a
 * server that sends headers and then trickles holds the socket forever.
 * The idle clock re-arms on every chunk read, so a consumer that stops
 * reading also counts as idle.
 */
export function withBodyTimeouts(body: IncomingMessage, { idleMs, totalMs }: BodyClocks): Transform {
  let idleTimer: NodeJS.Timeout | undefined;

  const guard = new Transform({
    transform(chunk, _encoding, done) {
      armIdle();
      done(null, chunk);
    },
  });

  const fail = (kind: BodyTimeoutKind) => {
    const error = new BodyTimeout(kind);
    body.destroy(error);
    guard.destroy(error);
  };

  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fail('idle'), idleMs);
  };

  const totalTimer = setTimeout(() => fail('total'), totalMs);

  const clearTimers = () => {
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
  };

  armIdle();
  pipeline(body, guard, clearTimers);
  guard.once('close', clearTimers);

  return guard;
}
