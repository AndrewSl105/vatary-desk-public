import { Injectable, Logger } from '@nestjs/common';
import type { IncomingMessage } from 'http';

import { AccessResolver } from '../access/access-resolver.service';
import { can } from '../contracts/capabilities';
import { readCrdtTicket, SpentTickets } from './crdtTicket';

const URL_BASE = 'http://localhost';
const TICKET_PARAM = 'ticket';

export interface CrdtSocketIdentity {
  profileId: string;
  /** When the caller's session ends (ms); the socket closes then. */
  until: number;
}

/**
 * Who may open a page's CRDT socket.
 *
 * The socket can write, so it requires edit access to the page, checked
 * against the current permissions both at connect time and periodically
 * afterwards. Viewers read the stored page instead.
 */
@Injectable()
export class PageCrdtAuth {
  private readonly logger = new Logger(PageCrdtAuth.name);
  private readonly spent = new SpentTickets();

  constructor(private readonly resolver: AccessResolver) {}

  /** The caller and when their session ends, or null to refuse the upgrade. */
  async authorize(request: IncomingMessage, nodeId: string): Promise<CrdtSocketIdentity | null> {
    try {
      const ticket = new URL(request.url ?? '', URL_BASE).searchParams.get(TICKET_PARAM);
      if (!ticket) {
        return null;
      }

      const claims = readCrdtTicket(ticket, nodeId);
      if (!claims || !this.spent.spend(claims)) {
        return null;
      }

      if (!(await this.stillAllowed(claims.pid, nodeId))) {
        return null;
      }

      return { profileId: claims.pid, until: claims.tokExp };
    } catch (err) {
      this.logger.warn(`ydoc upgrade refused for ${nodeId}: ${String(err)}`);
      return null;
    }
  }

  /** Whether this profile may still write the page, read fresh so a revoke applies at once. */
  async stillAllowed(profileId: string, nodeId: string): Promise<boolean> {
    try {
      const level = await this.resolver.accessOne(profileId, 'NODE', nodeId, { freshRole: true });
      return can(level, 'edit_content', 'PAGE');
    } catch {
      return false;
    }
  }
}
