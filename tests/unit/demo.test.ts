import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, test } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { GET, HEAD } from '@/app/demo/route';

let db: ReturnType<typeof drizzle>;
beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});

const get = (headers: Record<string, string> = {}) => GET(new Request('http://x/demo', { headers }));
const count = async () => (await db.select().from(schema.churches)).length;

describe('GET /demo', () => {
  test('bots and HEAD create nothing', async () => {
    const before = await count();
    const uas = [
      'Slackbot-LinkExpanding 1.0', 'facebookexternalhit/1.1', 'Twitterbot/1.0', 'Mozilla/5.0 (compatible; Discordbot/2.0)',
      'LinkedInBot/1.0', 'WhatsApp/2', 'TelegramBot', 'Googlebot/2.1', 'bingbot/2.0',
    ];
    for (const ua of uas) {
      const r = await get({ 'user-agent': ua });
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('Open in a browser to try the demo church');
    }
    expect((await HEAD()).status).toBe(200);
    expect(await count()).toBe(before);
  });
  test('6th sandbox from one IP in an hour is a 429; another IP is fine; raw IP is never stored', async () => {
    const h = { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0' };
    for (let i = 0; i < 5; i++) expect((await get(h)).status).toBe(303);
    const r = await get(h);
    expect(r.status).toBe(429);
    expect(await r.text()).toBe('Too many demo churches from this connection. Try again in an hour.');
    expect((await get({ ...h, 'x-forwarded-for': '203.0.113.8' })).status).toBe(303);
    const rows = await db.select().from(schema.churches);
    expect(rows.every((c) => c.creatorHash && !c.creatorHash.includes('203.0.113'))).toBe(true);
  });
  test('global daily cap of 300', async () => {
    const now = new Date();
    await db.insert(schema.churches).values(
      Array.from({ length: 300 }, (_, i) => ({
        name: 'F', slug: `bulk-${i}-${randomBytes(3).toString('hex')}`, mode: 'sandbox' as const, wrappedDek: 'x', creatorHash: 'z'.repeat(64), createdAt: now,
      })),
    );
    const r = await get({ 'x-forwarded-for': '198.51.100.1', 'user-agent': 'Mozilla/5.0' });
    expect(r.status).toBe(429);
  });
});
