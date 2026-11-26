import { Logger } from '@nestjs/common';
import type { JobFlagState } from '../common/job-flags';
import { JobHealthService, startupFlagsLine } from './job-health.service';

const EMPTY = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastDurationMs: null,
  runs: 0,
  failures: 0,
};

describe('JobHealthService.register', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a string schedule registers an ungated, enabled job and logs nothing', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const svc = new JobHealthService();
    svc.register('files.purge', 'hourly');
    expect(svc.get('files.purge')).toEqual({ ...EMPTY, name: 'files.purge', schedule: 'hourly', enabled: true, flag: null });
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a gated enabled job keeps its flag and logs one info line', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const svc = new JobHealthService();
    const flag: JobFlagState = { key: 'X_ENABLED', enabled: true, source: 'default' };
    svc.register('x', { schedule: 'daily', flag });
    expect(svc.get('x')).toEqual({ ...EMPTY, name: 'x', schedule: 'daily', enabled: true, flag });
    expect(log).toHaveBeenCalledWith('job x: enabled (X_ENABLED unset → default on)');
  });

  it('a gated disabled job logs one WARN line', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const svc = new JobHealthService();
    svc.register('x', { schedule: 'disabled (X_ENABLED=off) — was: daily', flag: { key: 'X_ENABLED', enabled: false, source: 'set' } });
    expect(svc.get('x')?.enabled).toBe(false);
    expect(warn).toHaveBeenCalledWith('job x: DISABLED (X_ENABLED=off)');
  });

  it('the first registration wins: a second register with a new schedule is ignored', () => {
    const svc = new JobHealthService();
    svc.register('x', 'hourly');
    svc.register('x', 'daily');
    expect(svc.get('x')?.schedule).toBe('hourly');
  });

  it('get returns null for a job that never registered', () => {
    expect(new JobHealthService().get('nope')).toBeNull();
  });
});

describe('JobHealthService.record', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-09-26T00:00:00.000Z') }));
  afterEach(() => jest.useRealTimers());

  it('a success stamps lastRunAt/lastSuccessAt, duration, run count, and clears lastError', () => {
    const svc = new JobHealthService();
    svc.register('x', 'hourly');
    svc.record('x', false, 5, 'first failed');
    jest.setSystemTime(new Date('2026-09-26T01:00:00.000Z'));
    svc.record('x', true, 12);
    expect(svc.get('x')).toEqual({
      name: 'x',
      schedule: 'hourly',
      lastRunAt: '2026-09-26T01:00:00.000Z',
      lastSuccessAt: '2026-09-26T01:00:00.000Z',
      lastError: null,
      lastDurationMs: 12,
      runs: 2,
      failures: 1,
      enabled: true,
      flag: null,
    });
  });

  it('a failure keeps lastSuccessAt, increments failures, defaults the error text', () => {
    const svc = new JobHealthService();
    svc.register('x', 'hourly');
    svc.record('x', true, 1);
    jest.setSystemTime(new Date('2026-09-26T02:00:00.000Z'));
    svc.record('x', false, 3);
    expect(svc.get('x')).toEqual(expect.objectContaining({
      lastRunAt: '2026-09-26T02:00:00.000Z',
      lastSuccessAt: '2026-09-26T00:00:00.000Z',
      lastError: 'unknown error',
      lastDurationMs: 3,
      runs: 2,
      failures: 1,
    }) as Record<string, unknown>);
  });

  it('recording an unregistered job creates it with schedule "unknown"; a later register cannot fix it', () => {
    const svc = new JobHealthService();
    svc.record('late', true, 7);
    expect(svc.get('late')).toEqual({
      name: 'late',
      schedule: 'unknown',
      lastRunAt: '2026-09-26T00:00:00.000Z',
      lastSuccessAt: '2026-09-26T00:00:00.000Z',
      lastError: null,
      lastDurationMs: 7,
      runs: 1,
      failures: 0,
      enabled: true,
      flag: null,
    });
    svc.register('late', { schedule: 'hourly', flag: { key: 'LATE', enabled: false, source: 'set' } });
    expect(svc.get('late')?.schedule).toBe('unknown');
    expect(svc.get('late')?.enabled).toBe(true);
  });

  it('snapshot is sorted by name and hands out the live objects, not copies', () => {
    const svc = new JobHealthService();
    svc.register('zeta', 'a');
    svc.register('alpha', 'b');
    svc.register('Mid', 'c');
    const snap = svc.snapshot();
    expect(snap.map((j) => j.name)).toEqual(['alpha', 'Mid', 'zeta']);
    snap[0].runs = 99;
    expect(svc.get('alpha')?.runs).toBe(99);
  });
});

describe('startupFlagsLine', () => {
  afterEach(() => jest.restoreAllMocks());

  it('says "none read" for an empty list', () => {
    expect(startupFlagsLine([])).toBe('job flags: none read');
  });

  it('counts and describes every flag in the order given, never printing a raw value', () => {
    expect(
      startupFlagsLine([
        { key: 'B', enabled: false, source: 'set' },
        { key: 'A', enabled: true, source: 'default' },
        { key: 'C', enabled: false, source: 'invalid' },
      ]),
    ).toBe('job flags (3): B=off, A unset → default on, C is not a boolean → default off');
  });

  it('onApplicationBootstrap logs the startup line once', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    new JobHealthService().onApplicationBootstrap();
    expect(log).toHaveBeenCalledTimes(1);
    expect((log.mock.calls[0] as unknown as [string])[0]).toMatch(/^job flags/);
  });
});
