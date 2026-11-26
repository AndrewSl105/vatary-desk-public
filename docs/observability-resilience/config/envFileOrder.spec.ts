import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

/**
 * Pins the two @nestjs/config behaviours the environment selection relies
 * on, so a dependency bump that changes either fails loudly:
 *
 *   1. envFilePath order is first-wins, so `.env.<mode>` outranks `.env`.
 *   2. A real process.env variable outranks both files.
 */
describe('ConfigModule envFilePath precedence', () => {
  // ConfigModule copies what it parses into process.env; clear it between
  // tests so a previous copy cannot outrank the files under test.
  const saved = process.env.DATABASE_URL;
  beforeEach(() => delete process.env.DATABASE_URL);
  afterAll(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  const makeEnvDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'envorder-'));
    writeFileSync(join(dir, '.env'), 'DATABASE_URL="shared-dot-env"\n');
    writeFileSync(
      join(dir, '.env.development'),
      'DATABASE_URL="mode-development"\n',
    );
    return dir;
  };

  const readDatabaseUrl = async (
    envFilePath: string[],
  ): Promise<string | undefined> => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: false,
          envFilePath,
          // Isolate from the ambient process.env of the test runner.
          ignoreEnvVars: true,
        }),
      ],
    }).compile();
    return moduleRef.get(ConfigService).get<string>('DATABASE_URL');
  };

  it('lets the FIRST listed file win — the mode file beats shared .env', async () => {
    const dir = makeEnvDir();
    await expect(
      readDatabaseUrl([join(dir, '.env.development'), join(dir, '.env')]),
    ).resolves.toBe('mode-development');
  });

  it('confirms the order actually matters (reversed list flips the winner)', async () => {
    const dir = makeEnvDir();
    await expect(
      readDatabaseUrl([join(dir, '.env'), join(dir, '.env.development')]),
    ).resolves.toBe('shared-dot-env');
  });

  it('falls through to the shared .env when the mode file is absent', async () => {
    // The fallback `assertEnvFilePresent` prevents in a local run.
    const dir = mkdtempSync(join(tmpdir(), 'envorder-'));
    writeFileSync(join(dir, '.env'), 'DATABASE_URL="shared-dot-env"\n');

    await expect(
      readDatabaseUrl([join(dir, '.env.development'), join(dir, '.env')]),
    ).resolves.toBe('shared-dot-env');
  });

  it('lets a real environment variable outrank every file', async () => {
    const dir = makeEnvDir();
    process.env.DATABASE_URL = 'real-env-var';
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: false,
            envFilePath: [join(dir, '.env.development'), join(dir, '.env')],
          }),
        ],
      }).compile();
      expect(moduleRef.get(ConfigService).get<string>('DATABASE_URL')).toBe(
        'real-env-var',
      );
    } finally {
      delete process.env.DATABASE_URL;
    }
  });
});
