import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/viewer', () => ({
  getViewer: vi.fn(async () => ({ churchId: 'c', personId: 'p', role: 'parent', sandbox: true })),
}));

import { GET } from '@/app/api/tee/attestation/route';
import { ATTESTATION_RETRY_DELAYS_MS, fetchAttestationWithRetry, retryDelayMs } from '@/lib/venice/request';
import { E2EE_MODEL } from '@/lib/venice/prices';

type Reply = number | { status: number; retryAfter: string };
const statuses = (...s: Reply[]) => {
  const queue = [...s];
  return vi.fn(async () => {
    const r = queue.shift() ?? 500;
    const st = typeof r === 'number' ? r : r.status;
    if (st === 200) return Response.json({ verified: true });
    return new Response('x', { status: st, headers: typeof r === 'number' ? {} : { 'Retry-After': r.retryAfter } });
  });
};
const noJitter = () => 0.5; // factor 0.7 + 0.6 * 0.5 = 1.0
const sleeps = (sleep: ReturnType<typeof vi.fn>) => sleep.mock.calls.map((c) => (c as unknown[])[0]);

describe('fetchAttestationWithRetry', () => {
  test('retries a Venice 429 with 1.5 s / 3 s backoff until it succeeds', async () => {
    const f = statuses(429, 429, 200);
    const sleep = vi.fn(async () => undefined);
    const res = await fetchAttestationWithRetry('u', {}, { fetchImpl: f as unknown as typeof fetch, sleep, random: noJitter });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleeps(sleep)).toEqual([1500, 3000]);
  });
  test('gives up after 3 retries (1.5 s / 3 s / 5 s) and returns the last 429', async () => {
    const f = statuses(429, 429, 429, 429, 200);
    const sleep = vi.fn(async () => undefined);
    const res = await fetchAttestationWithRetry('u', {}, { fetchImpl: f as unknown as typeof fetch, sleep, random: noJitter });
    expect(res.status).toBe(429);
    expect(f).toHaveBeenCalledTimes(4);
    expect(sleeps(sleep)).toEqual([...ATTESTATION_RETRY_DELAYS_MS]);
  });
  test('does not retry other errors', async () => {
    const f = statuses(500, 200);
    const sleep = vi.fn(async () => undefined);
    expect((await fetchAttestationWithRetry('u', {}, { fetchImpl: f as unknown as typeof fetch, sleep })).status).toBe(500);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
  test('Retry-After (seconds or HTTP date) wins over the backoff, capped at 10 s', async () => {
    const f = statuses({ status: 429, retryAfter: '2' }, { status: 429, retryAfter: '120' }, 200);
    const sleep = vi.fn(async () => undefined);
    await fetchAttestationWithRetry('u', {}, { fetchImpl: f as unknown as typeof fetch, sleep, random: noJitter });
    expect(sleeps(sleep)).toEqual([2000, 10_000]);
    const at = Date.parse('2026-11-23T12:00:00Z');
    expect(retryDelayMs(0, '4', () => 0.5, at)).toBe(4000);
    expect(retryDelayMs(0, new Date(at + 3000).toUTCString(), () => 0.5, at)).toBe(3000);
    expect(retryDelayMs(0, new Date(at - 3000).toUTCString(), () => 0.5, at)).toBe(0);
    expect(retryDelayMs(0, 'garbage', () => 0.5, at)).toBe(1500);
  });
  test('backoff has ±30% jitter', () => {
    expect(retryDelayMs(0, null, () => 0)).toBe(1050);
    expect(retryDelayMs(0, null, () => 0.999999)).toBeCloseTo(1950, 0);
    expect(retryDelayMs(2, null, () => 0)).toBe(3500);
    for (let i = 0; i < 50; i++) {
      const d = retryDelayMs(1, null);
      expect(d).toBeGreaterThanOrEqual(2100);
      expect(d).toBeLessThanOrEqual(3900);
    }
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
    await vi.advanceTimersByTimeAsync(1500 * 1.3);
    const res = await p;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  test('persistent 429 becomes a 502 after 3 retries', async () => {
    const f = statuses(429, 429, 429, 429);
    vi.stubGlobal('fetch', f);
    const p = GET(new Request(url));
    await vi.advanceTimersByTimeAsync((1500 + 3000 + 5000) * 1.3);
    const res = await p;
    expect(res.status).toBe(502);
    expect(f).toHaveBeenCalledTimes(4);
  });
});
