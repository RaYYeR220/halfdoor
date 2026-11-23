import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { insertChurch } from '@/db/repo/churches';
import { insertAiCall, listAiCalls } from '@/db/repo/aiCalls';
import { checkBudget, estimateUsd, reserveBudget } from '@/lib/venice/budget';
import { deleteChurch } from '@/db/repo/churches';
import { costUsd, PRICES } from '@/lib/venice/prices';
import { encryptForEnclave, newClientKeys } from '@/lib/crypto/e2ee';

const viewer = vi.hoisted(() => ({ current: null as null | { churchId: string; personId: string; role: string; sandbox: boolean } }));
vi.mock('@/lib/auth/viewer', () => ({ getViewer: async () => viewer.current }));

import { POST } from '@/app/api/tee/chat/route';
import { GET as ATTEST } from '@/app/api/tee/attestation/route';

let db: ReturnType<typeof drizzle>;
beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.VENICE_API_KEY = 'test-key';
  const client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});

const call = (churchId: string, cost = '0.001') =>
  insertAiCall({ churchId, purpose: 'card', model: 'e2ee-deepseek-v4-flash', e2ee: true, ok: true, costUsd: cost });
const slug = (p: string) => `${p}-${randomBytes(4).toString('hex')}`;

describe('prices', () => {
  test('costUsd uses the price table', () => {
    expect(costUsd('e2ee-deepseek-v4-flash', { prompt_tokens: 1e6, completion_tokens: 0 })).toBeCloseTo(0.182, 3);
    expect(costUsd('e2ee-qwen3-6-35b-a3b', { prompt_tokens: 0, completion_tokens: 1e6 })).toBeCloseTo(1.18, 3);
    expect(Object.keys(PRICES)).toContain('claude-sonnet-5-5');
  });
  test('unknown model throws', () => {
    expect(() => costUsd('nope', { prompt_tokens: 1, completion_tokens: 1 })).toThrow();
  });
});

describe('checkBudget', () => {
  beforeEach(async () => {
    await db.delete(schema.aiCalls);
  });
  test('sandbox cap blocks the 16th call', async () => {
    const { churchId } = await createSandbox();
    for (let i = 0; i < 14; i++) await call(churchId, '0.000001');
    expect(await checkBudget(churchId)).toEqual({ ok: true });
    await call(churchId, '0.000001');
    expect(await checkBudget(churchId)).toEqual({ ok: false, reason: 'sandbox_cap' });
  });
  test('non-sandbox churches skip the per-sandbox cap', async () => {
    const c = await insertChurch({ name: 'Live', slug: slug('live'), mode: 'live', wrappedDek: 'x' });
    for (let i = 0; i < 16; i++) await call(c.id, '0.000001');
    expect(await checkBudget(c.id)).toEqual({ ok: true });
  });
  test('daily cap sums across churches and ignores a different UTC day', async () => {
    const a = await insertChurch({ name: 'A', slug: slug('a'), mode: 'live', wrappedDek: 'x' });
    const b = await insertChurch({ name: 'B', slug: slug('b'), mode: 'live', wrappedDek: 'x' });
    expect(await checkBudget(a.id)).toEqual({ ok: true });
    await call(b.id, '3.5');
    expect(await checkBudget(a.id)).toEqual({ ok: false, reason: 'daily_cap' });
    expect(await checkBudget(a.id, new Date(Date.now() + 26 * 3600_000))).toEqual({ ok: true });
  });
});

describe('reservation and ledger durability', () => {
  const R = (churchId: string) => ({ churchId, purpose: 'card' as const, model: 'e2ee-deepseek-v4-flash', estimateUsd: 0.001, attestation: null });
  beforeEach(async () => {
    await db.delete(schema.aiCalls);
  });
  test('parallel reservations cannot overshoot the sandbox cap', async () => {
    const { churchId } = await createSandbox();
    for (let i = 0; i < 12; i++) await call(churchId, '0.000001');
    const results = await Promise.all(Array.from({ length: 8 }, () => reserveBudget(R(churchId))));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === 'sandbox_cap')).toHaveLength(5);
    expect(await listAiCalls(churchId)).toHaveLength(15);
  });
  test('pending estimates count toward the daily cap', async () => {
    const c = await insertChurch({ name: 'D', slug: slug('d'), mode: 'live', wrappedDek: 'x' });
    expect((await reserveBudget({ ...R(c.id), estimateUsd: 2.9 })).ok).toBe(true);
    expect(await reserveBudget({ ...R(c.id), estimateUsd: 0.2 })).toEqual({ ok: false, reason: 'daily_cap' });
  });
  test('estimate is worst case (max_tokens out + ciphertext/6 in)', () => {
    expect(estimateUsd('e2ee-deepseek-v4-flash', 6_000, 1500)).toBeCloseTo((1000 * 0.182 + 1500 * 0.373) / 1e6, 8);
  });
  test('purging a church keeps its spend in the daily cap', async () => {
    const c = await insertChurch({ name: 'P', slug: slug('p'), mode: 'sandbox', wrappedDek: 'x' });
    await call(c.id, '3.5');
    await deleteChurch(c.id);
    const rows = await db.select().from(schema.aiCalls);
    expect(rows).toHaveLength(1);
    expect(rows[0].churchId).toBeNull();
    const other = await insertChurch({ name: 'O', slug: slug('o'), mode: 'live', wrappedDek: 'x' });
    expect(await checkBudget(other.id)).toEqual({ ok: false, reason: 'daily_cap' });
  });
});

describe('POST /api/tee/chat', () => {
  const model = newClientKeys();
  const client = newClientKeys();
  const enc = (s: string) => encryptForEnclave(s, model.publicKeyHex);
  const body = (over: Record<string, unknown> = {}) =>
    new Request('http://x/api/tee/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: 'e2ee-deepseek-v4-flash',
        purpose: 'card',
        messages: [{ role: 'system', content: enc('sys') }, { role: 'user', content: enc('user') }],
        clientPubKey: client.publicKeyHex,
        modelPubKey: model.publicKeyHex,
        ...over,
      }),
    });
  let churchId: string;
  beforeEach(async () => {
    await db.delete(schema.aiCalls);
    churchId = (await createSandbox()).churchId;
    viewer.current = { churchId, personId: 'p', role: 'parent', sandbox: true };
    vi.unstubAllGlobals();
  });

  const sse = (chunks: string[], fail = false) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x)));
          if (fail) c.error(new Error('boom'));
          else c.close();
        },
      }),
      { status: 200 },
    );
  const USAGE = 'data: {"choices":[],"usage":{"prompt_tokens":1000000,"completion_tokens":0}}\n\ndata: [DONE]\n\n';

  test('401 without a viewer', async () => {
    viewer.current = null;
    expect((await POST(body())).status).toBe(401);
  });
  test('proxy rejects plaintext content', async () => {
    const r = await POST(body({ messages: [{ role: 'user', content: 'hello' }] }));
    expect(r.status).toBe(400);
  });
  test('non-e2ee model rejected', async () => {
    expect((await POST(body({ model: 'claude-sonnet-5-5' }))).status).toBe(400);
    expect((await POST(body({ model: 'e2ee-unknown' }))).status).toBe(400);
  });
  test('relays the stream unchanged, clamps max_tokens, records one ledger row with usage', async () => {
    const f = vi.fn().mockResolvedValue(sse(['data: {"choices":[{"delta":{"content":"aa"}}]}\n\n', USAGE]));
    vi.stubGlobal('fetch', f);
    const att = {
      verified: true, nonceOk: true, provider: 'p', hardware: null, model: 'e2ee-deepseek-v4-flash',
      signingAddress: null, modelPublicKey: model.publicKeyHex, checkedAt: 'now',
    };
    const r = await POST(body({ maxTokens: 99999, attestation: att }));
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain('"content":"aa"');
    expect(text.endsWith('[DONE]\n\n')).toBe(true);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.venice.ai/api/v1/chat/completions');
    const sent = JSON.parse(init.body as string);
    expect(sent.max_tokens).toBe(1500);
    expect(sent.stream).toBe(true);
    expect(sent.venice_parameters).toEqual({ include_venice_system_prompt: false, disable_thinking: true });
    expect(Object.keys(sent).sort()).toEqual(['max_tokens', 'messages', 'model', 'stream', 'venice_parameters']);
    const h = init.headers as Record<string, string>;
    expect(h['X-Venice-TEE-Signing-Algo']).toBe('ecdsa');
    expect(h['X-Venice-TEE-Client-Pub-Key']).toBe(client.publicKeyHex);

    const rows = await listAiCalls(churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ok: true, e2ee: true, purpose: 'card', tokensIn: 1000000, tokensOut: 0 });
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.182, 3);
    expect(rows[0].attestation).toMatchObject({ verified: true });
  });
  test.each([401, 402, 403, 429, 503])('upstream %i maps to our 502, ok=false, not billed', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret detail', { status })));
    const r = await POST(body());
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'upstream' });
    const rows = await listAiCalls(churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
    expect(Number(rows[0].costUsd)).toBe(0);
  });
  test('cancelled stream keeps the worst-case estimate (ok=false)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(['data: {"choices":[]}\n\n'])));
    const r = await POST(body());
    await r.body!.cancel();
    const rows = await listAiCalls(churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
    expect(Number(rows[0].costUsd)).toBeGreaterThan(0);
  });
  test('fetch rejecting (abort/timeout) keeps the estimate, ok=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    const r = await POST(body());
    expect(r.status).toBe(502);
    const rows = await listAiCalls(churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
    expect(Number(rows[0].costUsd)).toBeGreaterThan(0);
  });
  test('allowlist: only the default model, size cap, pubkey shape', async () => {
    expect((await POST(body({ model: 'e2ee-kimi-k3-1-pro-p' }))).status).toBe(400);
    expect((await POST(body({ messages: [{ role: 'user', content: 'a'.repeat(100_001) }] }))).status).toBe(400);
    expect((await POST(body({ clientPubKey: 'f'.repeat(130) }))).status).toBe(400);
    expect((await POST(body({ clientPubKey: '05' + 'a'.repeat(128) }))).status).toBe(400);
  });
  test('attestation that does not match the request is not stored and flagged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([USAGE])));
    const att = {
      verified: true, nonceOk: true, provider: 'p', hardware: null, model: 'e2ee-deepseek-v4-flash',
      signingAddress: null, modelPublicKey: newClientKeys().publicKeyHex, checkedAt: 'now',
    };
    await (await POST(body({ attestation: att }))).text();
    const rows = await listAiCalls(churchId);
    expect(rows[0].attestation).toBeNull();
    expect(rows[0].attestationMismatch).toBe(true);
  });
  test('stored attestation is accepted with or without the 04 prefix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([USAGE])));
    const att = {
      verified: true, nonceOk: true, provider: 'p', hardware: null, model: 'e2ee-deepseek-v4-flash',
      signingAddress: null, modelPublicKey: model.publicKeyHex.slice(2), checkedAt: 'now',
    };
    await (await POST(body({ attestation: att }))).text();
    const rows = await listAiCalls(churchId);
    expect(rows[0].attestation).toMatchObject({ verified: true });
    expect(rows[0].attestationMismatch).toBe(false);
  });
  test('stream error records exactly one ok=false row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(['data: {"choices":[]}\n\n'], true)));
    const r = await POST(body());
    await r.text().catch(() => undefined);
    const rows = await listAiCalls(churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
    expect(Number(rows[0].costUsd)).toBeGreaterThan(0);
  });
  test('429 with reason when over the sandbox cap', async () => {
    for (let i = 0; i < 15; i++) await call(churchId, '0.000001');
    const r = await POST(body());
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ reason: 'sandbox_cap' });
  });
});

describe('GET /api/tee/attestation', () => {
  const nonce = 'a'.repeat(64);
  const req = (q: string) => new Request(`http://x/api/tee/attestation?${q}`);
  test('401 / 400 / passthrough', async () => {
    vi.unstubAllGlobals();
    viewer.current = null;
    expect((await ATTEST(req(`model=e2ee-deepseek-v4-flash&nonce=${nonce}`))).status).toBe(401);
    viewer.current = { churchId: 'c', personId: 'p', role: 'parent', sandbox: true };
    expect((await ATTEST(req(`model=claude-sonnet-5-5&nonce=${nonce}`))).status).toBe(400);
    expect((await ATTEST(req('model=e2ee-deepseek-v4-flash&nonce=zz'))).status).toBe(400);
    const f = vi.fn().mockResolvedValue(Response.json({ verified: true }));
    vi.stubGlobal('fetch', f);
    const r = await ATTEST(req(`model=e2ee-deepseek-v4-flash&nonce=${nonce}`));
    expect(await r.json()).toEqual({ verified: true });
    expect(f.mock.calls[0][0]).toContain(`nonce=${nonce}`);
  });
});
