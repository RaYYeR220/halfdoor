import { and, eq, isNull, lt } from 'drizzle-orm';
import { getDb } from '../client';
import { cardAccessLog, cards, moments, parentNotes } from '../schema';

export type CardRow = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;

/** Looked up by child: there is one card per child. */
export async function getCard(childId: string): Promise<CardRow | undefined> {
  const [row] = await getDb().select().from(cards).where(eq(cards.childId, childId));
  return row;
}

export async function getCardById(id: string): Promise<CardRow | undefined> {
  const [row] = await getDb().select().from(cards).where(eq(cards.id, id));
  return row;
}

export async function listCards(churchId: string): Promise<CardRow[]> {
  return getDb().select().from(cards).where(eq(cards.churchId, churchId));
}

export async function insertCard(values: NewCard): Promise<CardRow> {
  const [row] = await getDb().insert(cards).values(values).returning();
  return row;
}

export async function updateCard(id: string, patch: Partial<NewCard>): Promise<void> {
  await getDb().update(cards).set(patch).where(eq(cards.id, id));
}

/** Tenant-scoped: the card must belong to the church. */
export async function getCardForChild(churchId: string, childId: string): Promise<CardRow | undefined> {
  const [row] = await getDb().select().from(cards).where(and(eq(cards.churchId, churchId), eq(cards.childId, childId)));
  return row;
}

export async function listExpiredCards(now: Date): Promise<CardRow[]> {
  return getDb().select().from(cards).where(lt(cards.retainUntil, now));
}

/**
 * Hard-deletes the card, the child's moment notes and note drafts. Open access entries are closed, log rows
 * stay (card_id goes null) and ONE 'deleted' tombstone records who removed it. The tombstone is written only
 * when this call removed the row, so a purge racing a DELETE cannot double it. Returns whether it deleted.
 */
export async function deleteCardData(card: CardRow, by: { personId: string | null; role: string }, at: Date): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const gone = await tx.delete(cards).where(eq(cards.id, card.id)).returning({ id: cards.id });
    if (gone.length === 0) return false;
    await tx.update(cardAccessLog).set({ closedAt: at }).where(and(eq(cardAccessLog.childId, card.childId), isNull(cardAccessLog.closedAt)));
    await tx.update(moments).set({ noteEnc: null }).where(eq(moments.childId, card.childId));
    await tx.delete(parentNotes).where(eq(parentNotes.childId, card.childId));
    await tx.insert(cardAccessLog).values({
      cardId: null, childId: card.childId, viewerId: by.personId, role: by.role, reason: 'deleted', openedAt: at, closedAt: at,
    });
    return true;
  });
}
