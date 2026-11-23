import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { checkins, services } from '../schema';

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

/** Latest check-in of the child for the service (a child can check in again after checking out). */
export async function getLatestCheckin(serviceId: string, childId: string): Promise<Checkin | undefined> {
  const [row] = await getDb().select().from(checkins)
    .where(and(eq(checkins.serviceId, serviceId), eq(checkins.childId, childId)))
    .orderBy(desc(checkins.checkedInAt)).limit(1);
  return row;
}

/** Latest check-in of the child at any service of the church. */
export async function getLatestCheckinInChurch(churchId: string, childId: string): Promise<Checkin | undefined> {
  const [row] = await getDb().select({ c: checkins }).from(checkins)
    .innerJoin(services, eq(services.id, checkins.serviceId))
    .where(and(eq(services.churchId, churchId), eq(checkins.childId, childId)))
    .orderBy(desc(checkins.checkedInAt)).limit(1);
  return row?.c;
}

export async function getOpenCheckin(serviceId: string, childId: string): Promise<Checkin | undefined> {
  const [row] = await getDb().select().from(checkins)
    .where(and(eq(checkins.serviceId, serviceId), eq(checkins.childId, childId), isNull(checkins.checkedOutAt)))
    .limit(1);
  return row;
}
