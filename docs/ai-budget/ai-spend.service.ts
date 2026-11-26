import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { sql } from '../../prisma/raw-sql';
import { periodStartOf } from './period';

/** The payer of calls that carry no organization. */
export const UNATTRIBUTED_ORG = 'unattributed';

export type SpendSource = 'response' | 'failed' | 'sync' | 'estimate';
export type SpendInitiator = 'user' | 'system';

export interface SpendEntry {
  /** The AI runtime's request id: the idempotency key. Null cannot be deduplicated. */
  runtimeRequestId: string | null;
  orgId: string;
  profileId: string | null;
  action: string | null;
  model: string | null;
  provider: string | null;
  costMicros: bigint;
  costEstimated: boolean;
  source: SpendSource;
  initiator: SpendInitiator | null;
  /** When the call happened; decides the period. */
  at: Date;
}

/**
 * Charges one model call to its organization, exactly once.
 *
 * The ledger insert (`ON CONFLICT runtimeRequestId DO NOTHING`) feeds the
 * period upsert through a CTE, so the running total moves only when the
 * ledger row is new. The same call reported twice, or by two concurrent
 * reporters, is charged once: the unique index decides the winner.
 */
export function chargeSpendSql(id: string, entry: SpendEntry, periodStart: Date) {
  return sql`
    WITH ins AS (
      INSERT INTO "AiSpend" ("id", "runtimeRequestId", "orgId", "profileId", "action", "model", "provider",
        "costMicros", "costEstimated", "source", "initiator", "at", "periodStart")
      VALUES (${id}, ${entry.runtimeRequestId}, ${entry.orgId}, ${entry.profileId}, ${entry.action}, ${entry.model}, ${entry.provider},
        ${entry.costMicros}, ${entry.costEstimated}, ${entry.source}, ${entry.initiator}, ${entry.at}, ${periodStart})
      ON CONFLICT ("runtimeRequestId") DO NOTHING
      RETURNING "orgId", "periodStart", "costMicros"
    )
    INSERT INTO "AiSpendPeriod" ("orgId", "periodStart", "spentMicros", "reservedMicros", "updatedAt")
    SELECT "orgId", "periodStart", "costMicros", 0, now() FROM ins
    ON CONFLICT ("orgId", "periodStart") DO UPDATE
      SET "spentMicros" = "AiSpendPeriod"."spentMicros" + EXCLUDED."spentMicros", "updatedAt" = now()
    RETURNING "spentMicros"`;
}

@Injectable()
export class AiSpendService {
  private readonly logger = new Logger(AiSpendService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Charges an entry. Returns true when this report charged it, false when
   * the call was already in the ledger. Never throws: a ledger write must
   * not fail the user's call, and a periodic sync fills any gap.
   */
  async charge(entry: SpendEntry): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<{ spentMicros: bigint }[]>(
        chargeSpendSql(randomUUID(), entry, periodStartOf(entry.at)),
      );
      return rows.length > 0;
    } catch (err) {
      const requestId = entry.runtimeRequestId ?? '(no runtime id)';
      this.logger.warn(`[ai-spend] could not charge ${requestId} to ${entry.orgId}: ${(err as Error).message}`);
      return false;
    }
  }
}
