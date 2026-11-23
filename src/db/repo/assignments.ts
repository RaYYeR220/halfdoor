import { and, eq } from 'drizzle-orm';
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

/** Callers resolve the service through its church first; (service, child) is unique. */
export async function getAssignmentFor(serviceId: string, childId: string): Promise<Assignment | undefined> {
  const [row] = await getDb().select().from(assignments).where(and(eq(assignments.serviceId, serviceId), eq(assignments.childId, childId)));
  return row;
}

export async function listAssignmentsForChild(childId: string): Promise<Assignment[]> {
  return getDb().select().from(assignments).where(eq(assignments.childId, childId));
}
