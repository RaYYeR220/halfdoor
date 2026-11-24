// The four systems under test. Node only: halfdoor + baseline_same go through the E2EE enclave path
// (Node variant, direct to Venice); baseline_claude uses Venice's standard endpoint (synthetic stories only).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AttestationSummary } from '../src/lib/crypto/attestation';
import { draftCard } from '../src/lib/card/pipeline';
import { renderCardText } from '../src/lib/card/render';
import { acceptSafetyPrompt } from '../src/lib/card/verify';
import { enclaveChat, type EnclaveChat } from '../src/lib/venice/enclaveClient';
import { PRICES, costUsd, type Usage } from '../src/lib/venice/prices';
import { VENICE_BASE } from '../src/lib/venice/request';
import { childNameFor } from './childName';
import type { EvalStory } from './types';

export type SystemId = 'halfdoor' | 'halfdoor_net' | 'baseline_same' | 'baseline_claude' | 'baseline_same_short' | 'baseline_claude_short';
export const SYSTEM_IDS: readonly SystemId[] = ['halfdoor', 'halfdoor_net', 'baseline_same', 'baseline_claude', 'baseline_same_short', 'baseline_claude_short'];

export const CLAUDE_MODEL = 'claude-sonnet-5-5';
export const PLAIN_SYSTEM = "You are helping a church kids' ministry.";
export const PLAIN_USER = 'Write a one-page summary of this child for the volunteer who will look after them on Sunday.';
/** Short-card baselines: same system prompt, asks for card length so the comparison is not won by "one-page". */
export const SHORT_USER = "Write a short card (under 100 words) about this child for the volunteer who will look after them on Sunday. Keep the parent's language.";
export const MAX_TOKENS = 1500;
export const DEFAULT_CACHE_DIR = join(process.cwd(), 'eval', '.cache');

export type SystemResult = {
  text: string;
  latencyMs: number;
  costUsd: number;
  /** Every model call came from the cache (no spend this run). */
  cached: boolean;
  /** Halfdoor only. */
  safetyItems?: number;
  safetyPrompts?: number;
  error?: string;
};

export type RunCtx = {
  apiKey: string;
  baseUrl?: string;
  cacheDir?: string;
  timeoutMs?: number;
  /** Live spend guard shared across a run: no new live call once `spent >= max`. */
  budget?: { spent: number; max: number };
  fetchImpl?: typeof fetch;
};

export { childNameFor };

// ---------------------------------------------------------------- network

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Venice rate-limits /tee/attestation per (key, model): two attestations for one model a few seconds
// apart get a 429 (no Retry-After), while other models still pass. Every E2EE call attests first, so
// attestation GETs are spaced per model with an adaptive gap (widen on 429, ease back on success).
const GAP_MIN_MS = 4000;
const GAP_MAX_MS = 30_000;
const PENALTY_MS = 45_000;
const gates = new Map<string, { next: number; gap: number; streak: number }>();
const gateFor = (model: string) => {
  let g = gates.get(model);
  if (!g) gates.set(model, (g = { next: 0, gap: GAP_MIN_MS, streak: 0 }));
  return g;
};

/**
 * fetch for one model call: gates attestation GETs per model, retries once on 429/5xx (Retry-After up
 * to 60 s, else the attestation gate's penalty after a 429 and 3-5 s after a 5xx). Aborts/timeouts are
 * never retried. `waitedMs()` is the time spent in those eval-side waits, which is excluded from latency.
 */
export function evalFetch(base: typeof fetch = fetch): { fetch: typeof fetch; waitedMs: () => number } {
  let waited = 0;
  const pause = async (ms: number) => {
    if (ms <= 0) return;
    waited += ms;
    await sleep(ms);
  };
  const attestModel = (url: string) => (url.includes('/tee/attestation') ? (new URL(url, 'http://x').searchParams.get('model') ?? '') : null);
  const gate = async (model: string | null) => {
    if (model === null) return;
    const g = gateFor(model);
    const now = Date.now();
    const at = Math.max(now, g.next);
    g.next = at + g.gap;
    await pause(at - now);
  };
  const settle = (model: string | null, status: number) => {
    if (model === null) return;
    const g = gateFor(model);
    if (status === 429) {
      g.gap = Math.min(GAP_MAX_MS, Math.round(g.gap * 1.5));
      g.next = Math.max(g.next, Date.now() + PENALTY_MS);
      g.streak = 0;
    } else if (status === 200 && ++g.streak >= 10) {
      g.gap = Math.max(GAP_MIN_MS, Math.round(g.gap * 0.9));
      g.streak = 0;
    }
  };
  const f: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const model = attestModel(url);
    await gate(model);
    const r = await base(input, init);
    settle(model, r.status);
    if (r.status !== 429 && r.status < 500) return r;
    await r.body?.cancel().catch(() => undefined);
    const ra = Number(r.headers.get('retry-after'));
    if (Number.isFinite(ra) && ra > 0) await pause(Math.min(ra * 1000, 60_000));
    else if (r.status >= 500) await pause(3000 + Math.random() * 2000);
    else if (model === null) await pause(15_000 + Math.random() * 5000);
    await gate(model);
    const r2 = await base(input, init);
    settle(model, r2.status);
    return r2;
  };
  return { fetch: f, waitedMs: () => waited };
}

export async function getBalanceUsd(apiKey: string, baseUrl = VENICE_BASE): Promise<number | null> {
  try {
    const r = await fetch(`${baseUrl}/api_keys/rate_limits`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { balances?: { USD?: number } } };
    return typeof j.data?.balances?.USD === 'number' ? j.data.balances.USD : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- cache

type CallRecord = {
  model: string;
  text: string;
  usage: Usage | null;
  usageEstimated: boolean;
  /** Wall time of the call minus eval-side rate-limit waits (`waitedMs`). */
  latencyMs: number;
  waitedMs: number;
  costUsd: number;
  attestation?: AttestationSummary;
  at: string;
};

export class BudgetStop extends Error {
  constructor() {
    super('live spend guard reached');
    this.name = 'BudgetStop';
  }
}

export const promptHash = (parts: unknown) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);

const inflight = new Map<string, Promise<CallRecord>>();

/** Rough token count when a stream carries no usage chunk (flagged as estimated). */
const estTokens = (s: string) => Math.ceil(s.length / 3.5);

async function cachedCall(
  ctx: RunCtx,
  key: { system: string; model: string; storyId: string; hash: string },
  promptChars: string,
  live: (f: typeof fetch) => Promise<{ text: string; usage: Usage | null; attestation?: AttestationSummary }>,
): Promise<CallRecord & { cached: boolean }> {
  const path = join(ctx.cacheDir ?? DEFAULT_CACHE_DIR, key.system, key.model, `${key.storyId}.${key.hash}.json`);
  if (existsSync(path)) return { ...(JSON.parse(readFileSync(path, 'utf8')) as CallRecord), cached: true };
  let p = inflight.get(path);
  if (p) return { ...(await p), cached: true };
  p = (async () => {
    if (ctx.budget && ctx.budget.spent >= ctx.budget.max) throw new BudgetStop();
    const ef = evalFetch(ctx.fetchImpl);
    const t0 = performance.now();
    const r = await live(ef.fetch);
    const waitedMs = Math.round(ef.waitedMs());
    const latencyMs = Math.max(0, Math.round(performance.now() - t0) - waitedMs);
    const usage = r.usage ?? { prompt_tokens: estTokens(promptChars), completion_tokens: estTokens(r.text) };
    const rec: CallRecord = {
      model: key.model,
      text: r.text,
      usage: r.usage,
      usageEstimated: !r.usage,
      latencyMs,
      waitedMs,
      costUsd: costUsd(key.model, usage),
      attestation: r.attestation,
      at: new Date().toISOString(),
    };
    if (ctx.budget) ctx.budget.spent += rec.costUsd;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(rec, null, 1));
    return rec;
  })();
  inflight.set(path, p);
  try {
    return { ...(await p), cached: false };
  } finally {
    inflight.delete(path);
  }
}

// ---------------------------------------------------------------- systems

const errMsg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : 'unknown error');

async function runHalfdoor(story: EvalStory, model: string, ctx: RunCtx, net: boolean): Promise<SystemResult> {
  let latencyMs = 0;
  let cost = 0;
  let calls = 0;
  let cachedCalls = 0;
  const chat: EnclaveChat = async (o) => {
    const hash = promptHash({ purpose: o.purpose, system: o.system, user: o.user, maxTokens: o.maxTokens ?? null });
    const rec = await cachedCall(ctx, { system: 'halfdoor', model: o.model, storyId: story.id, hash }, o.system + o.user, async (f) => {
      const r = await enclaveChat({
        ...o,
        node: { apiKey: ctx.apiKey, baseUrl: ctx.baseUrl },
        fetchImpl: f,
        signal: AbortSignal.timeout(ctx.timeoutMs ?? 180_000),
      });
      return { text: r.text, usage: r.usage, attestation: r.attestation };
    });
    latencyMs += rec.latencyMs;
    cost += rec.costUsd;
    calls++;
    if (rec.cached) cachedCalls++;
    if (!rec.attestation) throw new Error('cached enclave call has no attestation');
    return { text: rec.text, usage: rec.usage, attestation: rec.attestation };
  };
  const cached = () => calls > 0 && calls === cachedCalls;
  try {
    const { card } = await draftCard(story.text, childNameFor(story.text), { model, chat });
    const safetyPrompts = card.safetyPrompts.length;
    let c = card;
    if (net) for (const p of card.safetyPrompts) c = acceptSafetyPrompt(c, story.text, p.id);
    return {
      text: renderCardText(c),
      latencyMs,
      costUsd: cost,
      cached: cached(),
      safetyItems: c.items.filter((i) => i.section === 'safety').length,
      safetyPrompts,
    };
  } catch (e) {
    if (e instanceof BudgetStop) throw e;
    return { text: '', latencyMs, costUsd: cost, cached: cached(), safetyItems: 0, safetyPrompts: 0, error: errMsg(e) };
  }
}

const plainUser = (story: EvalStory, short: boolean) => `${short ? SHORT_USER : PLAIN_USER}\n\n${story.text}`;

async function runBaselineSame(story: EvalStory, model: string, ctx: RunCtx, short: boolean): Promise<SystemResult> {
  const user = plainUser(story, short);
  const hash = promptHash({ system: PLAIN_SYSTEM, user, maxTokens: MAX_TOKENS });
  try {
    const rec = await cachedCall(ctx, { system: short ? 'baseline_same_short' : 'baseline_same', model, storyId: story.id, hash }, PLAIN_SYSTEM + user, async (f) => {
      const r = await enclaveChat({
        model,
        purpose: 'card',
        system: PLAIN_SYSTEM,
        user,
        maxTokens: MAX_TOKENS,
        node: { apiKey: ctx.apiKey, baseUrl: ctx.baseUrl },
        fetchImpl: f,
        signal: AbortSignal.timeout(ctx.timeoutMs ?? 180_000),
      });
      return { text: r.text, usage: r.usage, attestation: r.attestation };
    });
    return { text: rec.text, latencyMs: rec.latencyMs, costUsd: rec.costUsd, cached: rec.cached };
  } catch (e) {
    if (e instanceof BudgetStop) throw e;
    return { text: '', latencyMs: 0, costUsd: 0, cached: false, error: errMsg(e) };
  }
}

async function runBaselineClaude(story: EvalStory, ctx: RunCtx, short: boolean): Promise<SystemResult> {
  const user = plainUser(story, short);
  const hash = promptHash({ system: PLAIN_SYSTEM, user, maxTokens: MAX_TOKENS });
  if (!PRICES[CLAUDE_MODEL]) throw new Error(`no price for ${CLAUDE_MODEL}`);
  try {
    const rec = await cachedCall(ctx, { system: short ? 'baseline_claude_short' : 'baseline_claude', model: CLAUDE_MODEL, storyId: story.id, hash }, PLAIN_SYSTEM + user, async (f) => {
      const res = await f(`${ctx.baseUrl ?? VENICE_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          messages: [
            { role: 'system', content: PLAIN_SYSTEM },
            { role: 'user', content: user },
          ],
          max_tokens: MAX_TOKENS,
          venice_parameters: { include_venice_system_prompt: false, disable_thinking: true },
        }),
        signal: AbortSignal.timeout(ctx.timeoutMs ?? 180_000),
      });
      if (!res.ok) throw new Error(`claude_request_failed_${res.status}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: Partial<Usage> };
      const text = j.choices?.[0]?.message?.content ?? '';
      const u = j.usage;
      const usage = u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number' ? { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens } : null;
      return { text, usage };
    });
    return { text: rec.text, latencyMs: rec.latencyMs, costUsd: rec.costUsd, cached: rec.cached };
  } catch (e) {
    if (e instanceof BudgetStop) throw e;
    return { text: '', latencyMs: 0, costUsd: 0, cached: false, error: errMsg(e) };
  }
}

/** `model` is the E2EE model; baseline_claude ignores it and always uses CLAUDE_MODEL. */
export async function runSystem(id: SystemId, story: EvalStory, model: string, ctx?: RunCtx): Promise<SystemResult> {
  const c: RunCtx = ctx ?? { apiKey: process.env.VENICE_API_KEY ?? '' };
  if (!c.apiKey) throw new Error('VENICE_API_KEY missing');
  switch (id) {
    case 'halfdoor':
      return runHalfdoor(story, model, c, false);
    case 'halfdoor_net':
      return runHalfdoor(story, model, c, true);
    case 'baseline_same':
      return runBaselineSame(story, model, c, false);
    case 'baseline_same_short':
      return runBaselineSame(story, model, c, true);
    case 'baseline_claude':
      return runBaselineClaude(story, c, false);
    case 'baseline_claude_short':
      return runBaselineClaude(story, c, true);
  }
}

export const modelFor = (id: SystemId, e2eeModel: string) => (id.startsWith('baseline_claude') ? CLAUDE_MODEL : e2eeModel);
