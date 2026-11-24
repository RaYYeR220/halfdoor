import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { GET, HEAD } from '@/app/demo/route';
import { clientIp } from '@/lib/auth/clientIp';
import { createSandboxReserved } from '@/db/sandbox';
import robots from '@/app/robots';
import { BOT_UA, isBot } from '@/lib/demo/bots';

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

describe('clientIp precedence', () => {
  const ip = (h: Record<string, string>) => clientIp(new Request('http://x/', { headers: h }));
  test('on Vercel: vercel header, then x-real-ip, then right-most XFF', () => {
    vi.stubEnv('VERCEL', '1');
    expect(ip({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '9.9.9.9, 3.3.3.3' })).toBe('1.1.1.1');
    expect(ip({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '9.9.9.9, 3.3.3.3' })).toBe('2.2.2.2');
    expect(ip({ 'x-forwarded-for': 'spoofed, 3.3.3.3' })).toBe('3.3.3.3');
    expect(ip({})).toBe('unknown');
    vi.unstubAllEnvs();
  });
  test('off Vercel: platform headers are ignored, right-most XFF is used', () => {
    vi.stubEnv('VERCEL', '');
    expect(ip({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '9.9.9.9, 3.3.3.3' })).toBe('3.3.3.3');
    expect(ip({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' })).toBe('unknown');
    vi.unstubAllEnvs();
  });
  test('a spoofed leftmost XFF cannot dodge the limit', async () => {
    await db.delete(schema.churches);
    for (let i = 0; i < 5; i++) {
      expect((await get({ 'x-forwarded-for': `spoof-${i}, 203.0.113.99`, 'user-agent': 'Mozilla/5.0' })).status).toBe(303);
    }
    expect((await get({ 'x-forwarded-for': 'spoof-new, 203.0.113.99', 'user-agent': 'Mozilla/5.0' })).status).toBe(429);
  });
});

describe('createSandboxReserved', () => {
  test('concurrent calls at the limit: only the remaining slots succeed', async () => {
    await db.delete(schema.churches);
    const h = 'c'.repeat(64);
    for (let i = 0; i < 3; i++) expect(await createSandboxReserved(h)).not.toBeNull();
    const results = await Promise.all(Array.from({ length: 6 }, () => createSandboxReserved(h)));
    expect(results.filter((r) => r !== null)).toHaveLength(2);
    const rows = await db.select().from(schema.churches);
    expect(rows.filter((c) => c.creatorHash === h)).toHaveLength(5);
  });
});

describe('who counts as a bot at /demo', () => {
  test('crawlers, unfurlers, monitors, command-line tools, scripts and headless browsers', () => {
    const bots = [
      'Slackbot-LinkExpanding 1.0', 'facebookexternalhit/1.1', 'Twitterbot/1.0', 'Mozilla/5.0 (compatible; Discordbot/2.0)', 'LinkedInBot/1.0',
      'WhatsApp/2.23', 'TelegramBot (like TwitterBot)', 'Googlebot/2.1', 'bingbot/2.0', 'Mozilla/5.0 (compatible; Yahoo! Slurp)',
      'Baiduspider/2.0', 'ia_archiver crawler', 'Mozilla/5.0 (compatible; Google-InspectionTool) preview', 'node-fetch/1.0',
      'UptimeRobot/2.0', 'Pingdom.com_bot', 'Site24x7 monitor', 'curl/8.4.0', 'Wget/1.21', 'python-requests/2.31', 'Python-urllib/3.11',
      'Go-http-client/1.1', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/138.0.0.0 Safari/537.36',
      'Scrapy/2.11', 'Apache-HttpClient/4.5.14', 'okhttp-bot',
    ];
    for (const ua of bots) expect(isBot(ua), ua).toBe(true);
    expect(isBot(null)).toBe(false);
  });
  test('people in browsers are not bots', () => {
    const people = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
    ];
    for (const ua of people) expect(BOT_UA.test(ua), ua).toBe(false);
  });
  test('a script or headless browser gets the static page and creates nothing', async () => {
    const before = await count();
    for (const ua of ['curl/8.4.0', 'python-requests/2.31', 'Mozilla/5.0 HeadlessChrome/138.0.0.0']) {
      const r = await get({ 'user-agent': ua, 'x-forwarded-for': '192.0.2.50' });
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('Open in a browser to try the demo church');
    }
    expect(await count()).toBe(before);
  });
});

describe('robots.txt', () => {
  test('the landing page is open; demo churches, their pages, the API and personal links are not', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/', disallow: ['/demo', '/c/', '/api/', '/p/', '/b/'] } });
  });
});
