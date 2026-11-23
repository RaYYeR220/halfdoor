import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { cards } from '../schema';

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
