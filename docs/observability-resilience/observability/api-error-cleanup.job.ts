import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { jobEnabled, scheduleLabel } from '../common/job-flags';
import { PrismaService } from '../prisma/prisma.service';
import { JobHealthService } from './job-health.service';

const JOB_NAME = 'apiErrorLog.cleanup';
const RETENTION_DAYS = 30;
/** Used when the diagnostics settings have no row or cannot be read. */
const DEFAULT_DETAIL_RETENTION_DAYS = 7;
const MIN_DETAIL_RETENTION_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** On by default; turning it off lets the error log grow without bound. */
const FLAG = 'API_ERROR_CLEANUP_ENABLED';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

/**
 * Daily cleanup of the 5xx error log. Rows are kept for `RETENTION_DAYS`,
 * enough to spot a regression after a deploy. Stack traces and details may
 * hold fragments of user data, so they are cleared sooner, after the
 * configured detail retention, while the row itself stays.
 */
@Injectable()
export class ApiErrorLogCleanupJob implements OnModuleInit {
  private readonly logger = new Logger(ApiErrorLogCleanupJob.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobHealth: JobHealthService,
    config: ConfigService,
  ) {
    this.enabled = jobEnabled(config, FLAG, true);
  }

  onModuleInit(): void {
    const schedule = `daily (${RETENTION_DAYS}d retention, stacks ${DEFAULT_DETAIL_RETENTION_DAYS}d by default)`;
    this.jobHealth.register(JOB_NAME, scheduleLabel(this.enabled, schedule, FLAG));
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run() {
    if (!this.enabled) {
      return;
    }

    const startedAt = Date.now();
    try {
      const { count: deleted } = await this.prisma.apiErrorLog.deleteMany({
        where: { createdAt: { lt: daysAgo(RETENTION_DAYS) } },
      });

      const detailDays = await this.detailRetentionDays();
      const { count: cleared } = await this.prisma.apiErrorLog.updateMany({
        where: {
          createdAt: { lt: daysAgo(detailDays) },
          OR: [{ stack: { not: null } }, { detail: { not: null } }],
        },
        data: { stack: null, detail: null },
      });

      this.jobHealth.record(JOB_NAME, true, Date.now() - startedAt);

      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} ApiErrorLog rows older than ${RETENTION_DAYS}d`);
      }
      if (cleared > 0) {
        this.logger.log(`Cleared stack/detail on ${cleared} ApiErrorLog rows older than ${detailDays}d`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.jobHealth.record(JOB_NAME, false, Date.now() - startedAt, message);
      this.logger.error('ApiErrorLog cleanup job failed', err);
    }
  }

  /** The configured detail retention, or the default when it is missing or invalid. */
  private async detailRetentionDays(): Promise<number> {
    const row = await this.prisma.diagnosticsConfig
      .findFirst({ select: { errorDetailRetentionDays: true } })
      .catch(() => null);

    const days = row?.errorDetailRetentionDays;
    return typeof days === 'number' && days >= MIN_DETAIL_RETENTION_DAYS ? days : DEFAULT_DETAIL_RETENTION_DAYS;
  }
}
