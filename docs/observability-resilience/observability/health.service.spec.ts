jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import 'reflect-metadata';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

function build(db: 'ok' | 'down', orch: 'ok' | 'down' | 'not_configured') {
  const prisma = {
    diagnosticsConfig: {
      findFirst: db === 'ok' ? jest.fn().mockResolvedValue(null) : jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    },
  };
  const orchestrator = { ping: jest.fn().mockResolvedValue(orch) };
  return new HealthService(prisma as unknown as PrismaService, orchestrator);
}

describe('HealthService.readiness', () => {
  it('ok when the database and the orchestrator answer', async () => {
    await expect(build('ok', 'ok').readiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'ok', orchestrator: 'ok' },
    });
  });
  it('degraded when the database is down', async () => {
    await expect(build('down', 'ok').readiness()).resolves.toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });
  it('degraded when the orchestrator is down; an unconfigured one does not count', async () => {
    await expect(build('ok', 'down').readiness()).resolves.toMatchObject({ status: 'degraded' });
    await expect(build('ok', 'not_configured').readiness()).resolves.toMatchObject({ status: 'ok' });
  });
});
