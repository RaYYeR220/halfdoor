import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

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
import {
  EnclaveError, __setQuoteVerifierForTests, clearAttestationCache, enclaveChat, readEnclaveStream, type EnclaveChatOpts,
} from '@/lib/venice/enclaveClient';
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
/** A real quote with REPORTDATA rewritten to bind the test enclave key and this request's nonce (binding passes; Intel's signature would not, so tests inject a verifier). */
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
      if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const nonce = new URL(url, 'http://x').searchParams.get('nonce')!;
      return Response.json({ ...boundAttestation(nonce), ...(typeof att === 'function' ? att() : att) });
    }
    return chat(url, init);
  });
  return { f: f as unknown as typeof fetch, calls };
}
const attCalls = (calls: { url: string }[]) => calls.filter((c) => c.url.includes('/tee/attestation')).length;
const VERIFIED: QuoteSignatureResult = { status: 'verified', tcbStatus: 'UpToDate', advisoryIds: [], checkedIn: 'node', source: 'live' };
/** Never touch the network for Intel collateral in unit tests. */
const verifyQuote = vi.fn(async () => VERIFIED);
type Verifier = (q: Uint8Array) => Promise<QuoteSignatureResult>;
/** The verifier is a module-level test seam (not a public option); each call installs the one the test wants. */
const opts = ({ verifyQuote: v, ...o }: Partial<EnclaveChatOpts> & { verifyQuote?: Verifier }): EnclaveChatOpts => {
  __setQuoteVerifierForTests(v ?? verifyQuote);
  return { model: MODEL, purpose: 'card', system: 's', user: STORY, ...o };
};
beforeEach(() => clearAttestationCache());
afterAll(() => __setQuoteVerifierForTests(null));
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

  test('nothing is encrypted or sent until Intel\'s signature on the quote verifies', async () => {
    let finish!: (r: QuoteSignatureResult) => void;
    const slow = vi.fn<(q: Uint8Array) => Promise<QuoteSignatureResult>>(() => new Promise((r) => (finish = r)));
    const onAtt = vi.fn();
    const { f, calls } = okNodeChat();
    const p = enclaveChat(opts({ node, fetchImpl: f, verifyQuote: slow, onAttestation: onAtt }));
    await vi.waitFor(() => expect(slow).toHaveBeenCalledOnce());
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
    expect(onAtt).not.toHaveBeenCalled();
    finish({ ...VERIFIED, tcbStatus: 'OutOfDate' });
    const r = await p;
    expect(r.text).toBe('ok');
    expect(calls.some((c) => c.url.endsWith('/chat/completions'))).toBe(true);
    expect(r.attestation.quote).toMatchObject({ signature: 'verified', signatureCheckedIn: 'node', tcbStatus: 'OutOfDate', signatureSource: 'live' });
    expect((onAtt.mock.calls[0][0] as AttestationSummary).quote.signature).toBe('verified');
    // Intel's chain is checked on the very quote the binding was read from
    const nonce = new URL(calls.find((c) => c.url.includes('/tee/attestation'))!.url).searchParams.get('nonce')!;
    expect(Buffer.from(slow.mock.calls[0][0] as Uint8Array).toString('hex')).toBe(boundAttestation(nonce).intel_quote);
  });

  test('onBinding reports the passed binding while the signature is still pending, before anything is encrypted', async () => {
    let finish!: (r: QuoteSignatureResult) => void;
    const slow = vi.fn<(q: Uint8Array) => Promise<QuoteSignatureResult>>(() => new Promise((r) => (finish = r)));
    const onBinding = vi.fn();
    const onAtt = vi.fn();
    const { f, calls } = okChat();
    captured.keys = null;
    const p = enclaveChat(opts({ fetchImpl: f, verifyQuote: slow, onBinding, onAttestation: onAtt }));
    await vi.waitFor(() => expect(onBinding).toHaveBeenCalledOnce());
    const bound = onBinding.mock.calls[0][0] as AttestationSummary;
    expect(bound.quote.signature).toBe('pending');
    expect(bound.binding).toMatchObject({ addressMatches: true, nonceMatches: true, debug: false });
    expect(onAtt).not.toHaveBeenCalled();
    expect(captured.keys).toBeNull(); // no client key yet: nothing encrypted
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
    finish(VERIFIED);
    await p;
    expect(onAtt).toHaveBeenCalledOnce();
    // A second call in the window reuses the verified check: no binding step to report.
    const again = vi.fn();
    await enclaveChat(opts({ fetchImpl: f, onBinding: again }));
    expect(again).not.toHaveBeenCalled();
  });

  test('a failed binding never reports onBinding', async () => {
    const onBinding = vi.fn();
    const { f } = okNodeChat({ intel_quote: REAL.intel_quote });
    await expect(enclaveChat(opts({ node, fetchImpl: f, onBinding }))).rejects.toMatchObject({ code: 'quote_binding_failed' });
    expect(onBinding).not.toHaveBeenCalled();
  });

  test.each([
    ['browser', false],
    ['node', true],
  ])('%s path: an unverified signature fails closed with quote_unverified and sends nothing', async (_n, isNode) => {
    const { f, calls } = isNode ? okNodeChat() : okChat();
    const bad = vi.fn(async (): Promise<QuoteSignatureResult> => ({
      status: 'unverified', reasonCode: 'verification_failed', reason: 'ISV enclave report signature is invalid', checkedIn: 'browser',
    }));
    captured.keys = null;
    const err = await enclaveChat(opts({ node: isNode ? node : undefined, fetchImpl: f, verifyQuote: bad })).catch((e) => e);
    expect(err).toBeInstanceOf(EnclaveError);
    expect(err.code).toBe('quote_unverified');
    expect(err.attestation.quote).toMatchObject({ signature: 'unverified', reasonCode: 'verification_failed', reason: 'ISV enclave report signature is invalid' });
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
    expect(captured.keys).toBeNull(); // no client keys were even generated: nothing was encrypted
  });

  test('a throwing verifier fails closed too', async () => {
    const { f, calls } = okChat();
    const boom = vi.fn(async (): Promise<QuoteSignatureResult> => {
      throw new Error('verifier exploded');
    });
    const err = await enclaveChat(opts({ fetchImpl: f, verifyQuote: boom })).catch((e) => e);
    expect(err).toMatchObject({ code: 'quote_unverified' });
    expect(err.attestation.quote).toMatchObject({ signature: 'unverified', reasonCode: 'verifier_unavailable', reason: 'verifier exploded' });
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
  });

  test('browser path reuses a verified attestation per model for 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { f, calls } = okChat();
      const onAtt = vi.fn();
      const first = await enclaveChat(opts({ fetchImpl: f, onAttestation: onAtt }));
      expect(first.attestation).toMatchObject({ reused: false, ageMs: 0 });
      vi.setSystemTime(Date.now() + 120_000);
      const second = await enclaveChat(opts({ fetchImpl: f, onAttestation: onAtt }));
      expect(second.attestation).toMatchObject({ reused: true, ageMs: 120_000, checkedAt: first.attestation.checkedAt });
      expect(attCalls(calls)).toBe(1);
      expect(onAtt).toHaveBeenCalledTimes(2);
      expect((onAtt.mock.calls[1][0] as AttestationSummary).reused).toBe(true);
      const posts = calls.filter((c) => c.url === '/api/tee/chat').map((c) => JSON.parse(c.init!.body as string));
      expect(posts[1].modelPubKey).toBe(posts[0].modelPubKey);
      expect(posts[1].attestation.checkedAt).toBe(posts[0].attestation.checkedAt);
      expect(posts[0].attestation.quote.signature).toBe('verified');
      expect(posts[1].clientPubKey).not.toBe(posts[0].clientPubKey); // fresh client keys every call
      vi.setSystemTime(Date.now() + 8 * 60_000 + 1000); // 10 min + 1 s after the check
      expect((await enclaveChat(opts({ fetchImpl: f }))).attestation).toMatchObject({ reused: false, ageMs: 0 });
      expect(attCalls(calls)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('an unverified attestation is never cached: the next call attests and verifies again', async () => {
    const { f, calls } = okChat();
    const results: QuoteSignatureResult[] = [{ status: 'unverified', reasonCode: 'collateral_unavailable', reason: 'pccs down', checkedIn: 'browser' }, VERIFIED];
    const flaky = vi.fn(async () => results.shift() ?? VERIFIED);
    await expect(enclaveChat(opts({ fetchImpl: f, verifyQuote: flaky }))).rejects.toMatchObject({ code: 'quote_unverified' });
    expect((await enclaveChat(opts({ fetchImpl: f, verifyQuote: flaky }))).text).toBe('ok');
    expect(attCalls(calls)).toBe(2);
    expect(flaky).toHaveBeenCalledTimes(2);
    await enclaveChat(opts({ fetchImpl: f, verifyQuote: flaky })); // now verified -> cached
    expect(attCalls(calls)).toBe(2);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  test('concurrent browser calls share one attestation fetch and one signature check', async () => {
    const { f, calls } = okChat();
    verifyQuote.mockClear();
    const rs = await Promise.all([1, 2, 3].map(() => enclaveChat(opts({ fetchImpl: f }))));
    expect(rs.map((r) => r.text)).toEqual(['ok', 'ok', 'ok']);
    expect(attCalls(calls)).toBe(1);
    expect(verifyQuote).toHaveBeenCalledTimes(1);
  });

  test('5 concurrent callers on a failing shared check: 1 attestation, 1 verify, all 5 get the same quote_unverified', async () => {
    const { f, calls } = okChat();
    const bad = vi.fn(async (): Promise<QuoteSignatureResult> => ({ status: 'unverified', reasonCode: 'verification_failed', reason: 'x', checkedIn: 'browser' }));
    const rs = await Promise.allSettled([1, 2, 3, 4, 5].map(() => enclaveChat(opts({ fetchImpl: f, verifyQuote: bad }))));
    expect(rs.map((r) => r.status)).toEqual(Array(5).fill('rejected'));
    const errs = rs.map((r) => (r as PromiseRejectedResult).reason);
    for (const e of errs) expect(e).toMatchObject({ name: 'EnclaveError', code: 'quote_unverified' });
    expect(new Set(errs).size).toBe(1); // the very same failure, rethrown to every waiter
    expect(attCalls(calls)).toBe(1);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.includes('chat'))).toBe(false);
  });

  test('if the first caller cancels the shared check, waiters re-attest instead of inheriting its AbortError', async () => {
    const { f, calls } = okChat();
    const ac = new AbortController();
    ac.abort();
    const [first, waiter] = await Promise.allSettled([
      enclaveChat(opts({ fetchImpl: f, signal: ac.signal })),
      enclaveChat(opts({ fetchImpl: f })),
    ]);
    expect(first.status).toBe('rejected');
    expect((first as PromiseRejectedResult).reason.name).toBe('AbortError');
    expect(waiter.status).toBe('fulfilled');
    expect(attCalls(calls)).toBe(2);
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

describe('the verifier test seam', () => {
  test('refuses to swap the Intel signature verifier in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => __setQuoteVerifierForTests(async () => VERIFIED)).toThrow(/cannot be replaced in production/);
      expect(() => __setQuoteVerifierForTests(null)).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
