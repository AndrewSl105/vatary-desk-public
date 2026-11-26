import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AGENT_TOKEN_PREFIX, type AgentTokenScope } from './agent-scope.decorator';

const TOKEN_RANDOM_BYTES = 32;
/** The visible start of a token, so an admin can recognise it in the list. */
const PREFIX_LENGTH = 8;
const LAST_USED_THROTTLE_MS = 60 * 60 * 1000;
const REQUIRED_ROLE = 'SUPER_ADMIN';
const HASH_ALGORITHM = 'sha256';

export interface ResolvedAgentToken {
  id: string;
  scopes: string[];
  user: { sub: string; email: string; name?: string; raw: Record<string, never> };
}

export interface CreateAgentTokenInput {
  profileId: string;
  name: string;
  scopes: AgentTokenScope[];
  expiresAt: Date | null;
}

/** Tokens are stored as a hash; the plain value never reaches the database. */
export function hashAgentToken(token: string): string {
  return createHash(HASH_ALGORITHM).update(token).digest('hex');
}

/** Every column except the hash: no response ever carries `tokenHash`. */
const AGENT_TOKEN_VIEW = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  profile: { select: { email: true } },
} as const;

/** Agent tokens for Claude Code: minting, lookup and revocation. */
@Injectable()
export class AgentTokenService {
  private readonly logger = new Logger(AgentTokenService.name);
  private readonly lastUsedBump = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The token's owner and scopes, or null for anything that must not
   * authenticate: unknown, revoked, expired, or owned by someone who is no
   * longer a super-admin. The role is read on every request, so a demoted
   * admin's tokens stop at once.
   */
  async resolve(token: string): Promise<ResolvedAgentToken | null> {
    const row = await this.prisma.agentToken.findUnique({
      where: { tokenHash: hashAgentToken(token) },
      select: {
        id: true,
        scopes: true,
        revokedAt: true,
        expiresAt: true,
        profile: { select: { authUserId: true, email: true, displayName: true, role: true } },
      },
    });

    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    if (row.profile.role !== REQUIRED_ROLE) return null;

    this.markUsed(row.id);

    return {
      id: row.id,
      scopes: row.scopes,
      user: {
        sub: row.profile.authUserId,
        email: row.profile.email,
        name: row.profile.displayName ?? undefined,
        raw: {},
      },
    };
  }

  /** The only moment the plain token exists; it is returned once and only its hash is stored. */
  async create(input: CreateAgentTokenInput, tx: Prisma.TransactionClient) {
    const token = AGENT_TOKEN_PREFIX + randomBytes(TOKEN_RANDOM_BYTES).toString('base64url');

    const row = await tx.agentToken.create({
      data: {
        ...input,
        tokenHash: hashAgentToken(token),
        prefix: token.slice(0, PREFIX_LENGTH),
      },
      select: AGENT_TOKEN_VIEW,
    });

    return { ...row, token };
  }

  list() {
    return this.prisma.agentToken.findMany({ orderBy: { createdAt: 'desc' }, select: AGENT_TOKEN_VIEW });
  }

  /** False when there is nothing to revoke: an unknown id, or one already revoked. */
  async revoke(id: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const { count } = await tx.agentToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  /** Records the last use at most once per throttle window, without delaying the request. */
  private markUsed(id: string): void {
    const now = Date.now();
    const previous = this.lastUsedBump.get(id);
    if (previous !== undefined && now - previous < LAST_USED_THROTTLE_MS) {
      return;
    }
    this.lastUsedBump.set(id, now);

    void this.prisma.agentToken
      .update({ where: { id }, data: { lastUsedAt: new Date(now) } })
      .catch((err: unknown) => {
        this.logger.warn(`failed to bump lastUsedAt: ${(err as Error).message}`);
      });
  }
}
