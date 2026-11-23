import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { checkins } from '../schema';

export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;

export async function listCheckins(serviceId: string): Promise<Checkin[]> {
  return getDb().select().from(checkins).where(eq(checkins.serviceId, serviceId));
}

export async function insertCheckin(values: NewCheckin): Promise<Checkin> {
  const [row] = await getDb().insert(checkins).values(values).returning();
  return row;
}

export async function updateCheckin(id: string, patch: Partial<NewCheckin>): Promise<void> {
  await getDb().update(checkins).set(patch).where(eq(checkins.id, id));
}
