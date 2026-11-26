import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { jobEnabled, scheduleLabel } from '../../common/job-flags';
import { JobHealthService } from '../../observability/job-health.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sql } from '../../prisma/raw-sql';
import { periodEndOf, periodStartOf } from './period';

/** The refusal code; the client shows it as the plan-limit notice. */
export const AI_BUDGET_EXHAUSTED_CODE = 'AI_BUDGET_EXHAUSTED';

const MS_PER_MINUTE = 60_000;

/** Held by an admitted user action until its response ends: an estimate, not a price. */
const DEFAULT_ADMIT_MICROS = 10_000;
/** Held per step of a multi-step action. */
const DEFAULT_STEP_MICROS = 20_000;
/** A reservation nobody released is freed after this long. */
const DEFAULT_TTL_MS = 15 * MS_PER_MINUTE;
/** A multi-step action may outlive one request. */
const STEPS_TTL_MS = 60 * MS_PER_MINUTE;
const MIN_STEPS = 1;

const ADMIT_REASON = 'admit';
const STEPS_REASON_PREFIX = 'steps:';

const REAP_JOB = 'aiSpend.reap';
const REAP_SCHEDULE = '30 */5 * * * *';
const REAP_SCHEDULE_LABEL = 'every 5 minutes';
/** The reaper has its own switch: stopping it would leak holds into the month's budget. */
const REAP_FLAG = 'AI_CREDIT_REAP_ENABLED';

const ENFORCE_FLAG = 'AI_LIMIT_ENFORCE';
const TRUTHY_FLAG_VALUES = new Set(['1', 'true', 'on', 'yes']);

const ADMIT_ESTIMATE_ENV = 'AI_ADMIT_ESTIMATE_MICROS';
const STEP_ESTIMATE_ENV = 'AI_STEP_ESTIMATE_MICROS';

/** Overrun log keys kept before the set is reset. */
const MAX_OVERRUN_LOG_KEYS = 10_000;
/** `YYYY-MM` from an ISO timestamp. */
const MONTH_KEY_LENGTH = 7;

/**
 * Whether an action is refused once the month's AI budget is spent. When
 * off, spend is still reserved and counted, and an overrun is only logged.
 */
export function aiLimitEnforced(): boolean {
  return TRUTHY_FLAG_VALUES.has((process.env[ENFORCE_FLAG] ?? '').trim().toLowerCase());
}

/**
 * Takes `micros` of the org's budget for this period, atomically, if the
 * period is not yet spent.
 *
 * `ON CONFLICT … DO UPDATE` locks the period row, so two concurrent
 * admissions cannot both read "room left" and both take it. The condition
 * is `spent + reserved < limit`: the action that crosses the line is let
 * through and the next one is refused, so an org overshoots by at most one
 * action. A NULL limit always reserves.
 *
 * The reservation row is written in the same statement by a data-modifying
 * CTE, and only when the period row was actually updated.
 */
export function reserveSql(
  id: string,
  orgId: string,
  periodStart: Date,
  micros: bigint,
  limit: bigint | null,
  reason: string,
  expiresAt: Date,
) {
  return sql`
    WITH up AS (
      INSERT INTO "AiSpendPeriod" ("orgId", "periodStart", "spentMicros", "reservedMicros", "updatedAt")
      VALUES (${orgId}, ${periodStart}, 0, ${micros}, now())
      ON CONFLICT ("orgId", "periodStart") DO UPDATE
        SET "reservedMicros" = "AiSpendPeriod"."reservedMicros" + EXCLUDED."reservedMicros", "updatedAt" = now()
        WHERE ${limit}::bigint IS NULL OR "AiSpendPeriod"."spentMicros" + "AiSpendPeriod"."reservedMicros" < ${limit}::bigint
      RETURNING "spentMicros", "reservedMicros"
    ), res AS (
      INSERT INTO "AiSpendReservation" ("id", "orgId", "periodStart", "micros", "reason", "expiresAt")
      SELECT ${id}, ${orgId}, ${periodStart}, ${micros}, ${reason}, ${expiresAt} FROM up
      RETURNING "id"
    )
    SELECT "spentMicros", "reservedMicros" FROM up`;
}

/** Frees one reservation. Idempotent: a second release deletes nothing and moves nothing. */
export function releaseSql(id: string) {
  return sql`
    WITH d AS (
      DELETE FROM "AiSpendReservation" WHERE "id" = ${id}
      RETURNING "orgId", "periodStart", "micros"
    )
    UPDATE "AiSpendPeriod" p
       SET "reservedMicros" = GREATEST(0, p."reservedMicros" - d."micros"), "updatedAt" = now()
      FROM d
     WHERE p."orgId" = d."orgId" AND p."periodStart" = d."periodStart"`;
}

/** Frees every reservation past its expiry, whose holder ended without releasing it. */
export function reapReservationsSql(now: Date) {
  return sql`
    WITH d AS (
      DELETE FROM "AiSpendReservation" WHERE "expiresAt" < ${now}
      RETURNING "orgId", "periodStart", "micros"
    ), s AS (
      SELECT "orgId", "periodStart", SUM("micros") AS m FROM d GROUP BY "orgId", "periodStart"
    )
    UPDATE "AiSpendPeriod" p
       SET "reservedMicros" = GREATEST(0, p."reservedMicros" - s.m), "updatedAt" = now()
      FROM s
     WHERE p."orgId" = s."orgId" AND p."periodStart" = s."periodStart"`;
}

export interface BudgetState {
  /** µ$ charged this period. */
  spent: bigint;
  /** µ$ held by actions in flight. */
  reserved: bigint;
  /** The period's budget in µ$; null means unlimited. */
  limit: bigint | null;
  /** `spent + reserved` has reached the limit. */
  exhausted: boolean;
  periodStart: Date;
  resetsAt: Date;
}

export interface Admission {
  allowed: boolean;
  /** The reservation to release when the action ends; null when none was taken. */
  reservationId: string | null;
  state: BudgetState;
  enforce: boolean;
}

type PeriodTotals = { spentMicros: bigint; reservedMicros: bigint };

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** A limit in µ$ as a non-negative bigint; null stays null (unlimited). */
function toCap(limit: number | null): bigint | null {
  return limit === null ? null : BigInt(Math.max(0, Math.round(limit)));
}

/**
 * The AI budget gate. One indexed row per org and period, read without a
 * cache; reservations make "is there room" and "take it" one atomic step.
 * The limit is passed in, so this service does not depend on billing.
 */
@Injectable()
export class CreditGate implements OnModuleInit {
  private readonly logger = new Logger(CreditGate.name);
  private readonly admitMicros: bigint;
  private readonly stepMicros: bigint;
  private readonly reapEnabled: boolean;
  private readonly overrunLogged = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobHealth: JobHealthService,
    env: ConfigService,
  ) {
    this.admitMicros = BigInt(positiveInt(env.get<string>(ADMIT_ESTIMATE_ENV), DEFAULT_ADMIT_MICROS));
    this.stepMicros = BigInt(positiveInt(env.get<string>(STEP_ESTIMATE_ENV), DEFAULT_STEP_MICROS));
    this.reapEnabled = jobEnabled(env, REAP_FLAG, true);
  }

  onModuleInit(): void {
    this.jobHealth.register(REAP_JOB, scheduleLabel(this.reapEnabled, REAP_SCHEDULE_LABEL, REAP_FLAG));
  }

  /** The org's budget this period, read fresh. */
  async state(orgId: string, limit: number | null, now = new Date()): Promise<BudgetState> {
    const periodStart = periodStartOf(now);
    const row = await this.prisma.aiSpendPeriod.findUnique({
      where: { orgId_periodStart: { orgId, periodStart } },
    });

    const spent = row?.spentMicros ?? 0n;
    const reserved = row?.reservedMicros ?? 0n;
    const cap = toCap(limit);

    return {
      spent,
      reserved,
      limit: cap,
      exhausted: cap !== null && spent + reserved >= cap,
      periodStart,
      resetsAt: periodEndOf(now),
    };
  }

  /** Admits one user action by reserving the admission estimate if the period has room. */
  admit(orgId: string, limit: number | null): Promise<Admission> {
    return this.take(orgId, limit, this.admitMicros, ADMIT_REASON);
  }

  /**
   * Reserves `steps` × the per-step estimate for an action whose size is
   * known up front. Held until `release`, or until the reaper frees it.
   */
  reserveSteps(orgId: string, limit: number | null, steps: number, action: string, id?: string): Promise<Admission> {
    const stepCount = BigInt(Math.max(MIN_STEPS, Math.floor(steps)));
    return this.take(orgId, limit, this.stepMicros * stepCount, `${STEPS_REASON_PREFIX}${action}`, id, STEPS_TTL_MS);
  }

  /** Releases a reservation; on failure the reaper frees it at expiry. */
  async release(reservationId: string | null | undefined): Promise<void> {
    if (!reservationId) {
      return;
    }

    try {
      await this.prisma.$executeRaw(releaseSql(reservationId));
    } catch (err) {
      this.logger.warn(`[credit-gate] could not release ${reservationId}: ${(err as Error).message}`);
    }
  }

  @Cron(REAP_SCHEDULE)
  async reap(now = new Date()): Promise<number> {
    if (!this.reapEnabled) {
      return 0;
    }

    const startedAt = Date.now();
    try {
      const freed = await this.prisma.$executeRaw(reapReservationsSql(now));
      this.jobHealth.record(REAP_JOB, true, Date.now() - startedAt);
      return freed;
    } catch (err) {
      this.jobHealth.record(REAP_JOB, false, Date.now() - startedAt, (err as Error).message);
      return 0;
    }
  }

  private async refuse(orgId: string, limit: number | null, now: Date, enforce: boolean): Promise<Admission> {
    return { allowed: false, reservationId: null, state: await this.state(orgId, limit, now), enforce };
  }

  private async take(
    orgId: string,
    limit: number | null,
    micros: bigint,
    reason: string,
    fixedId?: string,
    ttlMs = DEFAULT_TTL_MS,
  ): Promise<Admission> {
    const enforce = aiLimitEnforced();
    const now = new Date();
    const cap = toCap(limit);
    const periodStart = periodStartOf(now);
    const id = fixedId ?? randomUUID();

    if (enforce && cap === 0n) {
      return this.refuse(orgId, limit, now, enforce);
    }

    const expiresAt = new Date(now.getTime() + ttlMs);
    const rows = await this.prisma.$queryRaw<PeriodTotals[]>(
      reserveSql(id, orgId, periodStart, micros, enforce ? cap : null, reason, expiresAt),
    );

    if (rows.length === 0) {
      return this.refuse(orgId, limit, now, enforce);
    }

    const { spentMicros: spent, reservedMicros: reserved } = rows[0];
    const exhausted = cap !== null && spent + reserved - micros >= cap;

    if (exhausted && !enforce) {
      this.logOverrun(orgId, spent, cap);
    }

    return {
      allowed: true,
      reservationId: id,
      state: { spent, reserved, limit: cap, exhausted, periodStart, resetsAt: periodEndOf(now) },
      enforce,
    };
  }

  /** Logs an unenforced overrun once per org and month. */
  private logOverrun(orgId: string, spent: bigint, cap: bigint): void {
    const month = periodStartOf(new Date()).toISOString().slice(0, MONTH_KEY_LENGTH);
    const key = `${orgId}|${month}`;
    if (this.overrunLogged.has(key)) {
      return;
    }

    if (this.overrunLogged.size > MAX_OVERRUN_LOG_KEYS) {
      this.overrunLogged.clear();
    }
    this.overrunLogged.add(key);
    this.logger.warn(`[ai-budget] org ${orgId} spent ${spent} of ${cap} µ$ this month (enforcement off: not refused)`);
  }
}
