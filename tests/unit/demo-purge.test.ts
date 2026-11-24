import { afterEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ purge: vi.fn(), cards: vi.fn(), create: vi.fn() }));
vi.mock('@/db/sandbox', () => ({ purgeExpiredSandboxes: h.purge, createSandboxReserved: h.create }));
vi.mock('@/lib/access/purge', () => ({ purgeExpiredCards: h.cards }));
vi.mock('@/lib/auth/tokens', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/tokens')>()), hashClient: () => 'h'.repeat(64) }));

import { GET } from '@/app/demo/route';

afterEach(() => vi.restoreAllMocks());

describe('/demo purges are best effort', () => {
  test('a failed sandbox or card purge is logged by error name only and the visit goes on', async () => {
    h.purge.mockRejectedValueOnce(Object.assign(new Error('relation "churches" leaked Leo'), { name: 'PostgresError' }));
    h.cards.mockRejectedValueOnce(new TypeError('Leo peanut'));
    h.create.mockResolvedValueOnce(null); // reached: the limit answer proves the route went past both purges
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await GET(new Request('http://x/demo', { headers: { 'user-agent': 'Mozilla/5.0', 'x-forwarded-for': '192.0.2.9' } }));
    expect(res.status).toBe(429);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([['sandbox purge failed:', 'PostgresError'], ['card purge failed:', 'TypeError']]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Leo|peanut|churches/);
  });
});
