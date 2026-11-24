import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { lessons } from '../schema';

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;

export async function listLessons(churchId: string): Promise<Lesson[]> {
  return getDb().select().from(lessons).where(eq(lessons.churchId, churchId)).orderBy(lessons.serviceDate);
}

export async function insertLesson(values: NewLesson): Promise<Lesson> {
  const [row] = await getDb().insert(lessons).values(values).returning();
  return row;
}

export async function updateLesson(id: string, patch: Partial<NewLesson>): Promise<void> {
  await getDb().update(lessons).set(patch).where(eq(lessons.id, id));
}

/** Tenant-scoped: the lesson must belong to the church. */
export async function getLessonInChurch(churchId: string, id: string): Promise<Lesson | undefined> {
  const [row] = await getDb().select().from(lessons).where(and(eq(lessons.churchId, churchId), eq(lessons.id, id)));
  return row;
}
