import { beforeEach, describe, expect, test, vi } from 'vitest';

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
import { addressFromPublicKey, type QuoteSignatureResult } from '@/lib/crypto/tdxQuote';
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { EnclaveError, clearAttestationCache, enclaveChat, readEnclaveStream, type EnclaveChatOpts } from '@/lib/venice/enclaveClient';
import { buildUpstreamBody, normalizePubKey, upstreamHeaders } from '@/lib/venice/request';
import { FIXTURES, withReportData } from '../fixtures/attestation';

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
const REAL = FIXTURES['near-ai'].attestation;
/** A real quote with REPORTDATA rewritten to bind the test enclave key and this request's nonce (binding passes; Intel's signature would not). */
const boundAttestation = (nonce: string) => ({
  ...REAL,
  verified: true,
  nonce,
  model: MODEL,
  signing_key: enclave.publicKeyHex,
  signing_public_key: enclave.publicKeyHex,
  intel_quote: withReportData(REAL.intel_quote, addressFromPublicKey(enclave.publicKeyHex), nonce),
});
function fakeFetch(chat: Handler, att: Partial<Record<string, unknown>> | (() => Partial<Record<string, unknown>>) = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/tee/attestation')) {
      const nonce = new URL(url, 'http://x').searchParams.get('nonce')!;
      return Response.json({ ...boundAttestation(nonce), ...(typeof att === 'function' ? att() : att) });
    }
    return chat(url, init);
  });
  return { f: f as unknown as typeof fetch, calls };
}
const attCalls = (calls: { url: string }[]) => calls.filter((c) => c.url.includes('/tee/attestation')).length;
const VERIFIED: QuoteSignatureResult = { status: 'verified', tcbStatus: 'UpToDate', advisoryIds: [], checkedIn: 'node' };
/** Never touch the network for Intel collateral in unit tests. */
const verifyQuote = vi.fn(async () => VERIFIED);
const opts = (o: Partial<EnclaveChatOpts>): EnclaveChatOpts => ({ model: MODEL, purpose: 'card', system: 's', user: STORY, verifyQuote, ...o });
beforeEach(() => clearAttestationCache());
const replyTo = (text: string, pub: string) =>
  sse([delta(encryptForEnclave(text, pub)), 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}', 'data: [DONE]']);
const node = { apiKey: 'k', baseUrl: 'http://venice.test' };
const zeroed = () => Array.from(captured.keys!.privateKey).every((b) => b === 0);

describe('enclaveChat', () => {
  test('node path: ciphertext only on the wire, decrypts the answer, zero-fills the private key', async () => {
    const { f, calls } = fakeFetch((_u, init) => replyTo('hello back', (init!.headers as Record<string, string>)['X-Venice-TEE-Client-Pub-Key']));
    const onAtt = vi.fn();
    const r = await enclaveChat(opts({ system: 'SYSTEMPROMPT', node, fetchImpl: f, onAttestation: onAtt }));
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
    const r = await enclaveChat(opts({ purpose: 'translate', fetchImpl: f }));
    expect(r.text).toBe('ok');
    const post = calls.find((c) => c.url === '/api/tee/chat')!;
    expect(post.init!.body as string).not.toContain('peanuts');
    const b = JSON.parse(post.init!.body as string);
    expect(b.attestation.verified).toBe(true);
    expect(normalizePubKey(b.modelPubKey)).toBe(normalizePubKey(enclave.publicKeyHex));
  });
  test('failed attestation never posts to chat', async () => {
    const { f, calls } = fakeFetch(() => sse([]), { verified: false });
    await expect(enclaveChat(opts({ node, fetchImpl: f }))).rejects.toThrow(/attestation/);
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
    const { f: f2, calls: c2 } = fakeFetch(() => sse([]), { nonce: 'wrong' });
    await expect(enclaveChat(opts({ node, fetchImpl: f2 }))).rejects.toThrow();
    expect(c2.some((c) => c.url.includes('chat'))).toBe(false);
  });
  test('plaintext delta in an e2ee stream is rejected and the key still zeroed', async () => {
    const { f } = fakeFetch(() => sse([delta('here is some plaintext answer')]));
    const err = await enclaveChat(opts({ node, fetchImpl: f })).catch((e) => e);
    expect(err).toBeInstanceOf(EnclaveError);
    expect(err.code).toBe('plaintext_in_e2ee_stream');
    expect(zeroed()).toBe(true);
  });
  test('our 429 becomes a typed BudgetError', async () => {
    const { f } = fakeFetch(() => Response.json({ reason: 'daily_cap' }, { status: 429 }));
    await expect(enclaveChat(opts({ fetchImpl: f }))).rejects.toMatchObject({
      name: 'BudgetError',
      reason: 'daily_cap',
    });
  });
});

describe('enclaveChat quote checks', () => {
  const okChat = () => fakeFetch((_u, init) => replyTo('ok', JSON.parse(init!.body as string).clientPubKey));
  const okNodeChat = (att?: Partial<Record<string, unknown>>) =>
    fakeFetch((_u, init) => replyTo('ok', (init!.headers as Record<string, string>)['X-Venice-TEE-Client-Pub-Key']), att);

  test('a key not bound in the quote never reaches chat (Venice said verified: true)', async () => {
    const { f, calls } = okNodeChat({ intel_quote: REAL.intel_quote }); // real quote binds a different key and nonce
    const err = await enclaveChat(opts({ node, fetchImpl: f })).catch((e) => e);
    expect(err).toMatchObject({ name: 'AttestationError', code: 'quote_binding_failed' });
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
  });

  test('encryption does not wait for the signature check; onQuoteVerified fires when it completes', async () => {
    let finish!: (r: QuoteSignatureResult) => void;
    const slow = vi.fn<(q: Uint8Array) => Promise<QuoteSignatureResult>>(() => new Promise((r) => (finish = r)));
    const onAtt = vi.fn();
    const onQv = vi.fn();
    const { f, calls } = okNodeChat();
    const r = await enclaveChat(opts({ node, fetchImpl: f, verifyQuote: slow, onAttestation: onAtt, onQuoteVerified: onQv }));
    expect(r.text).toBe('ok');
    expect(calls.some((c) => c.url.endsWith('/chat/completions'))).toBe(true);
    expect(r.attestation.quote.signature).toBe('pending');
    expect((onAtt.mock.calls[0][0] as AttestationSummary).binding).toMatchObject({ addressMatches: true, nonceMatches: true });
    expect(onQv).not.toHaveBeenCalled();
    finish({ status: 'verified', tcbStatus: 'UpToDate', advisoryIds: [], checkedIn: 'node' });
    const done = (await r.quoteVerified)!;
    expect(done.quote).toMatchObject({ signature: 'verified', signatureCheckedIn: 'node', tcbStatus: 'UpToDate' });
    expect(onQv).toHaveBeenCalledWith(done);
    // Intel's chain is checked on the very quote the binding was read from
    const nonce = new URL(calls.find((c) => c.url.includes('/tee/attestation'))!.url).searchParams.get('nonce')!;
    expect(Buffer.from(slow.mock.calls[0][0] as Uint8Array).toString('hex')).toBe(boundAttestation(nonce).intel_quote);
  });

  test('a throwing verifier is reported as unverified, the call still succeeds', async () => {
    const { f } = okNodeChat();
    const boom = vi.fn(async (): Promise<QuoteSignatureResult> => {
      throw new Error('verifier exploded');
    });
    const r = await enclaveChat(opts({ node, fetchImpl: f, verifyQuote: boom }));
    expect(r.text).toBe('ok');
    expect((await r.quoteVerified)!.quote).toMatchObject({ signature: 'unverified', reasonCode: 'verifier_unavailable', reason: 'verifier exploded' });
  });

  test('browser path reuses a checked attestation per model for 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { f, calls } = okChat();
      const onAtt = vi.fn();
      await enclaveChat(opts({ fetchImpl: f, onAttestation: onAtt }));
      await enclaveChat(opts({ fetchImpl: f, onAttestation: onAtt }));
      expect(attCalls(calls)).toBe(1);
      expect(onAtt).toHaveBeenCalledTimes(2);
      const posts = calls.filter((c) => c.url === '/api/tee/chat').map((c) => JSON.parse(c.init!.body as string));
      expect(posts[1].modelPubKey).toBe(posts[0].modelPubKey);
      expect(posts[1].attestation.checkedAt).toBe(posts[0].attestation.checkedAt);
      expect(posts[1].clientPubKey).not.toBe(posts[0].clientPubKey); // fresh client keys every call
      vi.setSystemTime(Date.now() + 10 * 60_000 + 1000);
      await enclaveChat(opts({ fetchImpl: f }));
      expect(attCalls(calls)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('concurrent browser calls share one attestation fetch; the signature check runs once', async () => {
    const { f, calls } = okChat();
    verifyQuote.mockClear();
    const onQv = vi.fn();
    const rs = await Promise.all([1, 2, 3].map(() => enclaveChat(opts({ fetchImpl: f, onQuoteVerified: onQv }))));
    expect(rs.map((r) => r.text)).toEqual(['ok', 'ok', 'ok']);
    expect(attCalls(calls)).toBe(1);
    expect(verifyQuote).toHaveBeenCalledTimes(1);
    await Promise.all(rs.map((r) => r.quoteVerified));
    expect(onQv).toHaveBeenCalledTimes(3);
  });

  test('a failed attestation is not cached', async () => {
    let first = true;
    const { f, calls } = fakeFetch(
      (_u, init) => replyTo('ok', JSON.parse(init!.body as string).clientPubKey),
      () => (first ? ((first = false), { verified: false }) : {}),
    );
    await expect(enclaveChat(opts({ fetchImpl: f }))).rejects.toThrow(/not_verified/);
    expect((await enclaveChat(opts({ fetchImpl: f }))).text).toBe('ok');
    expect(attCalls(calls)).toBe(2);
  });

  test('an upstream chat failure drops the cached attestation', async () => {
    let fail = true;
    const { f, calls } = fakeFetch((_u, init) =>
      fail ? ((fail = false), new Response('no', { status: 502 })) : replyTo('ok', JSON.parse(init!.body as string).clientPubKey),
    );
    await expect(enclaveChat(opts({ fetchImpl: f }))).rejects.toThrow(/request_failed_502/);
    expect((await enclaveChat(opts({ fetchImpl: f }))).text).toBe('ok');
    expect(attCalls(calls)).toBe(2);
  });

  test('node path fetches a fresh attestation for every call', async () => {
    const { f, calls } = okNodeChat();
    await enclaveChat(opts({ node, fetchImpl: f }));
    await enclaveChat(opts({ node, fetchImpl: f }));
    expect(attCalls(calls)).toBe(2);
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
