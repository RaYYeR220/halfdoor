import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { cardAccessLog } from '../schema';

export type AccessEntry = typeof cardAccessLog.$inferSelect;
export type NewAccessEntry = typeof cardAccessLog.$inferInsert;

export async function listAccess(cardId: string): Promise<AccessEntry[]> {
  return getDb().select().from(cardAccessLog).where(eq(cardAccessLog.cardId, cardId)).orderBy(cardAccessLog.openedAt);
}

export async function insertAccess(values: NewAccessEntry): Promise<AccessEntry> {
  const [row] = await getDb().insert(cardAccessLog).values(values).returning();
  return row;
}

export async function updateAccess(id: string, patch: Partial<NewAccessEntry>): Promise<void> {
  await getDb().update(cardAccessLog).set(patch).where(eq(cardAccessLog.id, id));
}
