jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import type { PrismaService } from '../prisma/prisma.service';
import { AgentTokenService, hashAgentToken } from './agent-token.service';

const ROW = {
  id: 'tok-1',
  scopes: ['feedback:read'],
  revokedAt: null as Date | null,
  expiresAt: null as Date | null,
  profile: {
    authUserId: 'auth-1',
    email: 'admin@b.co',
    displayName: null,
    role: 'SUPER_ADMIN',
  },
};

function build(row: typeof ROW | null) {
  const findUnique = jest.fn<Promise<typeof ROW | null>, [{ where: unknown }]>().mockResolvedValue(row);
  const update = jest.fn().mockResolvedValue({});
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'tok-1', ...args.data }),
  );
  const prisma = { agentToken: { findUnique, update, create } } as unknown as PrismaService;
  return { service: new AgentTokenService(prisma), tx: prisma as never, findUnique, update, create };
}

describe('AgentTokenService', () => {
  it('resolves a live token to the profile, looked up by hash', async () => {
    const { service, findUnique } = build(ROW);
    await expect(service.resolve('fbk_x')).resolves.toMatchObject({
      id: 'tok-1',
      scopes: ['feedback:read'],
      user: { sub: 'auth-1', email: 'admin@b.co' },
    });
    expect(findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashAgentToken('fbk_x') });
  });

  it('refuses an unknown token', async () => {
    await expect(build(null).service.resolve('fbk_x')).resolves.toBeNull();
  });

  it('refuses a revoked token', async () => {
    const { service } = build({ ...ROW, revokedAt: new Date() });
    await expect(service.resolve('fbk_x')).resolves.toBeNull();
  });

  it('refuses an expired token and takes one still in date', async () => {
    const past = build({ ...ROW, expiresAt: new Date(Date.now() - 1000) });
    await expect(past.service.resolve('fbk_x')).resolves.toBeNull();
    const future = build({ ...ROW, expiresAt: new Date(Date.now() + 60_000) });
    await expect(future.service.resolve('fbk_x')).resolves.not.toBeNull();
  });

  it('refuses a token whose owner is no longer a super-admin', async () => {
    const { service, update } = build({ ...ROW, profile: { ...ROW.profile, role: 'USER' } });
    await expect(service.resolve('fbk_x')).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('bumps lastUsedAt once per throttle window', async () => {
    const { service, update } = build(ROW);
    await service.resolve('fbk_x');
    await service.resolve('fbk_x');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('mints fbk_ + 32 random bytes and stores only the hash', async () => {
    const { service, tx, create } = build(ROW);
    const { token, prefix } = await service.create(
      {
        profileId: 'p1',
        name: 'laptop',
        scopes: ['feedback:read'],
        expiresAt: null,
      },
      tx,
    );
    expect(token).toMatch(/^fbk_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(token.slice(0, 8));
    const { data } = create.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashAgentToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });
});
