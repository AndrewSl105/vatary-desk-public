jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../admin/audit-log.service', () => ({ AuditLogService: class {} }));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuditLogService } from '../admin/audit-log.service';
import type { PrismaService } from '../prisma/prisma.service';
import { FeedbackAgentService, type AgentContext } from './feedback-agent.service';
import { MAX_INTERNAL_NOTES } from './feedback.logic';

const CTX: AgentContext = {
  profileId: 'admin-1',
  role: 'SUPER_ADMIN',
  ip: null,
  agentTokenId: 'tok-1',
};

const UPDATED_AT = new Date('2026-10-31T10:00:00Z');

interface UpdateArgs {
  where: { updatedAt?: Date };
  data: Record<string, unknown>;
}

function build(item: Record<string, unknown> | null, updatedRows = 1) {
  const findUnique = jest.fn().mockResolvedValue(
    item && { status: 'OPEN', title: 'Bug', internalNotes: null, updatedAt: UPDATED_AT, ...item },
  );
  const updateMany = jest.fn<Promise<{ count: number }>, [UpdateArgs]>().mockResolvedValue({ count: updatedRows });
  const update = jest.fn<Promise<object>, [UpdateArgs]>().mockResolvedValue({});
  const write = jest.fn().mockResolvedValue(undefined);
  const prisma = { feedbackItem: { findUnique, updateMany, update } } as unknown as PrismaService;
  const audit = { write } as unknown as AuditLogService;
  return { service: new FeedbackAgentService(prisma, audit), updateMany, update, write };
}

describe('FeedbackAgentService', () => {
  const FIX = { commitSha: 'abc1234', branch: 'dev', summary: 'Fixed it' };

  describe('markFixed', () => {
    it('sets the fields, audits with the token id, and leaves status alone', async () => {
      const { service, update, write } = build({ status: 'IN_PROGRESS' });
      await service.markFixed('f1', FIX, CTX);
      const { data } = update.mock.calls[0][0];
      expect(data).toMatchObject({
        agentFixCommit: 'abc1234',
        agentFixBranch: 'dev',
        agentFixSummary: 'Fixed it',
      });
      expect(data.agentFixedAt).toBeInstanceOf(Date);
      expect(data).not.toHaveProperty('status');
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FEEDBACK_AGENT_FIXED',
          targetId: 'f1',
          payload: expect.objectContaining({ commitSha: 'abc1234', agentTokenId: 'tok-1' }) as unknown,
        }),
      );
    });

    it('is refused to anyone but a super-admin', async () => {
      const { service, update } = build({});
      await expect(service.markFixed('f1', FIX, { ...CTX, role: 'USER' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('404s on an unknown ticket', async () => {
      const { service } = build(null);
      await expect(service.markFixed('nope', FIX, CTX)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('startWork', () => {
    it.each(['OPEN', 'UNDER_REVIEW', 'PLANNED'])('takes a %s ticket', async (status) => {
      const { service, updateMany, write } = build({ status });
      await expect(service.startWork('f1', {}, CTX)).resolves.toEqual({ id: 'f1', status: 'IN_PROGRESS' });
      expect(updateMany).toHaveBeenCalledWith({ where: { id: 'f1', status }, data: { status: 'IN_PROGRESS' } });
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FEEDBACK_STATUS_CHANGED',
          payload: expect.objectContaining({ from: status, to: 'IN_PROGRESS', agentTokenId: 'tok-1' }) as unknown,
        }),
      );
    });

    it.each(['SHIPPED', 'DECLINED'])('never reopens a %s ticket', async (status) => {
      const { service, updateMany } = build({ status });
      await expect(service.startWork('f1', {}, CTX)).rejects.toBeInstanceOf(ConflictException);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('is a no-op on a ticket already in progress', async () => {
      const { service, updateMany, write } = build({ status: 'IN_PROGRESS' });
      await service.startWork('f1', {}, CTX);
      expect(updateMany).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    });

    it('409s and writes no audit row when the status moved under it', async () => {
      const { service, write } = build({ status: 'OPEN' }, 0);
      await expect(service.startWork('f1', {}, CTX)).rejects.toBeInstanceOf(ConflictException);
      expect(write).not.toHaveBeenCalled();
    });
  });

  describe('addNote', () => {
    it('appends after the existing notes, guarded by updatedAt', async () => {
      const { service, updateMany } = build({ internalNotes: 'by hand' });
      await service.addNote('f1', { text: 'found it' }, CTX);
      const arg = updateMany.mock.calls[0][0];
      expect(arg.where.updatedAt).toBe(UPDATED_AT);
      expect(arg.data.internalNotes).toMatch(/^by hand\n\n\[\d{4}-\d\d-\d\d \d\d:\d\d UTC · Claude Code\]\nfound it$/);
    });

    it('409s when the notes changed since they were read', async () => {
      const { service } = build({}, 0);
      await expect(service.addNote('f1', { text: 'x' }, CTX)).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to grow past what the admin could still save', async () => {
      const { service, updateMany } = build({ internalNotes: 'x'.repeat(MAX_INTERNAL_NOTES) });
      await expect(service.addNote('f1', { text: 'more' }, CTX)).rejects.toBeInstanceOf(BadRequestException);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });
});
