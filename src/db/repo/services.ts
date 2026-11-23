import { eq } from 'drizzle-orm';
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
