import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse } from 'dotenv';

import { envFilePaths, resolveAppEnv } from './appEnv';
import { checkEnv, formatEnvSummary, type EnvCheckResult } from './startup-check';

const FATAL_EXIT_CODE = 1;

/**
 * Reads variables with the config loader's precedence (a real environment
 * variable, then `.env.<mode>`, then `.env`) before Nest exists. Values
 * stay in this closure; only presence leaves it.
 */
export function envReader(cwd = process.cwd()): (name: string) => string | undefined {
  const files = envFilePaths()
    .map((file) => resolve(cwd, file))
    .filter((file) => existsSync(file))
    .map((file) => parse(readFileSync(file)));

  return (name) => process.env[name] ?? files.find((vars) => name in vars)?.[name];
}

/**
 * The startup check, run before the application is created, so a missing
 * fatal variable is named in plain words instead of surfacing as a stack
 * trace. One block in the log; exits with a non-zero code on a fatal.
 */
export function runStartupCheck(
  read = envReader(),
  exit: (code: number) => never = (code) => process.exit(code),
): EnvCheckResult {
  const logger = new Logger('Env');
  const result = checkEnv(read, resolveAppEnv(read('APP_ENV')));
  const lines = formatEnvSummary(result);

  if (result.fatal.length > 0) {
    const missing = result.fatal.map((row) => row.name).join(', ');
    logger.error([...lines, `startup stopped: set ${missing}`].join('\n'));
    exit(FATAL_EXIT_CODE);
  } else if (result.warn.length > 0) {
    logger.warn(lines.join('\n'));
  } else {
    logger.log(lines[0]);
  }

  return result;
}

/** The same check for the admin panel, through the loaded configuration. */
@Injectable()
export class StartupCheckService {
  constructor(private readonly config: ConfigService) {}

  check(): EnvCheckResult {
    const appEnv = resolveAppEnv(this.config.get<string>('APP_ENV') ?? process.env.APP_ENV);
    return checkEnv((name) => this.config.get<string>(name), appEnv);
  }
}
