jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import * as Y from 'yjs';
import {
  PageYDocService,
  MATERIALISE_DEBOUNCE_MS,
} from './pageYDoc.service';
import type { PrismaService } from '../prisma/prisma.service';

function build(stored: Uint8Array | null = null) {
  const disk = new Map<string, Buffer>();
  if (stored) disk.set('n1', Buffer.from(stored));
  const prisma = {
    pageYDoc: {
      findUnique: jest.fn(({ where }: { where: { nodeId: string } }) =>
        Promise.resolve(
          disk.has(where.nodeId)
            ? { state: disk.get(where.nodeId), nodeId: where.nodeId }
            : null,
        ),
      ),
      upsert: jest.fn(
        ({
          where,
          create,
        }: {
          where: { nodeId: string };
          create: { state: Buffer };
        }) => {
          disk.set(where.nodeId, create.state);
          return Promise.resolve({});
        },
      ),
    },
  } as unknown as PrismaService;
  return { service: new PageYDocService(prisma), disk, prisma };
}

/** A Y.Doc with one line of text in it. */
function seeded(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText('body').insert(0, text);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

describe('PageYDocService', () => {
  afterEach(() => jest.useRealTimers());

  it('loads a room from its stored state', async () => {
    const { service } = build(seeded('hello'));
    const room = await service.room('n1');
    expect(room.doc.getText('body').toString()).toBe('hello');
    service.disposeAll();
  });

  it('keeps one room per page, rather than one per connection', async () => {
    const { service, prisma } = build(seeded('x'));
    const a = await service.room('n1');
    const b = await service.room('n1');
    // Two editors of the same page must share a document, or they are
    // not collaborating at all.
    expect(a).toBe(b);
    expect(prisma.pageYDoc.findUnique).toHaveBeenCalledTimes(1);
    service.disposeAll();
  });

  /**
   * A Yjs update arrives on roughly every keystroke. Writing each one
   * would be a row write plus an HTML re-derivation per character.
   */
  it('writes back on a debounce, not per update', async () => {
    jest.useFakeTimers();
    const { service, disk } = build();
    const room = await service.room('n1');
    const onMaterialise = jest.fn();

    for (const ch of 'hello') {
      room.doc.getText('body').insert(room.doc.getText('body').length, ch);
      service.markDirty('n1', onMaterialise);
    }
    expect(disk.has('n1')).toBe(false);
    expect(onMaterialise).not.toHaveBeenCalled();

    jest.advanceTimersByTime(MATERIALISE_DEBOUNCE_MS);
    await Promise.resolve();
    expect(onMaterialise).toHaveBeenCalledTimes(1);
    service.disposeAll();
  });

  /**
   * The window between the last keystroke and the debounce is exactly
   * when somebody closes the tab. Dropping the pending write there would
   * lose the last few seconds of everybody's typing.
   */
  it('flushes a pending write when the last client leaves', async () => {
    jest.useFakeTimers();
    const { service, disk } = build();
    const room = await service.room('n1');
    const client = {};
    service.join('n1', client, room);
    room.doc.getText('body').insert(0, 'unsaved');
    service.markDirty('n1', jest.fn());

    service.leave('n1', client);
    await Promise.resolve();
    expect(disk.has('n1')).toBe(true);

    const restored = new Y.Doc();
    Y.applyUpdate(restored, new Uint8Array(disk.get('n1') as Buffer));
    expect(restored.getText('body').toString()).toBe('unsaved');
    restored.destroy();
    service.disposeAll();
  });

  it('a failed write costs the snapshot, never the document', async () => {
    jest.useFakeTimers();
    const prisma = {
      pageYDoc: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockRejectedValue(new Error('down')),
      },
    } as unknown as PrismaService;
    const service = new PageYDocService(prisma);
    const room = await service.room('n1');
    room.doc.getText('body').insert(0, 'still here');
    service.markDirty('n1', jest.fn());

    jest.advanceTimersByTime(MATERIALISE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    // Every connected client still holds the full state; the next change
    // writes again.
    expect(room.doc.getText('body').toString()).toBe('still here');
    service.disposeAll();
  });
});
