jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CronExpression } from '@nestjs/schedule';
import type { PrismaService } from '../prisma/prisma.service';
import { ApiErrorLogCleanupJob } from './api-error-cleanup.job';
import type { JobHealthService } from './job-health.service';

const JOB_NAME = 'apiErrorLog.cleanup';
const FLAG = 'API_ERROR_CLEANUP_ENABLED';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-26T03:00:00.000Z');

function build(env: Record<string, string | undefined> = {}, detailRow: { errorDetailRetentionDays: unknown } | null | Error = null) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const prisma = {
    apiErrorLog: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    diagnosticsConfig: {
      findFirst: jest.fn(() => (detailRow instanceof Error ? Promise.reject(detailRow) : Promise.resolve(detailRow))),
    },
  };
  const health = { register: jest.fn(), record: jest.fn() };
  const job = new ApiErrorLogCleanupJob(
    prisma as unknown as PrismaService,
    health as unknown as JobHealthService,
    config,
  );
  return { job, prisma, health };
}

describe('ApiErrorLogCleanupJob — frozen schedule contract', () => {
  it('run() is decorated @Cron(EVERY_DAY_AT_MIDNIGHT) with no name/timezone options', () => {
    // Read the method off the prototype descriptor: the decorator metadata
    // hangs on the function object itself.
    const run = Object.getOwnPropertyDescriptor(ApiErrorLogCleanupJob.prototype, 'run')?.value as object;
    const meta = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', run) as Record<string, unknown>;
    expect(meta).toEqual({ cronTime: CronExpression.EVERY_DAY_AT_MIDNIGHT });
    expect(CronExpression.EVERY_DAY_AT_MIDNIGHT).toBe('0 0 * * *');
    expect(Reflect.getMetadata('SCHEDULER_TYPE', run)).toBeDefined();
  });

  it('the source keeps the decorator, job name, flag and retention constants verbatim', () => {
    const src = readFileSync(join(__dirname, 'api-error-cleanup.job.ts'), 'utf8');
    expect(src).toContain('@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)\n  async run()');
    expect(src).toContain(`const JOB_NAME = '${JOB_NAME}';`);
    expect(src).toContain(`const FLAG = '${FLAG}';`);
    expect(src).toContain('const RETENTION_DAYS = 30;');
    expect(src).toContain('const DEFAULT_DETAIL_RETENTION_DAYS = 7;');
    expect(src.match(/@Cron\(/g)).toHaveLength(1);
  });
});

describe('ApiErrorLogCleanupJob.onModuleInit', () => {
  it('registers the frozen name with an enabled label when the flag is unset (default ON)', () => {
    const { job, health } = build();
    job.onModuleInit();
    expect(health.register).toHaveBeenCalledWith(JOB_NAME, {
      schedule: 'daily (30d retention, stacks 7d by default)',
      flag: { key: FLAG, enabled: true, source: 'default' },
    });
  });

  it('registers a "disabled … — was:" label when the flag is off', () => {
    const { job, health } = build({ [FLAG]: 'off' });
    job.onModuleInit();
    expect(health.register).toHaveBeenCalledWith(JOB_NAME, {
      schedule: `disabled (${FLAG}=off) — was: daily (30d retention, stacks 7d by default)`,
      flag: { key: FLAG, enabled: false, source: 'set' },
    });
  });

  it('an unparseable flag value falls back to enabled with source=invalid', () => {
    const { job, health } = build({ [FLAG]: 'maybe' });
    job.onModuleInit();
    expect(health.register).toHaveBeenCalledWith(JOB_NAME, expect.objectContaining({
      flag: { key: FLAG, enabled: true, source: 'invalid' },
    }) as Record<string, unknown>);
  });
});

describe('ApiErrorLogCleanupJob.run', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('disabled: returns before any DB access and records nothing', async () => {
    const { job, prisma, health } = build({ [FLAG]: '0' });
    await job.run();
    expect(prisma.apiErrorLog.deleteMany).not.toHaveBeenCalled();
    expect(prisma.diagnosticsConfig.findFirst).not.toHaveBeenCalled();
    expect(health.record).not.toHaveBeenCalled();
  });

  it('deletes rows older than 30 days, then clears stack/detail older than the 7-day default', async () => {
    const { job, prisma, health } = build();
    await job.run();
    expect(prisma.apiErrorLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - 30 * DAY) } },
    });
    expect(prisma.apiErrorLog.updateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date(NOW.getTime() - 7 * DAY) },
        OR: [{ stack: { not: null } }, { detail: { not: null } }],
      },
      data: { stack: null, detail: null },
    });
    expect(prisma.diagnosticsConfig.findFirst).toHaveBeenCalledWith({ select: { errorDetailRetentionDays: true } });
    expect(health.record).toHaveBeenCalledWith(JOB_NAME, true, 0);
    const order = [
      prisma.apiErrorLog.deleteMany.mock.invocationCallOrder[0],
      prisma.diagnosticsConfig.findFirst.mock.invocationCallOrder[0],
      prisma.apiErrorLog.updateMany.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it.each([
    ['a configured value', { errorDetailRetentionDays: 3 }, 3],
    ['zero → default', { errorDetailRetentionDays: 0 }, 7],
    ['negative → default', { errorDetailRetentionDays: -2 }, 7],
    ['non-number → default', { errorDetailRetentionDays: '5' }, 7],
    ['fractional kept as-is', { errorDetailRetentionDays: 1.5 }, 1.5],
    ['no row → default', null, 7],
    ['read failure → default', new Error('relation missing'), 7],
  ])('detail cutoff uses %s', async (_label, row, days) => {
    const { job, prisma, health } = build({}, row);
    await job.run();
    const arg = (prisma.apiErrorLog.updateMany.mock.calls as unknown as [[{ where: { createdAt: { lt: Date } } }]])[0][0];
    expect(arg.where.createdAt.lt).toEqual(new Date(NOW.getTime() - days * DAY));
    expect(health.record).toHaveBeenCalledWith(JOB_NAME, true, 0);
  });

  it('logs counts only when something was deleted or cleared', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const quiet = build();
    await quiet.job.run();
    expect(log).not.toHaveBeenCalled();
    const busy = build({}, { errorDetailRetentionDays: 2 });
    busy.prisma.apiErrorLog.deleteMany.mockResolvedValue({ count: 4 });
    busy.prisma.apiErrorLog.updateMany.mockResolvedValue({ count: 9 });
    await busy.job.run();
    expect(log).toHaveBeenCalledWith('Deleted 4 ApiErrorLog rows older than 30d');
    expect(log).toHaveBeenCalledWith('Cleared stack/detail on 9 ApiErrorLog rows older than 2d');
  });

  it('a failing delete records a failure with the error message and never reaches the detail clear', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { job, prisma, health } = build();
    prisma.apiErrorLog.deleteMany.mockRejectedValue(new Error('connection reset'));
    await expect(job.run()).resolves.toBeUndefined();
    expect(health.record).toHaveBeenCalledWith(JOB_NAME, false, 0, 'connection reset');
    expect(prisma.apiErrorLog.updateMany).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('ApiErrorLog cleanup job failed', expect.any(Error));
  });

  it('a non-Error rejection is stringified for the health record', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { job, prisma, health } = build();
    prisma.apiErrorLog.updateMany.mockRejectedValue('weird');
    await job.run();
    expect(health.record).toHaveBeenCalledWith(JOB_NAME, false, 0, 'weird');
  });

  it('measures duration from before the first query', async () => {
    const { job, prisma, health } = build();
    prisma.apiErrorLog.deleteMany.mockImplementation(() => {
      jest.advanceTimersByTime(250);
      return Promise.resolve({ count: 0 });
    });
    await job.run();
    expect(health.record).toHaveBeenCalledWith(JOB_NAME, true, 250);
    // The 30d cutoff was computed before the clock moved.
    expect(prisma.apiErrorLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - 30 * DAY) } },
    });
  });
});
