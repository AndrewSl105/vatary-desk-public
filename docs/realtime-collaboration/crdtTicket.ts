import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { impersonationSecret } from '../auth/impersonation-token';

/**
 * A one-time pass for the page CRDT socket.
 *
 * A browser cannot set headers on a WebSocket upgrade, so the session token
 * must not travel in the socket URL, where proxies and access logs would
 * keep it. The client requests a ticket over HTTPS with its token in a
 * header, and the socket URL carries the ticket instead: valid for one
 * page, once, and only for `TICKET_TTL_MS`.
 *
 * Tickets are HMAC-signed rather than stored, so the instance that issues
 * one and the instance that accepts it can be different processes.
 */
export const TICKET_TTL_MS = 60_000;

const NONCE_BYTES = 12;
const KEY_DERIVATION_LABEL = 'vatary-crdt-ticket\0';
const HASH_ALGORITHM = 'sha256';
const SEPARATOR = '.';

export interface CrdtTicket {
  /** The profile it was issued to. */
  pid: string;
  /** The page it opens. */
  node: string;
  /** Expiry of the ticket itself (ms). */
  exp: number;
  /** Expiry of the session it was issued for (ms); the socket closes then. */
  tokExp: number;
  nonce: string;
}

function signingKey(): Buffer {
  return createHash(HASH_ALGORITHM).update(KEY_DERIVATION_LABEL).update(impersonationSecret()).digest();
}

function sign(payload: string): Buffer {
  return createHmac(HASH_ALGORITHM, signingKey()).update(payload).digest();
}

export function issueCrdtTicket(pid: string, node: string, tokExp: number, now = Date.now()): string {
  const claims: CrdtTicket = {
    pid,
    node,
    exp: now + TICKET_TTL_MS,
    tokExp,
    nonce: randomBytes(NONCE_BYTES).toString('base64url'),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}${SEPARATOR}${sign(payload).toString('base64url')}`;
}

/** The ticket's claims when it is genuine, unexpired and issued for `node`; otherwise null. */
export function readCrdtTicket(ticket: string, node: string, now = Date.now()): CrdtTicket | null {
  const [payload, signature] = ticket.split(SEPARATOR, 2);
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CrdtTicket;
    const isValid = claims.node === node && typeof claims.exp === 'number' && claims.exp >= now;
    return isValid ? claims : null;
  } catch {
    return null;
  }
}

/** Nonces already used on this instance, kept until their tickets expire. */
export class SpentTickets {
  private readonly spent = new Map<string, number>();

  /** True the first time a nonce is presented, false on every replay. */
  spend(ticket: CrdtTicket, now = Date.now()): boolean {
    for (const [nonce, expiresAt] of this.spent) {
      if (expiresAt < now) this.spent.delete(nonce);
    }

    if (this.spent.has(ticket.nonce)) {
      return false;
    }

    this.spent.set(ticket.nonce, ticket.exp);
    return true;
  }
}
