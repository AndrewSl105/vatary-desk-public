import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { describeFlag, readJobFlags, type JobFlagState, type JobSchedule } from '../common/job-flags';

const UNKNOWN_SCHEDULE = 'unknown';
const UNKNOWN_ERROR = 'unknown error';

export interface JobRun {
  name: string;
  schedule: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  runs: number;
  failures: number;
  /** False when the job's flag keeps it from running at all. */
  enabled: boolean;
  /** The flag that gates the job and how it was read; null for an ungated job. */
  flag: JobFlagState | null;
}

function newJobRun(name: string, schedule: string, enabled: boolean, flag: JobFlagState | null): JobRun {
  return {
    name,
    schedule,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastDurationMs: null,
    runs: 0,
    failures: 0,
    enabled,
    flag,
  };
}

/**
 * In-memory registry of scheduled-job health, shown on the admin System
 * page without a metrics pipeline. Jobs register at startup, so they
 * appear with their schedule before the first run, and record every run.
 * It resets on restart and never reports a run it did not observe.
 */
@Injectable()
export class JobHealthService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');
  private readonly jobs = new Map<string, JobRun>();

  /** Registers a job. A gated job also logs one line saying whether it will run and why. */
  register(name: string, schedule: string | JobSchedule): void {
    if (this.jobs.has(name)) {
      return;
    }

    const info = typeof schedule === 'string' ? { schedule, flag: null } : schedule;
    const enabled = info.flag ? info.flag.enabled : true;
    this.jobs.set(name, newJobRun(name, info.schedule, enabled, info.flag));

    if (info.flag) {
      const line = `job ${name}: ${enabled ? 'enabled' : 'DISABLED'} (${describeFlag(info.flag)})`;
      if (enabled) this.logger.log(line);
      else this.logger.warn(line);
    }
  }

  /** One boot line with every job flag this process read, so a job that never runs is visible. */
  onApplicationBootstrap(): void {
    this.logger.log(startupFlagsLine());
  }

  /** The registered job, or null when it never registered in this process. */
  get(name: string): JobRun | null {
    return this.jobs.get(name) ?? null;
  }

  record(name: string, ok: boolean, durationMs: number, error?: string): void {
    const now = new Date().toISOString();
    const job = this.jobs.get(name) ?? newJobRun(name, UNKNOWN_SCHEDULE, true, null);

    job.lastRunAt = now;
    job.lastDurationMs = durationMs;
    job.runs += 1;

    if (ok) {
      job.lastSuccessAt = now;
      job.lastError = null;
    } else {
      job.failures += 1;
      job.lastError = error ?? UNKNOWN_ERROR;
    }

    this.jobs.set(name, job);
  }

  snapshot(): JobRun[] {
    return [...this.jobs.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** "job flags (N): A=on, B unset → default off, …" — never a raw value beyond on/off. */
export function startupFlagsLine(flags: JobFlagState[] = readJobFlags()): string {
  if (flags.length === 0) {
    return 'job flags: none read';
  }
  return `job flags (${flags.length}): ${flags.map(describeFlag).join(', ')}`;
}
