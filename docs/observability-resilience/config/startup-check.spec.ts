import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';

import { ENV_CHECKS, checkEnv, formatEnvSummary } from './startup-check';
import { envReader, runStartupCheck } from './startup-check.service';

const env = (vars: Record<string, string>) => (name: string) => vars[name];

const ALL_SET: Record<string, string> = Object.fromEntries(
  ENV_CHECKS.map((spec) => [spec.name, spec.flag ? (spec.flag.default ? '1' : '0') : 'x']),
);

function without(...names: string[]): Record<string, string> {
  const vars = { ...ALL_SET };
  for (const name of names) delete vars[name];
  return vars;
}

describe('the environment contract', () => {
  it('has unique names; fatal is reserved for what the server cannot start, or must not run, without', () => {
    const names = ENV_CHECKS.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);

    const fatal = ENV_CHECKS.filter((spec) => spec.severity === 'fatal');
    expect(fatal.filter((spec) => spec.scope === 'all').map((spec) => spec.name).sort()).toEqual(['AUTH_JWKS_URL', 'DATABASE_URL']);
    expect(fatal.filter((spec) => spec.scope === 'deployed').map((spec) => spec.name).sort()).toEqual(['JWT_AUDIENCE', 'JWT_ISSUER']);
  });

  it('staging and production refuse to start without token pinning; a laptop does not', () => {
    for (const name of ['JWT_ISSUER', 'JWT_AUDIENCE']) {
      const vars = without(name);
      expect(checkEnv(env(vars), 'production').fatal.map((row) => row.name)).toEqual([name]);
      expect(checkEnv(env(vars), 'staging').fatal.map((row) => row.name)).toEqual([name]);
      expect(checkEnv(env(vars), 'development').fatal).toEqual([]);
    }
  });
});

describe('checkEnv', () => {
  it('lists a missing warn variable with what it stops; the process lives', () => {
    const vars = without('SENTRY_DSN');
    const result = checkEnv(env(vars), 'production');

    expect(result.fatal).toEqual([]);
    expect(result.warn.map((row) => row.name)).toEqual(['SENTRY_DSN']);
    expect(formatEnvSummary(result)).toEqual([
      expect.stringMatching(/^env check \(production\): 0 fatal · 1 warn · \d+ ok$/),
      '  WARN  SENTRY_DSN is not set — errors will not be reported',
    ]);
    expect(checkEnv(env(vars), 'development').warn).toEqual([]);
  });

  it('names a missing service and a job switched off', () => {
    const vars = { ...without('ORCHESTRATOR_ADDR'), FILES_PURGE_ENABLED: 'false' };
    const lines = formatEnvSummary(checkEnv(env(vars), 'staging'));

    expect(lines).toContain('  WARN  ORCHESTRATOR_ADDR is not set — AI will not run: no generation and no document conversion');
    expect(lines).toContain('  WARN  FILES_PURGE_ENABLED is off — trashed files are never purged');
  });

  it('accepts a default-on job with its variable unset; an opt-in job left off is only info', () => {
    const result = checkEnv(env({ DATABASE_URL: 'x', AUTH_JWKS_URL: 'x' }), 'development');

    expect(result.rows.find((row) => row.name === 'FILES_PURGE_ENABLED')).toMatchObject({ set: false, status: 'ok' });
    expect(result.rows.find((row) => row.name === 'LINKS_BACKFILL_ENABLED')).toMatchObject({ status: 'off', severity: 'info' });
    expect(result.warn.map((row) => row.name)).toEqual(['ORCHESTRATOR_ADDR']);
  });

  it('reports presence, never a value', () => {
    const secret = 'postgres://user:hunter2@db/x';
    const result = checkEnv(env({ ...ALL_SET, DATABASE_URL: secret }), 'production');
    const text = JSON.stringify(result) + formatEnvSummary(result).join('\n');

    expect(text).not.toContain('hunter2');
    expect(Object.keys(result.rows[0]).sort()).toEqual(['effect', 'name', 'scope', 'set', 'severity', 'status']);
  });

  it('stops the start with a clear message and a non-zero exit when a fatal variable is missing', () => {
    const exit = jest.fn((code: number) => {
      throw new Error(`exit ${code}`);
    }) as unknown as (code: number) => never;
    const errors: string[] = [];
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => void errors.push(String(message)));

    try {
      expect(() => runStartupCheck(env(without('DATABASE_URL')), exit)).toThrow('exit 1');
      expect(errors[0]).toContain('FATAL DATABASE_URL is not set — no database: the server cannot start');
      expect(errors[0]).toContain('startup stopped: set DATABASE_URL');
    } finally {
      spy.mockRestore();
    }

    expect(runStartupCheck(env({ ...ALL_SET }), exit).fatal).toEqual([]);
  });
});

describe('envReader', () => {
  it('finds a variable that lives only in an env file, and the process wins over the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-check-'));
    const saved = { DATABASE_URL: process.env.DATABASE_URL, AUTH_JWKS_URL: process.env.AUTH_JWKS_URL };

    try {
      writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgresql://file\nAUTH_JWKS_URL=https://file\n');
      delete process.env.DATABASE_URL;
      process.env.AUTH_JWKS_URL = 'https://process';

      const read = envReader(dir);
      expect(read('DATABASE_URL')).toBe('postgresql://file');
      expect(read('AUTH_JWKS_URL')).toBe('https://process');

      const exit = jest.fn() as unknown as (code: number) => never;
      expect(runStartupCheck(read, exit).fatal).toEqual([]);
      expect(exit).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
