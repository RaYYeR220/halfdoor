import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '../client';
import { churches } from '../schema';

export type Church = typeof churches.$inferSelect;
export type NewChurch = typeof churches.$inferInsert;

export async function getChurch(id: string): Promise<Church | undefined> {
  const [row] = await getDb().select().from(churches).where(eq(churches.id, id));
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
