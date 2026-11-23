import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { moments } from '../schema';

export type Moment = typeof moments.$inferSelect;
export type NewMoment = typeof moments.$inferInsert;

export async function listMoments(serviceId: string): Promise<Moment[]> {
  return getDb().select().from(moments).where(eq(moments.serviceId, serviceId)).orderBy(moments.at);
}

export async function listMomentsForChild(childId: string): Promise<Moment[]> {
  return getDb().select().from(moments).where(eq(moments.childId, childId)).orderBy(moments.at);
}

export async function insertMoments(rows: NewMoment[]): Promise<Moment[]> {
  return getDb().insert(moments).values(rows).returning();
}
