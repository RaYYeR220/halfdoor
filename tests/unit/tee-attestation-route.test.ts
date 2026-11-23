import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/viewer', () => ({
  getViewer: vi.fn(async () => ({ churchId: 'c', personId: 'p', role: 'parent', sandbox: true })),
}));

import { GET } from '@/app/api/tee/attestation/route';
import { ATTESTATION_RETRY_DELAYS_MS, fetchAttestationWithRetry } from '@/lib/venice/request';
import { E2EE_MODEL } from '@/lib/venice/prices';

const statuses = (...s: number[]) => {
  const queue = [...s];
  return vi.fn(async () => {
    const st = queue.shift() ?? 500;
    return st === 200 ? Response.json({ verified: true }) : new Response('x', { status: st });
  });
};

describe('fetchAttestationWithRetry', () => {
  test('retries a Venice 429 with 1.5 s / 3 s backoff until it succeeds', async () => {
    const f = statuses(429, 429, 200);
    const sleep = vi.fn(async () => undefined);
    const res = await fetchAttestationWithRetry('u', {}, { fetchImpl: f as unknown as typeof fetch, sleep });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([1500, 3000]);
  });
  test('gives up after 3 retries (1.5 s / 3 s / 5 s) and returns the last 429', async () => {
    const f = statuses(429, 429, 429, 429, 200);
    const sleep = vi.fn(async () => undefined);
    const res = await fetchAttestationWithRetry('u', {}, { fetchImpl: f as unknown as typeof fetch, sleep });
    expect(res.status).toBe(429);
    expect(f).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([...ATTESTATION_RETRY_DELAYS_MS]);
  });
  test('does not retry other errors', async () => {
    const f = statuses(500, 200);
    const sleep = vi.fn(async () => undefined);
    expect((await fetchAttestationWithRetry('u', {}, { fetchImpl: f as unknown as typeof fetch, sleep })).status).toBe(500);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('GET /api/tee/attestation', () => {
  const url = `http://h/api/tee/attestation?model=${E2EE_MODEL}&nonce=${'ab'.repeat(32)}`;
  beforeEach(() => {
    process.env.VENICE_API_KEY = 'test-key';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('a 429 burst that clears returns the attestation', async () => {
    const f = statuses(429, 200);
    vi.stubGlobal('fetch', f);
    const p = GET(new Request(url));
    await vi.advanceTimersByTimeAsync(1500);
    const res = await p;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  test('persistent 429 becomes a 502 after 3 retries', async () => {
    const f = statuses(429, 429, 429, 429);
    vi.stubGlobal('fetch', f);
    const p = GET(new Request(url));
    await vi.advanceTimersByTimeAsync(1500 + 3000 + 5000);
    const res = await p;
    expect(res.status).toBe(502);
    expect(f).toHaveBeenCalledTimes(4);
  });
});
