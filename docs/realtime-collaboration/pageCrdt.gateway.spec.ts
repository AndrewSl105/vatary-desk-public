jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./pageCrdt.auth', () => ({ PageCrdtAuth: class {} }));
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import { PageCrdtGateway } from './pageCrdt.gateway';
import { PAGE_AI_WRITING, PAGE_CLIENT_BUILD, PAGE_CLIENT_UPDATE_REQUIRED } from '../contracts/pageClientBuild';
import { ConflictException } from '@nestjs/common';

/**
 * The client-build gate, over a real socket: an old build never joins the
 * room and nothing it sends reaches the document; a current build syncs
 * and writes.
 */
describe('PageCrdtGateway — client build gate', () => {
  let server: Server;
  let gateway: PageCrdtGateway;
  let port: number;
  const doc = new Y.Doc();
  const joined: unknown[] = [];

  beforeAll(async () => {
    const docs = {
      room: async () => ({ doc }),
      join: (_n: string, client: unknown) => joined.push(client),
      leave: () => undefined,
      markDirty: () => undefined,
      disposeAll: () => undefined,
    };
    const auth = { authorize: () => Promise.resolve({ profileId: 'profile-1', until: Date.now() + 3_600_000 }), stillAllowed: () => Promise.resolve(true) };
    gateway = new PageCrdtGateway(docs as never, auth as never);
    server = createServer();
    gateway.attach(server);
    await new Promise<void>((r) => server.listen(0, r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    gateway.onModuleDestroy();
    await new Promise((r) => server.close(r));
  });

  const open = (query: string) => new WebSocket(`ws://127.0.0.1:${port}/api/pages/node1/ydoc?ticket=t${query}`, { origin: 'http://localhost:5173' });

  /** A y-protocols update that inserts `text` into the shared doc. */
  const updateFrame = (text: string) => {
    const mine = new Y.Doc();
    mine.getText('t').insert(0, text);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    syncProtocol.writeUpdate(enc, Y.encodeStateAsUpdate(mine));
    return encoding.toUint8Array(enc);
  };

  it('closes a client with no build (every build before the gate) with "update required", before it joins', async () => {
    const ws = open('');
    ws.on('open', () => ws.send(updateFrame('from an old build')));
    const code = await new Promise<number>((r) => ws.on('close', (c) => r(c)));
    expect(code).toBe(PAGE_CLIENT_UPDATE_REQUIRED);
    expect(joined).toHaveLength(0);
    expect(doc.getText('t').toString()).not.toContain('old build');
  });

  it('closes a client that declares an older build', async () => {
    const ws = open(`&build=${PAGE_CLIENT_BUILD - 1}`);
    const code = await new Promise<number>((r) => ws.on('close', (c) => r(c)));
    expect(code).toBe(PAGE_CLIENT_UPDATE_REQUIRED);
    expect(joined).toHaveLength(0);
  });

  it('admits the current build: it gets the sync and its writes land', async () => {
    const ws = open(`&build=${PAGE_CLIENT_BUILD}`);
    const first = await new Promise<Buffer>((r) => ws.once('message', (d) => r(d as Buffer)));
    expect(first[0]).toBe(0);
    ws.send(updateFrame('from the current build'));
    await new Promise((r) => setTimeout(r, 50));
    expect(doc.getText('t').toString()).toContain('current build');
    expect(joined).toHaveLength(1);
    ws.close();
  });

  it('MIN_PAGE_CLIENT_BUILD lowers the bar (a client rollback)', async () => {
    process.env.MIN_PAGE_CLIENT_BUILD = '1';
    try {
      const ws = open('');
      const first = await new Promise<Buffer>((r) => ws.once('message', (d) => r(d as Buffer)));
      expect(first[0]).toBe(0);
      ws.close();
    } finally {
      delete process.env.MIN_PAGE_CLIENT_BUILD;
    }
  });
});

/**
 * A page an AI run is writing: no room until the run ends, or the first
 * client would seed it with the half-written page.
 */
describe('PageCrdtGateway — a page an AI run is writing', () => {
  let server: Server;
  let gateway: PageCrdtGateway;
  let port: number;
  const doc = new Y.Doc();
  const joined: unknown[] = [];
  let writing = true;

  beforeAll(async () => {
    const docs = { room: async () => ({ doc }), join: (_n: string, c: unknown) => joined.push(c), leave: () => undefined, markDirty: () => undefined, disposeAll: () => undefined };
    const auth = { authorize: () => Promise.resolve({ profileId: 'profile-1', until: Date.now() + 3_600_000 }), stillAllowed: () => Promise.resolve(true) };
    const aiLocks = { assertWritable: async () => (writing ? Promise.reject(new ConflictException({ code: 'ITEM_LOCKED', runId: 'run-1' })) : undefined) };
    gateway = new PageCrdtGateway(docs as never, auth as never, aiLocks);
    server = createServer();
    gateway.attach(server);
    await new Promise<void>((r) => server.listen(0, r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    gateway.onModuleDestroy();
    await new Promise((r) => server.close(r));
  });

  const open = () => new WebSocket(`ws://127.0.0.1:${port}/api/pages/node1/ydoc?ticket=t&build=${PAGE_CLIENT_BUILD}`, { origin: 'http://localhost:5173' });

  it('closes with "ai-writing" while the run holds the page, before any room is joined', async () => {
    const ws = open();
    const code = await new Promise<number>((r) => ws.on('close', (c) => r(c)));
    expect(code).toBe(PAGE_AI_WRITING);
    expect(joined).toHaveLength(0);
  });

  it('admits the same client once the run let go', async () => {
    writing = false;
    const ws = open();
    const first = await new Promise<Buffer>((r) => ws.once('message', (d) => r(d as Buffer)));
    expect(first[0]).toBe(0);
    expect(joined).toHaveLength(1);
    ws.close();
  });
});
