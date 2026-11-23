import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import { householdLinks, people } from '../schema';

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;

export async function getPerson(id: string): Promise<Person | undefined> {
  const [row] = await getDb().select().from(people).where(eq(people.id, id));
  return row;
}

/** Tenant-scoped lookup: the person must belong to the church. */
export async function getPersonInChurch(churchId: string, id: string): Promise<Person | undefined> {
  const [row] = await getDb().select().from(people).where(and(eq(people.churchId, churchId), eq(people.id, id)));
  return row;
}

export async function listPeople(churchId: string): Promise<Person[]> {
  return getDb().select().from(people).where(eq(people.churchId, churchId));
}

export async function insertPeople(rows: NewPerson[]): Promise<Person[]> {
  return getDb().insert(people).values(rows).returning();
}

export async function updatePerson(id: string, patch: Partial<NewPerson>): Promise<void> {
  await getDb().update(people).set(patch).where(eq(people.id, id));
}

export async function insertHouseholdLinks(rows: { parentId: string; childId: string }[]): Promise<void> {
  await getDb().insert(householdLinks).values(rows);
}

export async function listHouseholdLinks(childIds: string[]): Promise<{ parentId: string; childId: string }[]> {
  if (childIds.length === 0) return [];
  return getDb().select().from(householdLinks).where(inArray(householdLinks.childId, childIds));
}
