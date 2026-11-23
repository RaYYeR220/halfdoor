import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { blockouts } from '../schema';

export type Blockout = typeof blockouts.$inferSelect;
export type NewBlockout = typeof blockouts.$inferInsert;

export async function listBlockouts(churchId: string): Promise<Blockout[]> {
  return getDb().select().from(blockouts).where(eq(blockouts.churchId, churchId));
}

export async function insertBlockouts(rows: NewBlockout[]): Promise<void> {
  if (rows.length > 0) await getDb().insert(blockouts).values(rows);
}
