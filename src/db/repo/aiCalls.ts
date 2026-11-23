import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '../client';
import { aiCalls } from '../schema';

export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;

export async function listAiCalls(churchId: string, since?: Date): Promise<AiCall[]> {
  const where = since ? and(eq(aiCalls.churchId, churchId), gte(aiCalls.at, since)) : eq(aiCalls.churchId, churchId);
  return getDb().select().from(aiCalls).where(where);
}

export async function insertAiCall(values: NewAiCall): Promise<AiCall> {
  const [row] = await getDb().insert(aiCalls).values(values).returning();
  return row;
}
