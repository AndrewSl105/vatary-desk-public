import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ORCHESTRATOR_PING, type OrchestratorPingPort } from '../common/orchestrator-ping.port';

export type CheckState = 'ok' | 'down' | 'not_configured';
export type ReadinessStatus = 'ok' | 'degraded';

export interface Readiness {
  status: ReadinessStatus;
  checks: { database: CheckState; orchestrator: CheckState };
}

/**
 * Readiness for an external uptime monitor: green only when the API can
 * reach its database and the workflow orchestrator. An orchestrator that is
 * not configured does not count as down. Reports states only, never error
 * text.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORCHESTRATOR_PING) private readonly orchestrator: OrchestratorPingPort,
  ) {}

  async readiness(): Promise<Readiness> {
    const [database, orchestrator] = await Promise.all([this.database(), this.orchestrator.ping()]);
    const healthy = database === 'ok' && orchestrator !== 'down';

    return { status: healthy ? 'ok' : 'degraded', checks: { database, orchestrator } };
  }

  /** A typed read of a one-row table proves the database answers. */
  private async database(): Promise<CheckState> {
    try {
      await this.prisma.diagnosticsConfig.findFirst({ select: { id: true } });
      return 'ok';
    } catch {
      return 'down';
    }
  }
}
