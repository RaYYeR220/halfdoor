import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { assignments } from '../schema';

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;

export async function listAssignments(serviceId: string): Promise<Assignment[]> {
  return getDb().select().from(assignments).where(eq(assignments.serviceId, serviceId));
}

export async function insertAssignments(rows: NewAssignment[]): Promise<Assignment[]> {
  return getDb().insert(assignments).values(rows).returning();
}

export async function updateAssignment(id: string, patch: Partial<NewAssignment>): Promise<void> {
  await getDb().update(assignments).set(patch).where(eq(assignments.id, id));
}
