import { PrismaPg } from '@prisma/adapter-pg';
import type { ConfigService } from '@nestjs/config';

import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { JobHealthService } from '../src/observability/job-health.service';
import { AiSpendService } from './ai-spend.service';
import { CreditGate } from './credit-gate.service';
import { periodStartOf } from './period';
import { intDatabaseUrl } from './int-db';

/**
 * The AI budget gate against a real Postgres: concurrent admissions of one
 * org overshoot by at most one action, a spent month refuses, a release and
 * the reaper hand reservations back, and enforcement off never refuses.
 */

const MICROS_PER_USD = 1_000_000;
const LIMIT_MICROS = 3 * MICROS_PER_USD;
const ADMIT_ESTIMATE_MICROS = 10_000n;
const STEP_ESTIMATE_MICROS = 20_000n;
const CONCURRENT_ADMISSIONS = 10;
const STEP_COUNT = 5;
const PAST_STEPS_TTL_MS = 2 * 60 * 60_000;

let sequence = 0;
const newOrgId = () => `int-gate-${Date.now()}-${sequence++}`;

describe('CreditGate against Postgres', () => {
  let prisma: PrismaClient;
  let gate: CreditGate;
  let spend: AiSpendService;
  const orgs: string[] = [];
  const previousEnforce = process.env.AI_LIMIT_ENFORCE;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: intDatabaseUrl() }) });
    const env = { get: () => undefined } as unknown as ConfigService;
    const health = { register: jest.fn(), record: jest.fn() } as unknown as JobHealthService;
    gate = new CreditGate(prisma as unknown as PrismaService, health, env);
    spend = new AiSpendService(prisma as unknown as PrismaService);
    process.env.AI_LIMIT_ENFORCE = '1';
  });

  afterAll(async () => {
    process.env.AI_LIMIT_ENFORCE = previousEnforce;
    await prisma.aiSpendReservation.deleteMany({ where: { orgId: { in: orgs } } });
    await prisma.aiSpend.deleteMany({ where: { orgId: { in: orgs } } });
    await prisma.aiSpendPeriod.deleteMany({ where: { orgId: { in: orgs } } });
    await prisma.$disconnect();
  });

  const freshOrg = () => {
    const orgId = newOrgId();
    orgs.push(orgId);
    return orgId;
  };

  const charge = (orgId: string, micros: bigint) =>
    spend.charge({
      runtimeRequestId: `${orgId}-${micros}-${Math.random()}`,
      orgId,
      profileId: null,
      action: 'TABLE_ASK',
      model: null,
      provider: null,
      costMicros: micros,
      costEstimated: false,
      source: 'response',
      initiator: 'user',
      at: new Date(),
    });

  const reservedFor = async (orgId: string) => (await gate.state(orgId, LIMIT_MICROS)).reserved;

  it('refuses a new action once the month is spent; the crossing action was allowed', async () => {
    const orgId = freshOrg();
    await charge(orgId, BigInt(LIMIT_MICROS) - 5_000n);

    const crossing = await gate.admit(orgId, LIMIT_MICROS);
    expect(crossing.allowed).toBe(true);

    const next = await gate.admit(orgId, LIMIT_MICROS);
    expect(next).toMatchObject({ allowed: false, state: { exhausted: true } });
  });

  it('lets at most one concurrent action past the line', async () => {
    const orgId = freshOrg();
    await charge(orgId, BigInt(LIMIT_MICROS) - ADMIT_ESTIMATE_MICROS);

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_ADMISSIONS }, () => gate.admit(orgId, LIMIT_MICROS)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
  });

  it('returns a reservation on release (idempotently) and through the reaper', async () => {
    const orgId = freshOrg();

    const admission = await gate.admit(orgId, LIMIT_MICROS);
    expect(await reservedFor(orgId)).toBe(ADMIT_ESTIMATE_MICROS);
    await gate.release(admission.reservationId);
    await gate.release(admission.reservationId);
    expect(await reservedFor(orgId)).toBe(0n);

    const steps = await gate.reserveSteps(orgId, LIMIT_MICROS, STEP_COUNT, 'DESK_WRITE_SECTION', `run:${orgId}`);
    expect(steps.allowed).toBe(true);
    expect(await reservedFor(orgId)).toBe(STEP_ESTIMATE_MICROS * BigInt(STEP_COUNT));

    await gate.reap(new Date(Date.now() + PAST_STEPS_TTL_MS));
    expect(await reservedFor(orgId)).toBe(0n);
    expect(await prisma.aiSpendReservation.count({ where: { orgId } })).toBe(0);
  });

  it('never refuses with enforcement off or on an unlimited plan', async () => {
    const orgId = freshOrg();
    const overspent = 3n * BigInt(LIMIT_MICROS);
    await charge(orgId, overspent);

    process.env.AI_LIMIT_ENFORCE = '';
    expect((await gate.admit(orgId, LIMIT_MICROS)).allowed).toBe(true);

    process.env.AI_LIMIT_ENFORCE = '1';
    expect((await gate.admit(orgId, null)).allowed).toBe(true);
    expect((await gate.admit(orgId, 0)).allowed).toBe(false);

    const row = await prisma.aiSpendPeriod.findUnique({
      where: { orgId_periodStart: { orgId, periodStart: periodStartOf(new Date()) } },
    });
    expect(row?.spentMicros).toBe(overspent);
  });
});
