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
import { checkBudget } from '@/lib/venice/budget';
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
  test('upstream non-200 relays the status and records ok=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret detail', { status: 503 })));
    const r = await POST(body());
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'upstream error' });
    const rows = await listAiCalls(churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
  });
  test('stream error records exactly one ok=false row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(['data: {"choices":[]}\n\n'], true)));
    const r = await POST(body());
    await r.text().catch(() => undefined);
    const rows = await listAiCalls(churchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
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
