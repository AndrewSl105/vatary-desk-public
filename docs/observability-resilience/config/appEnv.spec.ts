import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertEnvFilePresent,
  describeDatabase,
  envFilePaths,
  resolveAppEnv,
} from './appEnv';

describe('resolveAppEnv', () => {
  it('selects production only on an exact (case/space-insensitive) match', () => {
    expect(resolveAppEnv('production')).toBe('production');
    expect(resolveAppEnv('  PRODUCTION  ')).toBe('production');
  });

  it('selects staging only on an exact (case/space-insensitive) match', () => {
    expect(resolveAppEnv('staging')).toBe('staging');
    expect(resolveAppEnv('  STAGING  ')).toBe('staging');
  });

  // Every unrecognised value, including near-misses, lands on development.
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['development', 'development'],
    ['a typo', 'prod'],
    ['another typo', 'productoin'],
    ['a staging near-miss', 'stage'],
    ['another staging near-miss', 'stagging'],
  ])('falls back to development for %s', (_label, value) => {
    expect(resolveAppEnv(value)).toBe('development');
  });
});

describe('envFilePaths', () => {
  it('puts the mode file ahead of the shared .env (first wins)', () => {
    expect(envFilePaths('development')).toEqual(['.env.development', '.env']);
    expect(envFilePaths('staging')).toEqual(['.env.staging', '.env']);
    expect(envFilePaths('production')).toEqual(['.env.production', '.env']);
  });
});

/**
 * The deployed/local split is a snapshot of DATABASE_URL taken when the
 * module loads, so local-run cases load their own copy with no
 * DATABASE_URL in the environment.
 */
function loadAsLocalRun(): typeof import('./appEnv') {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    let mod: typeof import('./appEnv') | undefined;
    jest.isolateModules(() => {
      mod = jest.requireActual<typeof import('./appEnv')>('./appEnv');
    });
    return mod!;
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  }
}

describe('assertEnvFilePresent', () => {
  it('throws when the mode file is missing, instead of falling back to .env', () => {
    const local = loadAsLocalRun();
    const dir = mkdtempSync(join(tmpdir(), 'appenv-'));
    // A shared .env exists and is deliberately not accepted as a substitute.
    writeFileSync(join(dir, '.env'), 'DATABASE_URL="postgres://other-env/db"\n');

    expect(() => local.assertEnvFilePresent('development', dir)).toThrow(
      /Missing \.env\.development/,
    );
  });

  it('passes once the mode file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'appenv-'));
    writeFileSync(join(dir, '.env'), 'DATABASE_URL="postgres://other-env/db"\n');
    writeFileSync(
      join(dir, '.env.development'),
      'DATABASE_URL="postgres://dev/db"\n',
    );

    expect(() => assertEnvFilePresent('development', dir)).not.toThrow();
  });

  it('passes when no env files exist at all (deployed services)', () => {
    // Deployed containers get real environment variables and no env files.
    const dir = mkdtempSync(join(tmpdir(), 'appenv-'));

    expect(() => assertEnvFilePresent('production', dir)).not.toThrow();
  });

  // The config loader copies parsed env-file values into process.env, so a
  // live read could not tell a file value from a real variable.
  it('is not fooled by a DATABASE_URL written into process.env after startup', () => {
    const local = loadAsLocalRun();
    const dir = mkdtempSync(join(tmpdir(), 'appenv-'));
    writeFileSync(join(dir, '.env'), 'DATABASE_URL="postgres://other-env/db"\n');

    // Exactly what ConfigModule.assignVariablesToProcess does.
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://other-env/db';
    try {
      expect(local.isDeployedEnvironment()).toBe(false);
      expect(() => local.assertEnvFilePresent('development', dir)).toThrow(
        /Missing \.env\.development/,
      );
    } finally {
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
    }
  });
});

describe('describeDatabase', () => {
  it('reports host and database name', () => {
    expect(
      describeDatabase('postgresql://u:p@db-dev.example.com/appdb'),
    ).toBe('db-dev.example.com/appdb');
  });

  it('never leaks the password', () => {
    const described = describeDatabase(
      'postgresql://user:sup3rs3cret@db.example.com/appdb?sslmode=require',
    );
    expect(described).not.toContain('sup3rs3cret');
    expect(described).not.toContain('user');
  });

  it('does not echo an unparseable string back', () => {
    expect(describeDatabase('not a url with a s3cret in it')).toBe(
      'unparseable',
    );
    expect(describeDatabase(undefined)).toBe('unset');
    expect(describeDatabase('  ')).toBe('unset');
  });
});
