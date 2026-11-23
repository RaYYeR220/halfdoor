// SERVER-ONLY. Code-enforced AI caps and the ai_calls ledger.
// Spend is RESERVED before the upstream call (under a lock, with a worst-case estimate), then
// finalised with real usage; a cancelled or failed stream keeps the estimate.
import { sql } from 'drizzle-orm';
import { aiCalls } from '@/db/schema';
import { countAiCalls, sumCostSince, updateAiCall, type Executor } from '@/db/repo/aiCalls';
import { getChurchIn } from '@/db/repo/churches';
import { getDb } from '@/db/client';
import { CAPS, costUsd, type Usage } from './prices';

export type BudgetReason = 'sandbox_cap' | 'daily_cap';
export type BudgetResult = { ok: true } | { ok: false; reason: BudgetReason };

const LOCK_KEY = 7340117; // constant advisory-lock key serialising reservations

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function check(ex: Executor, churchId: string, now: Date, extraUsd = 0): Promise<BudgetResult> {
  const church = await getChurchIn(ex, churchId);
  if (church?.mode === 'sandbox' && (await countAiCalls(churchId, ex)) >= CAPS.perSandboxCalls) {
    return { ok: false, reason: 'sandbox_cap' };
  }
  if ((await sumCostSince(startOfUtcDay(now), ex)) + extraUsd >= CAPS.dailyUsd) return { ok: false, reason: 'daily_cap' };
  return { ok: true };
}

/** Read-only check (no reservation). */
export async function checkBudget(churchId: string, now: Date = new Date()): Promise<BudgetResult> {
  return check(getDb(), churchId, now);
}

/** Worst-case cost: ciphertext hex length / 2 / 3 as the prompt-token estimate, plus the full max_tokens out. */
export function estimateUsd(model: string, ciphertextHexChars: number, maxTokens: number): number {
  return costUsd(model, { prompt_tokens: Math.ceil(ciphertextHexChars / 2 / 3), completion_tokens: Math.min(maxTokens, CAPS.maxTokens) });
}

export type Reservation = {
  churchId: string;
  purpose: 'card' | 'translate' | 'note';
  model: string;
  estimateUsd: number;
  attestation: unknown;
  attestationMismatch?: boolean;
};

/** Atomically re-check the caps (pending rows included) and insert a pending ledger row. */
export async function reserveBudget(r: Reservation, now: Date = new Date()): Promise<{ ok: true; id: string } | { ok: false; reason: BudgetReason }> {
  return getDb().transaction(async (tx) => {
    const ex = tx as unknown as Executor;
    await ex.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);
    const res = await check(ex, r.churchId, now, r.estimateUsd);
    if (!res.ok) return res;
    const [row] = await ex
      .insert(aiCalls)
      .values({
        churchId: r.churchId,
        purpose: r.purpose,
        model: r.model,
        e2ee: true,
        attestation: r.attestation ?? null,
        attestationMismatch: r.attestationMismatch ?? false,
        costUsd: r.estimateUsd.toFixed(6),
        ok: null,
      })
      .returning({ id: aiCalls.id });
    return { ok: true as const, id: row.id };
  });
}

/** Real usage replaces the estimate; without usage the estimate stays. `free` = upstream refused (not billed). */
export async function finalizeAiCall(id: string, o: { ok: boolean; model: string; usage?: Usage | null; free?: boolean }): Promise<void> {
  await updateAiCall(id, {
    ok: o.ok,
    ...(o.usage
      ? { tokensIn: o.usage.prompt_tokens, tokensOut: o.usage.completion_tokens, costUsd: costUsd(o.model, o.usage).toFixed(6) }
      : o.free
        ? { costUsd: '0' }
        : {}),
  });
}
