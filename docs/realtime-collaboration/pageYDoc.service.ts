import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';

import { PrismaService } from '../prisma/prisma.service';

/**
 * How long after the last change the stored state and the HTML mirror are
 * written. Readers of the mirror lag the live document by about this much;
 * editors are connected to the live document and never read the mirror.
 */
export const MATERIALISE_DEBOUNCE_MS = 2_500;

/** An empty room is kept this long, so a page reload does not rebuild it from the database. */
const EMPTY_ROOM_TTL_MS = 30_000;

export interface Room {
  doc: Y.Doc;
  /** Open sockets, so the room knows when it is empty. */
  clients: Set<unknown>;
  materialiseTimer: NodeJS.Timeout | null;
  reapTimer: NodeJS.Timeout | null;
  dirty: boolean;
}

/**
 * The live Yjs documents, one per open page, held in memory.
 *
 * Persistence is the safety net, not the transport: a room is loaded from
 * the database on first connect and written back on a debounce, so a
 * restart costs at most the debounce window.
 */
@Injectable()
export class PageYDocService {
  private readonly logger = new Logger(PageYDocService.name);
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly prisma: PrismaService) {}

  /** The room for a page, loading its stored state on first use. */
  async room(nodeId: string): Promise<Room> {
    const existing = this.rooms.get(nodeId);
    if (existing) {
      return existing;
    }

    const doc = new Y.Doc();
    const stored = await this.prisma.pageYDoc
      .findUnique({ where: { nodeId }, select: { state: true } })
      .catch(() => null);

    if (stored) {
      Y.applyUpdate(doc, new Uint8Array(stored.state));
    }

    const room: Room = {
      doc,
      clients: new Set(),
      materialiseTimer: null,
      reapTimer: null,
      dirty: false,
    };
    this.rooms.set(nodeId, room);

    return room;
  }

  /** Whether the page has ever been edited through the CRDT. */
  async isSeeded(nodeId: string): Promise<boolean> {
    if (this.rooms.has(nodeId)) {
      return true;
    }

    const row = await this.prisma.pageYDoc
      .findUnique({ where: { nodeId }, select: { nodeId: true } })
      .catch(() => null);

    return row !== null;
  }

  /**
   * Marks a room changed and schedules the write-back. Debounced, because
   * an update arrives on nearly every keystroke.
   */
  markDirty(nodeId: string, onMaterialise: (state: Uint8Array) => void): void {
    const room = this.rooms.get(nodeId);
    if (!room) {
      return;
    }

    room.dirty = true;
    if (room.materialiseTimer) {
      clearTimeout(room.materialiseTimer);
    }

    room.materialiseTimer = setTimeout(() => {
      room.materialiseTimer = null;
      const state = Y.encodeStateAsUpdate(room.doc);
      void this.persist(nodeId, state);
      room.dirty = false;
      onMaterialise(state);
    }, MATERIALISE_DEBOUNCE_MS);
  }

  /** A failed write costs one snapshot, not the document: every client still holds the full state. */
  private async persist(nodeId: string, state: Uint8Array): Promise<void> {
    try {
      const buffer = Buffer.from(state);
      await this.prisma.pageYDoc.upsert({
        where: { nodeId },
        create: { nodeId, state: buffer },
        update: { state: buffer },
      });
    } catch (err) {
      this.logger.warn(`could not persist Y state for ${nodeId}: ${String(err)}`);
    }
  }

  join(_nodeId: string, client: unknown, room: Room): void {
    room.clients.add(client);

    if (room.reapTimer) {
      clearTimeout(room.reapTimer);
      room.reapTimer = null;
    }
  }

  /** Drops a client; a pending write is flushed at once, and an empty room is reaped later. */
  leave(nodeId: string, client: unknown): void {
    const room = this.rooms.get(nodeId);
    if (!room) {
      return;
    }

    room.clients.delete(client);
    if (room.clients.size > 0) {
      return;
    }

    if (room.materialiseTimer) {
      clearTimeout(room.materialiseTimer);
      room.materialiseTimer = null;
      void this.persist(nodeId, Y.encodeStateAsUpdate(room.doc));
    }

    room.reapTimer = setTimeout(() => {
      if (room.clients.size === 0) {
        room.doc.destroy();
        this.rooms.delete(nodeId);
      }
    }, EMPTY_ROOM_TTL_MS);
  }

  /** Clears every timer and room so the process can exit. */
  disposeAll(): void {
    for (const room of this.rooms.values()) {
      if (room.materialiseTimer) clearTimeout(room.materialiseTimer);
      if (room.reapTimer) clearTimeout(room.reapTimer);
      room.doc.destroy();
    }

    this.rooms.clear();
  }
}
