import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'stream';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import { PageYDocService } from './pageYDoc.service';
import { PageCrdtAuth } from './pageCrdt.auth';
import { PAGE_AI_WRITING, PAGE_CLIENT_BUILD, PAGE_CLIENT_UPDATE_REQUIRED } from '../contracts/pageClientBuild';
import { ITEM_LOCK_GUARD, type ItemLockGuard } from '../ai/compose/item-lock-guard';

/** Message tags: the two y-protocols ones, and our own request to write the HTML mirror. */
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_MATERIALISE = 2;

/** A reply that holds only its tag carries nothing to send. */
const EMPTY_REPLY_LENGTH = 1;

const URL_BASE = 'http://localhost';
const SOCKET_PATH = /^\/api\/pages\/([A-Za-z0-9_-]{1,64})\/ydoc$/;
const BUILD_PARAM = 'build';
/** A client that declares no build predates the build gate. */
const LEGACY_CLIENT_BUILD = 1;

const BYTES_PER_MEGABYTE = 1024 * 1024;
/** Inbound message cap: a large paste fits, a flood does not. */
export const MAX_WS_MESSAGE_BYTES = 4 * BYTES_PER_MEGABYTE;
/** How often an open socket's access is checked again. */
export const RECHECK_MS = 60_000;
/** Close code: access was revoked or the session ended. */
export const PAGE_ACCESS_ENDED = 4403;

const DEV_CLIENT_ORIGIN = 'http://localhost:5173';
const TRAILING_SLASHES = /\/+$/;

const HTTP_FORBIDDEN = 'HTTP/1.1 403 Forbidden\r\n\r\n';
const HTTP_UNAUTHORIZED = 'HTTP/1.1 401 Unauthorized\r\n\r\n';
const ITEM_LOCKED_CODE = 'ITEM_LOCKED';

/** The oldest page-editor build admitted to a room; overridable for a client rollback. */
export function minPageClientBuild(): number {
  const configured = Number(process.env.MIN_PAGE_CLIENT_BUILD);
  return Number.isInteger(configured) && configured > 0 ? configured : PAGE_CLIENT_BUILD;
}

/** The build a connecting client declared; the legacy build when absent or invalid. */
export function clientBuildOf(request: IncomingMessage): number {
  const raw = new URL(request.url ?? '', URL_BASE).searchParams.get(BUILD_PARAM);
  const build = Number(raw);
  return raw !== null && Number.isInteger(build) && build > 0 ? build : LEGACY_CLIENT_BUILD;
}

/** Whether the upgrade comes from one of the app's own origins. A WebSocket is not covered by CORS. */
export function originAllowed(origin: string | undefined, configured = process.env.CLIENT_ORIGIN): boolean {
  if (!origin) {
    return false;
  }

  const allowed = (configured?.trim() ? configured : DEV_CLIENT_ORIGIN)
    .split(',')
    .map((entry) => entry.trim().replace(TRAILING_SLASHES, ''))
    .filter(Boolean);

  return allowed.includes(origin.replace(TRAILING_SLASHES, ''));
}

function rejectUpgrade(socket: Duplex, response: string): void {
  socket.write(response);
  socket.destroy();
}

function frame(tag: number, write?: (encoder: encoding.Encoder) => void): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, tag);
  write?.(encoder);
  return encoding.toUint8Array(encoder);
}

interface Session {
  socket: WebSocket;
  nodeId: string;
  profileId: string;
  /** This client writes the HTML mirror. Exactly one per room. */
  materialiser: boolean;
}

/**
 * The WebSocket gateway for page CRDT sync. Yjs needs a bidirectional
 * channel, so this is a WebSocket attached to the existing HTTP server.
 *
 * Before a socket joins a room it must pass, in order: the origin check,
 * a one-time ticket, the client build gate and the AI write lock. Access
 * is re-checked every `RECHECK_MS` while the socket is open.
 */
@Injectable()
export class PageCrdtGateway implements OnModuleDestroy {
  private readonly logger = new Logger(PageCrdtGateway.name);
  private wss: WebSocketServer | null = null;
  private readonly sessions = new Map<WebSocket, Session>();
  private readonly awareness = new Map<string, awarenessProtocol.Awareness>();

  constructor(
    private readonly docs: PageYDocService,
    private readonly auth: PageCrdtAuth,
    @Optional() @Inject(ITEM_LOCK_GUARD) private readonly aiLocks?: ItemLockGuard,
  ) {}

  /** Whether an AI run currently holds the page's write lock. */
  private async aiWriting(nodeId: string): Promise<boolean> {
    if (!this.aiLocks) {
      return false;
    }

    try {
      await this.aiLocks.assertWritable('page', nodeId);
      return false;
    } catch (err) {
      const response = (err as { getResponse?: () => { code?: string } }).getResponse?.();
      return response?.code === ITEM_LOCKED_CODE;
    }
  }

  /** Attaches the gateway to the HTTP server's upgrade event. */
  attach(server: HttpServer): void {
    if (this.wss) {
      return;
    }

    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_MESSAGE_BYTES });
    this.wss = wss;

    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const match = SOCKET_PATH.exec(new URL(request.url ?? '', URL_BASE).pathname);
      if (!match) {
        return;
      }

      const nodeId = match[1];

      if (!originAllowed(request.headers.origin)) {
        rejectUpgrade(socket, HTTP_FORBIDDEN);
        return;
      }

      void this.admit(wss, request, socket, head, nodeId);
    });
  }

  private async admit(
    wss: WebSocketServer,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    nodeId: string,
  ): Promise<void> {
    const identity = await this.auth.authorize(request, nodeId);
    if (!identity?.profileId) {
      rejectUpgrade(socket, HTTP_UNAUTHORIZED);
      return;
    }

    const closeWith = (code: number, reason: string) =>
      wss.handleUpgrade(request, socket, head, (ws) => ws.close(code, reason));

    const build = clientBuildOf(request);
    const minBuild = minPageClientBuild();
    if (build < minBuild) {
      this.logger.warn(`refused page client build ${build} < ${minBuild} for node ${nodeId}`);
      closeWith(PAGE_CLIENT_UPDATE_REQUIRED, 'update-required');
      return;
    }

    if (await this.aiWriting(nodeId)) {
      closeWith(PAGE_AI_WRITING, 'ai-writing');
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      void this.onConnection(ws, nodeId, identity.profileId, identity.until);
    });
  }

  private watchAccess(socket: WebSocket, nodeId: string, profileId: string, until: number): NodeJS.Timeout {
    const timer = setInterval(() => {
      void (async () => {
        const expired = Date.now() >= until;
        if (expired || !(await this.auth.stillAllowed(profileId, nodeId))) {
          socket.close(PAGE_ACCESS_ENDED, 'access-ended');
        }
      })();
    }, RECHECK_MS);

    timer.unref?.();
    return timer;
  }

  private awarenessFor(nodeId: string, doc: awarenessProtocol.Awareness['doc']): awarenessProtocol.Awareness {
    let awareness = this.awareness.get(nodeId);
    if (!awareness) {
      awareness = new awarenessProtocol.Awareness(doc);
      this.awareness.set(nodeId, awareness);
    }
    return awareness;
  }

  private broadcast(nodeId: string, payload: Uint8Array, except: unknown): void {
    for (const [ws, session] of this.sessions) {
      if (session.nodeId === nodeId && ws !== except) {
        this.send(ws, payload);
      }
    }
  }

  private async onConnection(
    socket: WebSocket,
    nodeId: string,
    profileId: string,
    until: number = Number.MAX_SAFE_INTEGER,
  ): Promise<void> {
    const accessTimer = this.watchAccess(socket, nodeId, profileId, until);

    const room = await this.docs.room(nodeId);
    this.docs.join(nodeId, socket, room);
    const awareness = this.awarenessFor(nodeId, room.doc);

    const isFirstInRoom = ![...this.sessions.values()].some((session) => session.nodeId === nodeId);
    this.sessions.set(socket, { socket, nodeId, profileId, materialiser: isFirstInRoom });

    this.send(socket, frame(MESSAGE_SYNC, (encoder) => syncProtocol.writeSyncStep1(encoder, room.doc)));

    const states = awareness.getStates();
    if (states.size > 0) {
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [...states.keys()]);
      this.send(socket, frame(MESSAGE_AWARENESS, (encoder) => encoding.writeVarUint8Array(encoder, update)));
    }

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      this.broadcast(nodeId, frame(MESSAGE_SYNC, (encoder) => syncProtocol.writeUpdate(encoder, update)), origin);
      this.docs.markDirty(nodeId, () => this.requestMaterialise(nodeId));
    };
    room.doc.on('update', onDocUpdate);

    const onAwareness = ({ added, updated, removed }: Record<string, number[]>, origin: unknown) => {
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) {
        return;
      }
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
      this.broadcast(nodeId, frame(MESSAGE_AWARENESS, (encoder) => encoding.writeVarUint8Array(encoder, update)), origin);
    };
    awareness.on('update', onAwareness);

    socket.on('message', (raw: ArrayBuffer | Buffer) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(raw as ArrayBuffer));
        const tag = decoding.readVarUint(decoder);

        if (tag === MESSAGE_SYNC) {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, reply, room.doc, socket);
          if (encoding.length(reply) > EMPTY_REPLY_LENGTH) {
            this.send(socket, encoding.toUint8Array(reply));
          }
        } else if (tag === MESSAGE_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), socket);
        }
      } catch (err) {
        this.logger.warn(`bad frame on ${nodeId}: ${String(err)}`);
      }
    });

    const teardown = () => {
      clearInterval(accessTimer);
      room.doc.off('update', onDocUpdate);
      awareness.off('update', onAwareness);
      awarenessProtocol.removeAwarenessStates(
        awareness,
        [...awareness.getStates().keys()].filter((id) => id === awareness.doc.clientID),
        socket,
      );

      const wasMaterialiser = this.sessions.get(socket)?.materialiser;
      this.sessions.delete(socket);
      this.docs.leave(nodeId, socket);

      if (wasMaterialiser) {
        const successor = [...this.sessions.values()].find((session) => session.nodeId === nodeId);
        if (successor) successor.materialiser = true;
      }

      if (this.awareness.get(nodeId)?.getStates().size === 0) {
        this.awareness.get(nodeId)?.destroy();
        this.awareness.delete(nodeId);
      }
    };

    socket.on('close', teardown);
    socket.on('error', teardown);
  }

  /**
   * Asks one client to write the page's HTML mirror. The server owns the
   * timing; the client owns the content, because the editor that owns the
   * schema is the only code that should serialise it.
   */
  private requestMaterialise(nodeId: string): void {
    const target = [...this.sessions.values()].find(
      (session) => session.nodeId === nodeId && session.materialiser,
    );
    if (target) {
      this.send(target.socket, frame(MESSAGE_MATERIALISE));
    }
  }

  private send(socket: WebSocket, data: Uint8Array): void {
    if (socket.readyState !== socket.OPEN) {
      return;
    }

    try {
      socket.send(data);
    } catch {
      socket.close();
    }
  }

  onModuleDestroy(): void {
    for (const ws of this.sessions.keys()) ws.close();
    this.sessions.clear();

    for (const awareness of this.awareness.values()) awareness.destroy();
    this.awareness.clear();

    this.wss?.close();
    this.docs.disposeAll();
  }
}
