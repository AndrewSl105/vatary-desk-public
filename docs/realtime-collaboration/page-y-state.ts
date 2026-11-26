import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** The stored Yjs state of each page that has one, used to copy pages between organizations. */
export async function storedPageYStates(
  db: Db,
  nodeIds: readonly string[],
): Promise<Map<string, Uint8Array>> {
  const rows = await db.pageYDoc.findMany({
    where: { nodeId: { in: [...nodeIds] } },
    select: { nodeId: true, state: true },
  });

  return new Map(rows.map((row) => [row.nodeId, new Uint8Array(row.state)]));
}

export async function storePageYState(db: Db, nodeId: string, state: Uint8Array): Promise<void> {
  await db.pageYDoc.create({ data: { nodeId, state: Buffer.from(state) } });
}
