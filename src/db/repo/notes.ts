import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { parentNotes } from '../schema';

export type ParentNote = typeof parentNotes.$inferSelect;
export type NewParentNote = typeof parentNotes.$inferInsert;

export async function listNotes(serviceId: string): Promise<ParentNote[]> {
  return getDb().select().from(parentNotes).where(eq(parentNotes.serviceId, serviceId));
}

export async function insertNote(values: NewParentNote): Promise<ParentNote> {
  const [row] = await getDb().insert(parentNotes).values(values).returning();
  return row;
}

export async function updateNote(id: string, patch: Partial<NewParentNote>): Promise<void> {
  await getDb().update(parentNotes).set(patch).where(eq(parentNotes.id, id));
}

export async function listNotesForChild(childId: string): Promise<ParentNote[]> {
  return getDb().select().from(parentNotes).where(eq(parentNotes.childId, childId));
}

/** Atomic: one note per (service, child), concurrent saves land on the same row. */
export async function upsertNote(values: NewParentNote): Promise<ParentNote> {
  const { serviceId: _s, childId: _c, ...patch } = values;
  void _s; void _c;
  const [row] = await getDb().insert(parentNotes).values(values)
    .onConflictDoUpdate({ target: [parentNotes.serviceId, parentNotes.childId], set: patch }).returning();
  return row;
}
