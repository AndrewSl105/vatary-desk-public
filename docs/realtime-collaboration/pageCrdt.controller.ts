import { Controller, ForbiddenException, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/auth-user.decorator';
import { OrgIdHeader } from '../auth/org-id.decorator';
import { AccessResolver } from '../access/access-resolver.service';
import { can } from '../contracts/capabilities';
import { OwnerResolver } from '../iam';
import { issueCrdtTicket, TICKET_TTL_MS } from './crdtTicket';

const MS_PER_SECOND = 1_000;
/** Session lifetime assumed when the token carries no expiry. */
const DEFAULT_SESSION_TTL_MS = 60 * 60 * MS_PER_SECOND;

function sessionExpiry(user: AuthUser): number {
  const exp = user.raw?.exp;
  return typeof exp === 'number' ? exp * MS_PER_SECOND : Date.now() + DEFAULT_SESSION_TTL_MS;
}

/**
 * Issues the one-time ticket for a page's CRDT socket. Requested over
 * HTTPS with the session token in a header, so the token never appears in
 * a URL.
 */
@Controller('api/pages/:id')
@UseGuards(AuthGuard)
export class PageCrdtController {
  constructor(
    private readonly owners: OwnerResolver,
    private readonly resolver: AccessResolver,
  ) {}

  @Post('ydoc-ticket')
  async ticket(
    @CurrentUser() user: AuthUser,
    @OrgIdHeader() orgId: string | undefined,
    @Param('id') id: string,
  ) {
    const ctx = await this.owners.ctxFor(user, orgId);
    const level = await this.resolver.accessOne(ctx.profileId, 'NODE', id);

    if (!can(level, 'edit_content', 'PAGE')) {
      throw new ForbiddenException('No edit access');
    }

    return {
      ticket: issueCrdtTicket(ctx.profileId, id, sessionExpiry(user)),
      ttlMs: TICKET_TTL_MS,
    };
  }
}
