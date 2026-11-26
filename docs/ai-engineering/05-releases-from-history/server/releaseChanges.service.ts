import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditLogService } from '../backoffice';
import type {
  AttachReleaseChangesResult,
  HistoryChangeAudience,
  HistoryChangeType,
  ReleaseChangeLink,
  ReleaseChangePlacement,
} from '../contracts/library/changes';
import { ChangesHistoryService } from '../library/admin/changes-history.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AttachReleaseChangesDto } from './dto';
import type { AdminContext } from './releases.service';
import { MAX_RELEASE_SLIDES, attachProblemMessage, planAttach, seedSlide, snapshotOf } from './releaseChanges.logic';

const DRAFT_STATUS = 'draft';
const DEFAULT_PLACEMENT: ReleaseChangePlacement = 'slide';
const NO_POSITION = -1;

const AUDIT_ACTIONS = {
  linked: 'RELEASE_CHANGES_LINKED',
  unlinked: 'RELEASE_CHANGE_UNLINKED',
} as const;
const AUDIT_TARGET_TYPE = 'release';

/**
 * History → release draft. Linking an entry records where the release came
 * from (with a snapshot of the entry's text) and how it ships:
 *
 * - `slide`: one text slide per entry is appended, a seed the admin then
 *   rewrites, unless the admin asked the AI to write the slides;
 * - `list`: no slide; the entry is shown as written on the public changelog.
 *
 * Draft only: nothing is published or mailed from here. Unlinking keeps the
 * slide, because by then it is the admin's text.
 */
@Injectable()
export class ReleaseChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: ChangesHistoryService,
    private readonly audit: AuditLogService,
  ) {}

  async list(releaseId: string): Promise<ReleaseChangeLink[]> {
    await this.requireRelease(releaseId);

    const rows = await this.prisma.releaseChange.findMany({
      where: { releaseId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const entries = this.history.lookup(rows.map((row) => row.changeId));

    return rows.map((row) => {
      const entry = entries.get(row.changeId);
      return {
        changeId: row.changeId,
        position: row.position,
        createdAt: row.createdAt.toISOString(),
        placement: (row.placement === 'list' ? 'list' : 'slide') as ReleaseChangePlacement,
        entry: entry
          ? {
              id: entry.id,
              date: entry.date,
              type: entry.type as HistoryChangeType,
              audience: entry.audience as HistoryChangeAudience,
              title: entry.title,
            }
          : null,
      };
    });
  }

  async attach(releaseId: string, dto: AttachReleaseChangesDto, ctx: AdminContext): Promise<AttachReleaseChangesResult> {
    await this.requireDraft(releaseId);
    if (!this.history.enabled) {
      throw new ConflictException('History is disabled in this environment');
    }

    const existing = await this.prisma.releaseChange.findMany({
      where: { releaseId },
      select: { changeId: true, position: true },
    });
    const plan = planAttach(dto.changeIds, this.history.find(dto.changeIds), new Set(existing.map((link) => link.changeId)));
    if (plan.problem) {
      throw new BadRequestException(attachProblemMessage(plan.problem));
    }

    const placement = dto.placement ?? DEFAULT_PLACEMENT;
    const seedsSlides = placement === 'slide' && dto.slides === 'entries';
    const slides = seedsSlides ? plan.toLink.map(seedSlide) : [];

    const current = slides.length
      ? await this.prisma.releaseSlide.aggregate({ where: { releaseId }, _max: { position: true }, _count: true })
      : null;
    const slideCount = current?._count ?? 0;
    if (slideCount + slides.length > MAX_RELEASE_SLIDES) {
      throw new BadRequestException(
        attachProblemMessage({ kind: 'too-many-slides', have: slideCount, adding: slides.length }),
      );
    }

    const firstSlidePosition = (current?._max.position ?? NO_POSITION) + 1;
    const firstLinkPosition = existing.reduce((next, link) => Math.max(next, link.position + 1), 0);

    if (plan.toLink.length > 0) {
      await this.prisma.$transaction([
        this.prisma.releaseChange.createMany({
          data: plan.toLink.map((entry, i) => ({
            releaseId,
            changeId: entry.id,
            position: firstLinkPosition + i,
            placement,
            ...snapshotOf(entry),
          })),
        }),
        ...(slides.length
          ? [
              this.prisma.releaseSlide.createMany({
                data: slides.map((slide, i) => ({ ...slide, releaseId, position: firstSlidePosition + i })),
              }),
            ]
          : []),
      ]);

      await this.audit.write({
        adminId: ctx.adminId,
        action: AUDIT_ACTIONS.linked,
        targetType: AUDIT_TARGET_TYPE,
        targetId: releaseId,
        payload: { changeIds: plan.toLink.map((entry) => entry.id), placement, slidesAdded: slides.length },
        ip: ctx.ip ?? null,
      });
    }

    return {
      linked: plan.toLink.map((entry) => entry.id),
      skipped: plan.skipped,
      slidesAdded: slides.length,
      links: await this.list(releaseId),
    };
  }

  async detach(releaseId: string, changeId: string, ctx: AdminContext): Promise<ReleaseChangeLink[]> {
    await this.requireDraft(releaseId);

    const { count } = await this.prisma.releaseChange.deleteMany({ where: { releaseId, changeId } });
    if (count === 0) {
      throw new NotFoundException('This entry is not linked to the release');
    }

    await this.audit.write({
      adminId: ctx.adminId,
      action: AUDIT_ACTIONS.unlinked,
      targetType: AUDIT_TARGET_TYPE,
      targetId: releaseId,
      payload: { changeId },
      ip: ctx.ip ?? null,
    });

    return this.list(releaseId);
  }

  /**
   * Called right before a draft is published: each link's snapshot is
   * re-read from History, so the release ships the entries' latest text and
   * is frozen from then on. An entry no longer in History keeps the snapshot
   * it was linked with.
   */
  async refreshSnapshots(releaseId: string): Promise<void> {
    const release = await this.requireRelease(releaseId);
    if (release.status !== DRAFT_STATUS) {
      return;
    }

    const rows = await this.prisma.releaseChange.findMany({ where: { releaseId }, select: { changeId: true } });
    if (rows.length === 0) {
      return;
    }

    const entries = this.history.lookup(rows.map((row) => row.changeId));
    const updates = rows
      .filter((row) => entries.has(row.changeId))
      .map((row) =>
        this.prisma.releaseChange.update({
          where: { releaseId_changeId: { releaseId, changeId: row.changeId } },
          data: snapshotOf(entries.get(row.changeId)!),
        }),
      );

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }

  private async requireRelease(id: string) {
    const release = await this.prisma.release.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!release) {
      throw new NotFoundException('Release not found');
    }
    return release;
  }

  private async requireDraft(id: string) {
    const release = await this.requireRelease(id);
    if (release.status !== DRAFT_STATUS) {
      throw new ConflictException('History entries are linked to a draft release only');
    }
    return release;
  }
}
