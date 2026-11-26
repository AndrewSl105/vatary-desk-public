jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import type { IncomingMessage } from 'http';

import { issueCrdtTicket, readCrdtTicket, SpentTickets, TICKET_TTL_MS } from './crdtTicket';
import { MAX_WS_MESSAGE_BYTES, originAllowed, PAGE_ACCESS_ENDED, RECHECK_MS } from './pageCrdt.gateway';
import { PageCrdtAuth } from './pageCrdt.auth';
import type { AccessResolver } from '../access/access-resolver.service';
import { toAccess, type AccessLevel } from '../contracts/capabilities';

/**
 * The page CRDT socket: one-time tickets instead of a token in the URL,
 * an Origin check, a message size cap, and access re-checked while open.
 */

const ONE_HOUR_MS = 3_600_000;
const sessionEnd = () => Date.now() + ONE_HOUR_MS;
const upgradeRequest = (query: string) => ({ url: `/api/pages/n1/ydoc?${query}` }) as IncomingMessage;
const ticketQuery = (pid: string, node: string) =>
  `ticket=${encodeURIComponent(issueCrdtTicket(pid, node, sessionEnd()))}`;

describe('CRDT tickets', () => {
  it('open one page, once, within their lifetime', () => {
    const ticket = issueCrdtTicket('p1', 'n1', sessionEnd());

    expect(readCrdtTicket(ticket, 'n1')?.pid).toBe('p1');
    expect(readCrdtTicket(ticket, 'n2')).toBeNull();
    expect(readCrdtTicket(ticket, 'n1', Date.now() + TICKET_TTL_MS + 1)).toBeNull();

    const spent = new SpentTickets();
    const claims = readCrdtTicket(ticket, 'n1')!;
    expect(spent.spend(claims)).toBe(true);
    expect(spent.spend(claims)).toBe(false);
  });

  it('refuse a forged or altered ticket', () => {
    const [payload, signature] = issueCrdtTicket('p1', 'n1', sessionEnd()).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, pid: 'attacker' })).toString('base64url');

    expect(readCrdtTicket(`${forged}.${signature}`, 'n1')).toBeNull();
    expect(readCrdtTicket('not-a-ticket', 'n1')).toBeNull();
  });
});

describe('the socket upgrade', () => {
  const level = { value: 'EDITOR' as AccessLevel | null };
  const auth = new PageCrdtAuth({
    accessOne: () => Promise.resolve(level.value && toAccess(level.value)),
  } as unknown as AccessResolver);

  it('accepts a ticket once and refuses a replay', async () => {
    level.value = 'EDITOR';
    const query = ticketQuery('p1', 'n1');

    expect(await auth.authorize(upgradeRequest(query), 'n1')).toMatchObject({ profileId: 'p1' });
    expect(await auth.authorize(upgradeRequest(query), 'n1')).toBeNull();
  });

  it('refuses a token in the URL', async () => {
    level.value = 'EDITOR';
    expect(await auth.authorize(upgradeRequest('token=session-jwt'), 'n1')).toBeNull();
  });

  it('checks access again at connect and on every re-check', async () => {
    level.value = 'VIEWER';
    expect(await auth.authorize(upgradeRequest(ticketQuery('p1', 'n1')), 'n1')).toBeNull();
    expect(await auth.stillAllowed('p1', 'n1')).toBe(false);

    level.value = 'EDITOR';
    expect(await auth.stillAllowed('p1', 'n1')).toBe(true);
  });

  it("admits only the app's own origins", () => {
    expect(originAllowed('http://localhost:5173', undefined)).toBe(true);
    expect(originAllowed('https://evil.example', undefined)).toBe(false);
    expect(originAllowed(undefined, undefined)).toBe(false);
    expect(
      originAllowed('https://desk.example.test', 'https://desk.example.test, https://staging.example.test'),
    ).toBe(true);
  });

  it('keeps the limits in place', () => {
    expect(MAX_WS_MESSAGE_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(RECHECK_MS).toBeLessThanOrEqual(60_000);
    expect(PAGE_ACCESS_ENDED).toBe(4403);
  });
});
