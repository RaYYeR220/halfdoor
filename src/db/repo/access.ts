import { and, eq, inArray, isNull } from 'drizzle-orm';
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

/** Several rows in one statement (sandbox history). */
export async function insertAccessRows(rows: NewAccessEntry[]): Promise<void> {
  if (rows.length > 0) await getDb().insert(cardAccessLog).values(rows);
}

export async function updateAccess(id: string, patch: Partial<NewAccessEntry>): Promise<void> {
  await getDb().update(cardAccessLog).set(patch).where(eq(cardAccessLog.id, id));
}

export type OpenAccess = { id: string; childId: string | null; serviceId: string | null };

/** The viewer's still-open entries (no join: a deleted card must not hide them). */
export async function listOpenAccess(viewerId: string): Promise<OpenAccess[]> {
  return getDb().select({ id: cardAccessLog.id, childId: cardAccessLog.childId, serviceId: cardAccessLog.serviceId })
    .from(cardAccessLog)
    .where(and(eq(cardAccessLog.viewerId, viewerId), isNull(cardAccessLog.closedAt)));
}

export async function closeAccess(ids: string[], at: Date): Promise<void> {
  if (ids.length === 0) return;
  await getDb().update(cardAccessLog).set({ closedAt: at }).where(and(inArray(cardAccessLog.id, ids), isNull(cardAccessLog.closedAt)));
}

/** Log for a child that survives deleting the card (card_id becomes null, tombstone rows say 'deleted'). */
export async function listAccessForChild(childId: string): Promise<AccessEntry[]> {
  return getDb().select().from(cardAccessLog).where(eq(cardAccessLog.childId, childId)).orderBy(cardAccessLog.openedAt);
}
