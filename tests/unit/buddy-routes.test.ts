import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { listAccessForChild } from '@/db/repo/access';
import { insertAssignments } from '@/db/repo/assignments';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { stationAction } from '@/lib/checkins/station';
import type { BuddyToday } from '@/lib/buddy/types';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));

import * as todayRoute from '@/app/api/buddy/today/route';
import * as momentsRoute from '@/app/api/moments/route';
import * as cardRoute from '@/app/api/cards/[childId]/route';
import * as packRoute from '@/app/api/pack/route';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => {
  h.viewer = null;
});

async function world() {
  const { churchId } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const now = Date.now();
  const services = await listServices(churchId);
  const nine = services.find((s) => s.startsAt.getTime() <= now && s.endsAt.getTime() >= now)!;
  const eleven = services.find((s) => s.startsAt.getTime() > now && s.startsAt.getTime() < now + 3 * 3600_000)!;
  const pastNine = services.find((s) => s.label === nine.label && s.startsAt.getTime() < now - 6 * 24 * 3600_000)!;
  const as = (name: string, role: Viewer['role']): Viewer => ({ churchId, personId: p(name).id, role, sandbox: true });
  return { churchId, p, nine, eleven, pastNine, as };
}

const get = (url: string) => new Request(`http://x${url}`);
const today = async (qs = '') => todayRoute.GET(get(`/api/buddy/today${qs}`));

describe('GET /api/buddy/today', () => {
  it('lists only this buddy\'s approved matches at today\'s services, with names and card readiness', async () => {
    const w = await world();
    await insertAssignments([
      { serviceId: w.nine.id, childId: w.p('Leo').id, buddyId: w.p('Priya').id, status: 'approved' },
      { serviceId: w.nine.id, childId: w.p('Malik').id, buddyId: w.p('Priya').id, status: 'approved' },
      // Not hers: proposed only, another buddy's child, a past Sunday.
      { serviceId: w.nine.id, childId: w.p('Theo').id, buddyId: w.p('Priya').id, status: 'proposed' },
      { serviceId: w.nine.id, childId: w.p('Ana').id, buddyId: w.p('Marco').id, status: 'approved' },
    ]);
    h.viewer = w.as('Priya', 'buddy');
    const res = await today();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as BuddyToday;
    expect(body.services.map((s) => s.id)).toEqual([w.nine.id]);
    expect(body.services[0].children).toEqual([
      { id: w.p('Leo').id, firstName: 'Leo', grade: '2nd grade', card: 'ready' },
      // Malik's card is approved by his parent but not yet reviewed by the kids' team.
      { id: w.p('Malik').id, firstName: 'Malik', grade: '4th grade', card: 'waiting' },
    ]);
    // No card content of any kind in the answer.
    expect(JSON.stringify(body)).not.toMatch(/peanut|trains|items|quotes/i);
  });

  it('a child without a card shows as none; ?service= narrows to one service', async () => {
    const w = await world();
    await insertAssignments([
      { serviceId: w.nine.id, childId: w.p('Sam').id, buddyId: w.p('Grace').id, status: 'approved' },
      { serviceId: w.eleven.id, childId: w.p('Ivy').id, buddyId: w.p('Grace').id, status: 'approved' },
    ]);
    h.viewer = w.as('Grace', 'buddy');
    const all = (await (await today()).json()) as BuddyToday;
    expect(all.services.map((s) => s.label)).toEqual(['9:00 service', '11:00 service']);
    expect(all.services[0].children[0]).toMatchObject({ firstName: 'Sam', card: 'none' });
    const only = (await (await today(`?service=${w.eleven.id}`)).json()) as BuddyToday;
    expect(only.services.map((s) => s.id)).toEqual([w.eleven.id]);
  });

  it('past Sundays don\'t count; a buddy with nothing today gets an empty list', async () => {
    const w = await world();
    h.viewer = w.as('Priya', 'buddy'); // the seed has her with Leo on past Sundays only
    expect(((await (await today()).json()) as BuddyToday).services).toEqual([]);
  });

  it('buddies only; a service of another church is not found', async () => {
    const a = await world();
    const b = await world();
    expect((await today()).status).toBe(401);
    h.viewer = a.as('Hannah', 'director');
    expect((await today()).status).toBe(403);
    h.viewer = a.as('Maria', 'parent');
    expect((await today()).status).toBe(403);
    h.viewer = a.as('Priya', 'buddy');
    expect((await today(`?service=${b.nine.id}`)).status).toBe(404);
    expect((await today('?service=nope')).status).toBe(404);
  });
});

describe('GET /api/moments (buddy)', () => {
  it('only under the gate, only this buddy\'s moments for this child at this service, notes opened', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    await insertAssignments([{ serviceId: w.nine.id, childId: leo, buddyId: w.p('Priya').id, status: 'approved' }]);
    const list = () => momentsRoute.GET(get(`/api/moments?service=${w.nine.id}&child=${leo}`));
    h.viewer = w.as('Priya', 'buddy');
    const locked = await list();
    expect(locked.status).toBe(403);
    expect(await locked.json()).toEqual({ error: 'forbidden', reason: 'not_checked_in' });

    await stationAction(w.churchId, w.nine.id, leo, 'in', new Date());
    const post = (body: Record<string, unknown>) =>
      momentsRoute.POST(new Request('http://x/api/moments', { method: 'POST', body: JSON.stringify({ serviceId: w.nine.id, childId: leo, ...body }), headers: { 'content-type': 'application/json' } }));
    expect((await post({ stepKey: 'worship', kind: 'hard' })).status).toBe(200);
    expect((await post({ stepKey: 'other', kind: 'note', note: 'Asked for the trains book' })).status).toBe(200);

    const open = await list();
    expect(open.status).toBe(200);
    const { moments } = await open.json();
    expect(moments).toHaveLength(2);
    expect(moments.map((m: { kind: string }) => m.kind).sort()).toEqual(['hard', 'note']);
    expect(moments.find((m: { kind: string }) => m.kind === 'note')).toMatchObject({ stepKey: 'other', note: 'Asked for the trains book', helpedItemIds: [] });
    // The seeded past Sundays' moments with Leo are not today's.
    expect(moments.every((m: { at: string }) => Date.parse(m.at) > Date.now() - 3600_000)).toBe(true);

    h.viewer = w.as('Marco', 'buddy'); // not Leo's buddy
    expect((await list()).status).toBe(403);
    h.viewer = w.as('Hannah', 'director');
    expect((await list()).status).toBe(403);

    await stationAction(w.churchId, w.nine.id, leo, 'out', new Date());
    h.viewer = w.as('Priya', 'buddy');
    expect(await (await list()).json()).toEqual({ error: 'forbidden', reason: 'checked_out' });
  });
});

describe('one access entry per buddy session', () => {
  it('re-reads of an open card (the phone re-checking the gate, the picture schedule) fold into the open entry', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    await insertAssignments([{ serviceId: w.nine.id, childId: leo, buddyId: w.p('Priya').id, status: 'approved' }]);
    const card = () => cardRoute.GET(get(`/api/cards/${leo}?service=${w.nine.id}&scope=full`), { params: Promise.resolve({ childId: leo }) } as never);
    const pack = () => packRoute.GET(get(`/api/pack?service=${w.nine.id}&child=${leo}&lang=en`));
    const buddyRows = async () => (await listAccessForChild(leo)).filter((e) => e.role === 'buddy' && e.serviceId === w.nine.id);

    await stationAction(w.churchId, w.nine.id, leo, 'in', new Date());
    h.viewer = w.as('Priya', 'buddy');
    expect((await (await card()).json()).locked).toBe(false);
    expect((await pack()).status).toBe(200);
    expect((await (await card()).json()).locked).toBe(false);
    expect((await (await card()).json()).locked).toBe(false);
    let rows = await buddyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].closedAt).toBeNull();

    // Checkout closes it; a new check-in is a new session and a new entry.
    await stationAction(w.churchId, w.nine.id, leo, 'out', new Date());
    expect((await (await card()).json()).locked).toBe(true);
    await stationAction(w.churchId, w.nine.id, leo, 'in', new Date());
    expect((await (await card()).json()).locked).toBe(false);
    rows = await buddyRows();
    expect(rows).toHaveLength(2);
    expect(rows.filter((e) => e.closedAt === null)).toHaveLength(1);
  });
});
