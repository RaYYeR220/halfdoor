import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb, type Db } from '../client';
import { churches } from '../schema';

export type Church = typeof churches.$inferSelect;
export type NewChurch = typeof churches.$inferInsert;

export async function getChurch(id: string): Promise<Church | undefined> {
  const [row] = await getDb().select().from(churches).where(eq(churches.id, id));
  return row;
}

/** Same as getChurch but on a given executor (e.g. inside a transaction). */
export async function getChurchIn(ex: Pick<Db, 'select'>, id: string): Promise<Church | undefined> {
  const [row] = await ex.select().from(churches).where(eq(churches.id, id));
  return row;
}

export async function getChurchBySlug(slug: string): Promise<Church | undefined> {
  const [row] = await getDb().select().from(churches).where(eq(churches.slug, slug));
  return row;
}

export async function insertChurch(values: NewChurch): Promise<Church> {
  const [row] = await getDb().insert(churches).values(values).returning();
  return row;
}

export async function listExpiredSandboxes(now: Date): Promise<Church[]> {
  return getDb().select().from(churches).where(and(eq(churches.mode, 'sandbox'), lt(churches.expiresAt, now)));
}

/** People, cards, services and the rest go with it via ON DELETE CASCADE. */
export async function deleteChurch(id: string): Promise<void> {
  await getDb().delete(churches).where(eq(churches.id, id));
}

/** Sandboxes created since `since`, optionally only by one creator hash (demo rate limiting). */
export async function countSandboxesSince(since: Date, creatorHash?: string): Promise<number> {
  const where = and(eq(churches.mode, 'sandbox'), gte(churches.createdAt, since), creatorHash ? eq(churches.creatorHash, creatorHash) : undefined);
  const [row] = await getDb().select({ n: count() }).from(churches).where(where);
  return Number(row?.n ?? 0);
}

export type SandboxLimits = { creatorHash: string; perHash: number; hashSince: Date; perDay: number; daySince: Date };

const DEMO_LOCK_KEY = 7340118;

/** Atomically (global advisory lock) re-count and insert the church row; null when a limit is hit. */
export async function insertSandboxChurchLimited(values: NewChurch, limits: SandboxLimits): Promise<Church | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${DEMO_LOCK_KEY})`);
    const n = async (since: Date, hash?: string) => {
      const where = and(eq(churches.mode, 'sandbox'), gte(churches.createdAt, since), hash ? eq(churches.creatorHash, hash) : undefined);
      const [row] = await tx.select({ n: count() }).from(churches).where(where);
      return Number(row?.n ?? 0);
    };
    if ((await n(limits.hashSince, limits.creatorHash)) >= limits.perHash || (await n(limits.daySince)) >= limits.perDay) return null;
    const [row] = await tx.insert(churches).values({ ...values, creatorHash: limits.creatorHash }).returning();
    return row;
  });
}
