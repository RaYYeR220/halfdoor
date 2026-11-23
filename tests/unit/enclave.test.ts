import { describe, expect, test, vi } from 'vitest';

const captured = vi.hoisted(() => ({ keys: null as null | { privateKey: Uint8Array; publicKeyHex: string } }));
vi.mock('@/lib/crypto/e2ee', async (orig) => {
  const m = await orig<typeof import('@/lib/crypto/e2ee')>();
  return {
    ...m,
    newClientKeys: () => {
      captured.keys = m.newClientKeys();
      return captured.keys;
    },
  };
});

import { encryptForEnclave, newClientKeys } from '@/lib/crypto/e2ee';
import { EnclaveError, enclaveChat, readEnclaveStream } from '@/lib/venice/enclaveClient';
import { buildUpstreamBody, normalizePubKey, upstreamHeaders } from '@/lib/venice/request';

const MODEL = 'e2ee-deepseek-v4-flash';
const enclave = newClientKeys();
const STORY = 'Leo is allergic to peanuts and hums when overwhelmed.';

const sse = (lines: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(lines.join('\n\n') + '\n\n'));
        c.close();
      },
    }),
  );
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function fakeFetch(chat: Handler, att: Partial<Record<string, unknown>> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/tee/attestation')) {
      const nonce = new URL(url, 'http://x').searchParams.get('nonce');
      return Response.json({ verified: true, nonce, model: MODEL, signing_key: enclave.publicKeyHex, tee_provider: 't', ...att });
    }
    return chat(url, init);
  });
  return { f: f as unknown as typeof fetch, calls };
}
const replyTo = (text: string, pub: string) =>
  sse([delta(encryptForEnclave(text, pub)), 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}', 'data: [DONE]']);
const node = { apiKey: 'k', baseUrl: 'http://venice.test' };
const zeroed = () => Array.from(captured.keys!.privateKey).every((b) => b === 0);

describe('enclaveChat', () => {
  test('node path: ciphertext only on the wire, decrypts the answer, zero-fills the private key', async () => {
    const { f, calls } = fakeFetch((_u, init) => replyTo('hello back', (init!.headers as Record<string, string>)['X-Venice-TEE-Client-Pub-Key']));
    const onAtt = vi.fn();
    const r = await enclaveChat({ model: MODEL, purpose: 'card', system: 'SYSTEMPROMPT', user: STORY, node, fetchImpl: f, onAttestation: onAtt });
    expect(r.text).toBe('hello back');
    expect(r.usage).toEqual({ prompt_tokens: 5, completion_tokens: 2 });
    expect(onAtt).toHaveBeenCalledOnce();
    const post = calls.find((c) => c.url.endsWith('/chat/completions'))!;
    const raw = post.init!.body as string;
    expect(raw).not.toContain('peanuts');
    expect(raw).not.toContain('SYSTEMPROMPT');
    const body = JSON.parse(raw);
    expect(body).toEqual(buildUpstreamBody(MODEL, body.messages));
    expect(post.init!.headers).toEqual(upstreamHeaders('k', captured.keys!.publicKeyHex, enclave.publicKeyHex));
    expect(zeroed()).toBe(true);
  });
  test('browser path posts ciphertext to our route with the attestation summary', async () => {
    const { f, calls } = fakeFetch((_u, init) => replyTo('ok', JSON.parse(init!.body as string).clientPubKey));
    const r = await enclaveChat({ model: MODEL, purpose: 'translate', system: 's', user: STORY, fetchImpl: f });
    expect(r.text).toBe('ok');
    const post = calls.find((c) => c.url === '/api/tee/chat')!;
    expect(post.init!.body as string).not.toContain('peanuts');
    const b = JSON.parse(post.init!.body as string);
    expect(b.attestation.verified).toBe(true);
    expect(normalizePubKey(b.modelPubKey)).toBe(normalizePubKey(enclave.publicKeyHex));
  });
  test('failed attestation never posts to chat', async () => {
    const { f, calls } = fakeFetch(() => sse([]), { verified: false });
    await expect(enclaveChat({ model: MODEL, purpose: 'card', system: 's', user: STORY, node, fetchImpl: f })).rejects.toThrow(/attestation/);
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
    const { f: f2, calls: c2 } = fakeFetch(() => sse([]), { nonce: 'wrong' });
    await expect(enclaveChat({ model: MODEL, purpose: 'card', system: 's', user: STORY, node, fetchImpl: f2 })).rejects.toThrow();
    expect(c2.some((c) => c.url.includes('chat'))).toBe(false);
  });
  test('plaintext delta in an e2ee stream is rejected and the key still zeroed', async () => {
    const { f } = fakeFetch(() => sse([delta('here is some plaintext answer')]));
    const err = await enclaveChat({ model: MODEL, purpose: 'card', system: 's', user: STORY, node, fetchImpl: f }).catch((e) => e);
    expect(err).toBeInstanceOf(EnclaveError);
    expect(err.code).toBe('plaintext_in_e2ee_stream');
    expect(zeroed()).toBe(true);
  });
  test('our 429 becomes a typed BudgetError', async () => {
    const { f } = fakeFetch(() => Response.json({ reason: 'daily_cap' }, { status: 429 }));
    await expect(enclaveChat({ model: MODEL, purpose: 'card', system: 's', user: STORY, fetchImpl: f })).rejects.toMatchObject({
      name: 'BudgetError',
      reason: 'daily_cap',
    });
  });
});

describe('readEnclaveStream', () => {
  test('cancels the reader when decryption throws', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(delta('f'.repeat(200)) + '\n\n'));
      },
      cancel,
    });
    await expect(readEnclaveStream(stream, newClientKeys().privateKey)).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  test('joins multiple encrypted chunks', async () => {
    const k = newClientKeys();
    const res = sse([delta(encryptForEnclave('ab', k.publicKeyHex)), delta(encryptForEnclave('cd', k.publicKeyHex))]);
    expect((await readEnclaveStream(res.body!, k.privateKey)).text).toBe('abcd');
  });
});
