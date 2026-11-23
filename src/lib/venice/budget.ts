// SERVER-ONLY. Code-enforced AI caps and the ai_calls ledger.
import { countAiCalls, insertAiCall, sumCostSince, type NewAiCall } from '@/db/repo/aiCalls';
import { getChurch } from '@/db/repo/churches';
import { CAPS, costUsd, type Usage } from './prices';

export type BudgetResult = { ok: true } | { ok: false; reason: 'sandbox_cap' | 'daily_cap' };

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function checkBudget(churchId: string, now: Date = new Date()): Promise<BudgetResult> {
  const church = await getChurch(churchId);
  if (church?.mode === 'sandbox' && (await countAiCalls(churchId)) >= CAPS.perSandboxCalls) {
    return { ok: false, reason: 'sandbox_cap' };
  }
  if ((await sumCostSince(startOfUtcDay(now))) >= CAPS.dailyUsd) return { ok: false, reason: 'daily_cap' };
  return { ok: true };
}

export async function recordAiCall(row: Omit<NewAiCall, 'id' | 'at' | 'costUsd'> & { usage?: Usage | null; model: string }): Promise<void> {
  const { usage, ...rest } = row;
  await insertAiCall({
    ...rest,
    tokensIn: usage?.prompt_tokens ?? rest.tokensIn ?? null,
    tokensOut: usage?.completion_tokens ?? rest.tokensOut ?? null,
    costUsd: usage ? costUsd(row.model, usage).toFixed(6) : null,
  });
}
