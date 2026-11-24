// SERVER-ONLY. A soft limit on the attestation proxy: Venice rate-limits attestation per key and model, and every
// request here spends that shared budget. Fixed one-minute windows, in memory, per server instance (not a hard
// global cap: a second instance has its own buckets). Keys are the church and a hash of the client IP.
import { createHash } from 'node:crypto';

export const ATTEST_LIMIT = 20;
export const ATTEST_WINDOW_MS = 60_000;
const MAX_BUCKETS = 5_000;

type Bucket = { start: number; count: number };

export type RateLimiter = {
  /** Counts one request against every key; refused (nothing counted) when any key is at its limit. */
  take(keys: string[], now: number): { ok: true } | { ok: false; retryAfterMs: number };
  reset(): void;
};

export function rateLimiter(limit = ATTEST_LIMIT, windowMs = ATTEST_WINDOW_MS): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const live = (key: string, now: number): Bucket => {
    const b = buckets.get(key);
    return b && now - b.start < windowMs ? b : { start: now, count: 0 };
  };
  return {
    take(keys, now) {
      const current = keys.map((k) => [k, live(k, now)] as const);
      const full = current.filter(([, b]) => b.count >= limit);
      if (full.length) return { ok: false, retryAfterMs: Math.max(...full.map(([, b]) => b.start + windowMs - now)) };
      if (buckets.size > MAX_BUCKETS) for (const [k, b] of buckets) if (now - b.start >= windowMs) buckets.delete(k);
      for (const [k, b] of current) buckets.set(k, { start: b.start, count: b.count + 1 });
      return { ok: true };
    },
    reset() {
      buckets.clear();
    },
  };
}

/** The raw IP never sits in memory as a key. */
export const ipKey = (ip: string) => `ip:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;

export const attestationLimiter = rateLimiter();
