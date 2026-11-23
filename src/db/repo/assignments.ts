import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import { assignments, services } from '../schema';

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

export type AssignmentWithService = Assignment & { startsAt: Date; endsAt: Date };

/** Every assignment of the church's services, with the service window. */
export async function listAssignmentsInChurch(churchId: string): Promise<AssignmentWithService[]> {
  const rows = await getDb().select({ a: assignments, startsAt: services.startsAt, endsAt: services.endsAt })
    .from(assignments).innerJoin(services, eq(assignments.serviceId, services.id)).where(eq(services.churchId, churchId));
  return rows.map((r) => ({ ...r.a, startsAt: r.startsAt, endsAt: r.endsAt }));
}

/** Tenant-scoped: only rows whose service belongs to the church. */
export async function getAssignmentsInChurch(churchId: string, ids: string[]): Promise<Assignment[]> {
  if (ids.length === 0) return [];
  const rows = await getDb().select({ a: assignments }).from(assignments)
    .innerJoin(services, eq(assignments.serviceId, services.id))
    .where(and(eq(services.churchId, churchId), inArray(assignments.id, ids)));
  return rows.map((r) => r.a);
}

/** Swaps the service's 'proposed' rows for new ones in one transaction; approved/scheduled rows are never touched. */
export async function replaceProposed(serviceId: string, rows: NewAssignment[]): Promise<Assignment[]> {
  return getDb().transaction(async (tx) => {
    await tx.delete(assignments).where(and(eq(assignments.serviceId, serviceId), eq(assignments.status, 'proposed')));
    return rows.length === 0 ? [] : tx.insert(assignments).values(rows).returning();
  });
}

/** proposed -> approved; returns the rows that actually flipped. */
export async function approveProposed(ids: string[]): Promise<Assignment[]> {
  if (ids.length === 0) return [];
  return getDb().update(assignments).set({ status: 'approved' })
    .where(and(inArray(assignments.id, ids), eq(assignments.status, 'proposed'))).returning();
}
