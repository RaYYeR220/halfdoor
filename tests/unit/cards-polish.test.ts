import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { insertAssignments } from '@/db/repo/assignments';
import { deleteCardData, getCardForChild, updateCard } from '@/db/repo/cards';
import { listAccessForChild } from '@/db/repo/access';
import { readAccessLog } from '@/lib/access/log';
import { resetHeartbeatThrottle } from '@/lib/checkins/heartbeat';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));

import * as cardRoute from '@/app/api/cards/[childId]/route';
import * as returnRoute from '@/app/api/cards/[childId]/return/route';
import * as stationRoute from '@/app/api/station/route';
import * as heartbeatRoute from '@/app/api/heartbeat/route';

let db: ReturnType<typeof drizzle>;
beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => {
  h.viewer = null;
  resetHeartbeatThrottle();
});

type World = Awaited<ReturnType<typeof world>>;
async function world() {
  const { churchId } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const now = Date.now();
  const service = (await listServices(churchId)).find((s) => s.startsAt.getTime() <= now && s.endsAt.getTime() >= now)!;
  await insertAssignments([{ serviceId: service.id, childId: p('Leo').id, buddyId: p('Priya').id, status: 'approved' }]);
  const as = (name: string, role: Viewer['role']): Viewer => ({ churchId, personId: p(name).id, role, sandbox: true });
  return { churchId, p, service, as };
}

const params = (childId: string) => ({ params: Promise.resolve({ childId }) }) as never;
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://x${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const getCard = (childId: string, qs = '') => cardRoute.GET(req('GET', `/api/cards/${childId}${qs}`), params(childId));
const station = (w: World, childName: string, action: 'in' | 'out') =>
  stationRoute.POST(req('POST', '/api/station', { serviceId: w.service.id, childId: w.p(childName).id, action }));
const beat = (w: World) => heartbeatRoute.GET(req('GET', `/api/heartbeat?service=${w.service.id}`));

const MIN = 60_000;
const YEAR_MS = 365 * 24 * 3600_000;

describe('retention follows attendance', () => {
  it('check-in pushes retain_until to at least checkedInAt + 12 months, never shortens it', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    const card = (await getCardForChild(w.churchId, leo))!;
    await updateCard(card.id, { retainUntil: new Date(Date.now() + 30 * 24 * 3600_000) });
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    const bumped = (await getCardForChild(w.churchId, leo))!.retainUntil!.getTime();
    expect(Math.abs(bumped - (Date.now() + YEAR_MS))).toBeLessThan(60_000);
    const far = new Date(Date.now() + 3 * YEAR_MS);
    await updateCard(card.id, { retainUntil: far });
    await station(w, 'Leo', 'out');
    await station(w, 'Leo', 'in');
    expect((await getCardForChild(w.churchId, leo))!.retainUntil!.getTime()).toBe(far.getTime());
  });

  it('a draft save sets retain_until to now + 12 months', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    h.viewer = w.as('Maria', 'parent');
    const items = (await (await getCard(leo)).json()).card.items;
    await updateCard((await getCardForChild(w.churchId, leo))!.id, { retainUntil: null });
    await cardRoute.PUT(req('PUT', 'x', { items, tags: [], supportLevel: 'parts', lang: 'en', approve: false }), params(leo));
    const r = (await getCardForChild(w.churchId, leo))!.retainUntil!.getTime();
    expect(Math.abs(r - (Date.now() + YEAR_MS))).toBeLessThan(60_000);
  });
});

describe('validation caps', () => {
  it('rejects quote text and spans over 6000', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    h.viewer = w.as('Maria', 'parent');
    const items = (await (await getCard(leo)).json()).card.items;
    const mk = (q: unknown) => items.map((i: object, k: number) => (k === 0 ? { ...i, quotes: [q] } : i));
    for (const q of [{ text: 'x'.repeat(6001), span: { start: 0, end: 5 } }, { text: 'x', span: { start: 0, end: 6001 } }]) {
      const res = await cardRoute.PUT(req('PUT', 'x', { items: mk(q), tags: [], supportLevel: 'parts', lang: 'en', approve: false }), params(leo));
      expect(res.status).toBe(400);
    }
  });
});

describe('access log precision', () => {
  it('buddy rows carry service_id; a denial closes only that service entries', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    const other = (await listServices(w.churchId)).find((s) => s.id !== w.service.id)!;
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    await getCard(leo);
    h.viewer = w.as('Priya', 'buddy');
    await getCard(leo, `?service=${w.service.id}`);
    await db.insert(schema.cardAccessLog).values({
      cardId: (await getCardForChild(w.churchId, leo))!.id, childId: leo, serviceId: other.id, viewerId: w.p('Priya').id, role: 'buddy', reason: 'checked_in',
    });
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'out');
    h.viewer = w.as('Priya', 'buddy');
    await getCard(leo, `?service=${w.service.id}`);
    const log = await listAccessForChild(leo);
    expect(log.find((e) => e.role === 'director')!.serviceId).toBeNull();
    expect(log.find((e) => e.serviceId === w.service.id)!.closedAt).not.toBeNull();
    expect(log.find((e) => e.serviceId === other.id)!.closedAt).toBeNull();
  });

  it('delete closes every open entry before tombstoning, and tombstones exactly once', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    h.viewer = w.as('Priya', 'buddy');
    await getCard(leo, `?service=${w.service.id}`);
    expect((await listAccessForChild(leo)).some((e) => e.closedAt === null)).toBe(true);
    const card = (await getCardForChild(w.churchId, leo))!;
    expect(await deleteCardData(card, { personId: null, role: 'system' }, new Date())).toBe(true);
    expect(await deleteCardData(card, { personId: null, role: 'system' }, new Date())).toBe(false);
    const log = await listAccessForChild(leo);
    expect(log.every((e) => e.closedAt !== null)).toBe(true);
    expect(log.filter((e) => e.reason === 'deleted')).toHaveLength(1);
  });

  it('reading the log closes buddy sessions whose window has ended, at the window end', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    h.viewer = w.as('Priya', 'buddy');
    await getCard(leo, `?service=${w.service.id}`);
    expect((await readAccessLog(w.churchId, leo, new Date()))!.find((e) => e.role === 'buddy')!.closedAt).toBeNull();
    const later = new Date(w.service.endsAt.getTime() + 31 * MIN);
    const entry = (await readAccessLog(w.churchId, leo, later))!.find((e) => e.role === 'buddy')!;
    expect(entry.closedAt!.getTime()).toBe(w.service.endsAt.getTime() + 30 * MIN);
    expect((await listAccessForChild(leo)).find((e) => e.role === 'buddy')!.closedAt).not.toBeNull();
    expect(await readAccessLog(w.churchId, 'ffffffff-ffff-4fff-8fff-ffffffffffff', later)).toBeNull();
  });
});

describe('heartbeat codes and sealed question', () => {
  it('a buddy sees security codes only for their own assigned children', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    await station(w, 'Ana', 'in');
    h.viewer = w.as('Priya', 'buddy');
    const mine = (await (await beat(w)).json()).checkins.map((c: { childId: string }) => c.childId);
    expect(mine).toEqual([w.p('Leo').id]);
    h.viewer = w.as('Tom', 'leader');
    expect((await (await beat(w)).json()).checkins).toHaveLength(2);
    h.viewer = w.as('Hannah', 'director');
    expect((await (await beat(w)).json()).checkins).toHaveLength(2);
  });

  it('a proposed assignment returns no security code to the buddy', async () => {
    const w = await world();
    await db.update(schema.assignments).set({ status: 'proposed' }).where(eq(schema.assignments.serviceId, w.service.id));
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    h.viewer = w.as('Priya', 'buddy');
    expect((await (await beat(w)).json()).checkins).toEqual([]);
  });

  it('the returned question is sealed at rest', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    await returnRoute.POST(req('POST', 'x', { question: 'Is the EpiPen in the red bag?' }), params(w.p('Leo').id));
    const [row] = await db.select().from(schema.cards).where(eq(schema.cards.childId, w.p('Leo').id));
    expect(JSON.stringify(row)).not.toContain('EpiPen');
  });
});
