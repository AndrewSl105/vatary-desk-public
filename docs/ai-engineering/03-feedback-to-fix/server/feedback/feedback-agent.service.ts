import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { UserRole } from '../../generated/prisma/client';
import { AuditLogService } from '../admin/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AgentFixDto, AgentNoteDto, AgentStartWorkDto } from './agent.dto';
import { appendNote, canStartWork, MAX_INTERNAL_NOTES } from './feedback.logic';

const REQUIRED_ROLE: UserRole = 'SUPER_ADMIN';
const IN_PROGRESS = 'IN_PROGRESS' as const;
const CHANGED_MEANWHILE = 'The ticket changed meanwhile.';

export interface AgentContext {
  profileId: string;
  role: UserRole;
  ip: string | null;
  /** Tells Claude Code's actions from the admin's own in the audit log. */
  agentTokenId: string | null;
}

/**
 * What Claude Code may do to a ticket: take it, note findings, mark a fix
 * ready. Super-admins only, by session or agent token. Nothing here can
 * set SHIPPED or DECLINED: a person ships or declines.
 */
@Injectable()
export class FeedbackAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async startWork(id: string, dto: AgentStartWorkDto, ctx: AgentContext) {
    const before = await this.ticket(id, ctx);

    if (before.status === IN_PROGRESS) {
      return { id, status: before.status };
    }
    if (!canStartWork(before.status)) {
      throw new ConflictException(`A ${before.status} ticket cannot be started.`);
    }

    // Conditional on the status just read, so an admin closing the ticket meanwhile is not overwritten.
    const { count } = await this.prisma.feedbackItem.updateMany({
      where: { id, status: before.status },
      data: { status: IN_PROGRESS },
    });
    if (count === 0) {
      throw new ConflictException(CHANGED_MEANWHILE);
    }

    await this.audit.write({
      adminId: ctx.profileId,
      action: 'FEEDBACK_STATUS_CHANGED',
      targetType: 'FEEDBACK',
      targetId: id,
      payload: { from: before.status, to: IN_PROGRESS, title: before.title, agentTokenId: ctx.agentTokenId },
      reason: dto.reason ?? null,
      ip: ctx.ip,
    });

    return { id, status: IN_PROGRESS };
  }

  async addNote(id: string, dto: AgentNoteDto, ctx: AgentContext) {
    const before = await this.ticket(id, ctx);
    const internalNotes = appendNote(before.internalNotes, dto.text, new Date());

    if (internalNotes.length > MAX_INTERNAL_NOTES) {
      throw new BadRequestException('Internal notes are full.');
    }

    // `updatedAt` acts as a version: an edit the admin saved in between is never lost.
    const { count } = await this.prisma.feedbackItem.updateMany({
      where: { id, updatedAt: before.updatedAt },
      data: { internalNotes },
    });
    if (count === 0) {
      throw new ConflictException(CHANGED_MEANWHILE);
    }

    return { id, internalNotes };
  }

  /** Records the fix; the status does not change. */
  async markFixed(id: string, dto: AgentFixDto, ctx: AgentContext) {
    const before = await this.ticket(id, ctx);
    const agentFixedAt = new Date();

    await this.prisma.feedbackItem.update({
      where: { id },
      data: {
        agentFixedAt,
        agentFixCommit: dto.commitSha,
        agentFixBranch: dto.branch ?? null,
        agentFixSummary: dto.summary,
      },
    });

    await this.audit.write({
      adminId: ctx.profileId,
      action: 'FEEDBACK_AGENT_FIXED',
      targetType: 'FEEDBACK',
      targetId: id,
      payload: {
        commitSha: dto.commitSha,
        branch: dto.branch ?? null,
        title: before.title,
        agentTokenId: ctx.agentTokenId,
      },
      ip: ctx.ip,
    });

    return { id, agentFixedAt: agentFixedAt.toISOString() };
  }

  private async ticket(id: string, ctx: AgentContext) {
    if (ctx.role !== REQUIRED_ROLE) {
      throw new ForbiddenException();
    }

    const item = await this.prisma.feedbackItem.findUnique({
      where: { id },
      select: { status: true, title: true, internalNotes: true, updatedAt: true },
    });
    if (!item) {
      throw new NotFoundException();
    }

    return item;
  }
}
