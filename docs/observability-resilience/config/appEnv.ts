import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Which environment, and so which database and env files, this process
 * targets. The server and the database CLI both read this decision, so
 * they can never disagree about which database they are talking to.
 */
export type AppEnv = 'development' | 'staging' | 'production';

const SHARED_ENV_FILE = '.env';
const DEFAULT_DATABASE_NAME = '(default)';
const LEADING_SLASH = /^\//;

/**
 * Resolves the target environment from `APP_ENV`, not `NODE_ENV`, which
 * belongs to the build tooling. Anything that is not exactly `production`
 * or `staging` resolves to development: the default must never be an
 * environment where a mistake is expensive.
 */
export function resolveAppEnv(raw = process.env.APP_ENV): AppEnv {
  const value = raw?.trim().toLowerCase();
  if (value === 'production') return 'production';
  if (value === 'staging') return 'staging';
  return 'development';
}

function modeEnvFile(env: AppEnv): string {
  return `${SHARED_ENV_FILE}.${env}`;
}

/**
 * Env files to load, highest priority first. Loading is first-wins and a
 * real environment variable beats every file, so `.env.<mode>` supplies
 * the per-environment values and `.env` the shared ones. Missing files are
 * not an error.
 */
export function envFilePaths(env: AppEnv = resolveAppEnv()): string[] {
  return [modeEnvFile(env), SHARED_ENV_FILE];
}

/**
 * `DATABASE_URL` as it was at process start, before any env file was read.
 * The config loader copies parsed file values into `process.env`, so a
 * later read could not tell a real variable from one loaded out of a file.
 */
const PREEXISTING_DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';

/** True when configuration arrives as real environment variables rather than files. */
export function isDeployedEnvironment(): boolean {
  return PREEXISTING_DATABASE_URL !== '';
}

/**
 * Fails closed when a local run cannot prove which database it selected:
 * without the mode file, loading would silently fall back to the shared
 * `.env`, which may point at another environment's database.
 */
export function assertEnvFilePresent(env: AppEnv = resolveAppEnv(), cwd = process.cwd()): void {
  const file = modeEnvFile(env);

  if (existsSync(resolve(cwd, file))) return;
  if (isDeployedEnvironment()) return;
  if (!existsSync(resolve(cwd, SHARED_ENV_FILE))) return;

  throw new Error(
    `Missing ${file}.\n\n` +
      `APP_ENV resolved to "${env}", so the ${env} database URL must come ` +
      `from server/${file}.\n` +
      `Refusing to fall back to server/${SHARED_ENV_FILE}: it may hold another ` +
      `environment's connection string.\n\n` +
      `Create server/${file} with:\n` +
      `  DATABASE_URL="postgresql://…"\n` +
      `  DATABASE_URL_UNPOOLED="postgresql://…"\n`,
  );
}

/**
 * The host and database name of a connection string, never its
 * credentials, logged at boot so the target announces itself.
 */
export function describeDatabase(url: string | undefined): string {
  if (!url?.trim()) {
    return 'unset';
  }

  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(LEADING_SLASH, '') || DEFAULT_DATABASE_NAME;
    return `${parsed.host}/${database}`;
  } catch {
    return 'unparseable';
  }
}
