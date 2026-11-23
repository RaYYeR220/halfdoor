import { and, eq, gte, sql } from 'drizzle-orm';
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

/** Sum of cost_usd over every church since `since` (the global daily cap). */
export async function sumCostSince(since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${aiCalls.costUsd}), 0)` })
    .from(aiCalls)
    .where(gte(aiCalls.at, since));
  return Number(row?.total ?? 0);
}

export async function countAiCalls(churchId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(aiCalls)
    .where(eq(aiCalls.churchId, churchId));
  return row?.n ?? 0;
}
