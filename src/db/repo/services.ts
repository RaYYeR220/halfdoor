import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import { services } from '../schema';

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;

export async function getService(id: string): Promise<Service | undefined> {
  const [row] = await getDb().select().from(services).where(eq(services.id, id));
  return row;
}

export async function listServices(churchId: string): Promise<Service[]> {
  return getDb().select().from(services).where(eq(services.churchId, churchId)).orderBy(services.startsAt);
}

export async function insertServices(rows: NewService[]): Promise<Service[]> {
  return getDb().insert(services).values(rows).returning();
}

/** Tenant-scoped: the service must belong to the church. */
export async function getServiceInChurch(churchId: string, id: string): Promise<Service | undefined> {
  const [row] = await getDb().select().from(services).where(and(eq(services.churchId, churchId), eq(services.id, id)));
  return row;
}

/** Links services of this church to a lesson (ids outside the church are ignored). */
export async function setServicesLesson(churchId: string, serviceIds: string[], lessonId: string | null): Promise<void> {
  if (serviceIds.length === 0) return;
  await getDb().update(services).set({ lessonId }).where(and(eq(services.churchId, churchId), inArray(services.id, serviceIds)));
}
