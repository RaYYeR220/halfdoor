import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { insertAccess, listAccessForChild } from '@/db/repo/access';
import { getCardForChild } from '@/db/repo/cards';
import { getChurch } from '@/db/repo/churches';
import { insertHouseholdLinks, insertPeople, listChildrenOf, listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { WINDOW_MS } from '@/lib/access/gate';
import type { Viewer } from '@/lib/auth/viewer';
import { visibleAccessRows } from '@/lib/parent/accessLog';
import { loadChildPage } from '@/lib/parent/server';
import { deriveTimeline } from '@/lib/parent/timeline';
import type { AccessRow } from '@/lib/parent/types';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));

import { GET } from '@/app/api/access-log/route';

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

async function world(opts: { accessHistory?: boolean } = {}) {
  const { churchId } = await createSandbox(opts);
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const as = (name: string, role: Viewer['role']): Viewer => ({ churchId, personId: p(name).id, role, sandbox: true });
  return { churchId, p, as };
}

const get = async (child: string) => {
  const res = await GET(new Request(`http://x/api/access-log?child=${child}`));
  return { status: res.status, body: (await res.json()) as { rows?: AccessRow[]; error?: string }, cache: res.headers.get('cache-control') };
};

describe('GET /api/access-log', () => {
  it('needs a viewer, and only parents and the director may ask', async () => {
    const w = await world();
    expect((await get(w.p('Leo').id)).status).toBe(401);
    h.viewer = w.as('Priya', 'buddy');
    expect((await get(w.p('Leo').id)).status).toBe(403);
    h.viewer = w.as('Tom', 'leader');
    expect((await get(w.p('Leo').id)).status).toBe(403);
  });

  it("a parent sees their own child's log, not another family's", async () => {
    const w = await world();
    await insertAccess({ childId: w.p('Leo').id, viewerId: w.p('Hannah').id, role: 'director', reason: 'director', openedAt: new Date(), closedAt: new Date() });
    h.viewer = w.as('Maria', 'parent');
    const mine = await get(w.p('Leo').id);
    expect(mine.status).toBe(200);
    expect(mine.cache).toBe('no-store');
    expect(mine.body.rows).toEqual([expect.objectContaining({ who: 'Hannah', me: false, reason: 'director', role: 'director' })]);
    expect(JSON.stringify(mine.body)).not.toContain(w.p('Hannah').id); // names, never other people's ids
    expect((await get(w.p('Sam').id)).status).toBe(403);
    expect((await get('not-a-uuid')).status).toBe(404);
  });

  it('is tenant-scoped: a child of another church is not found, for parents and the director alike', async () => {
    const a = await world();
    const b = await world();
    h.viewer = a.as('Maria', 'parent');
    expect((await get(b.p('Leo').id)).status).toBe(404);
    h.viewer = a.as('Hannah', 'director');
    expect((await get(b.p('Leo').id)).status).toBe(404);
    expect((await get(a.p('Leo').id)).status).toBe(200);
  });

  it('closes a buddy session whose service window has ended (readAccessLog), at the window end', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    const past = (await listServices(w.churchId)).filter((s) => s.endsAt.getTime() < Date.now() - WINDOW_MS).sort((x, y) => y.startsAt.getTime() - x.startsAt.getTime())[0];
    await insertAccess({ childId: leo, serviceId: past.id, viewerId: w.p('Priya').id, role: 'buddy', reason: 'checked_in', openedAt: new Date(past.startsAt.getTime() + 4 * 60_000), closedAt: null });
    h.viewer = w.as('Maria', 'parent');
    const { body } = await get(leo);
    expect(body.rows![0]).toMatchObject({ who: 'Priya', reason: 'checked_in', closedAt: new Date(past.endsAt.getTime() + WINDOW_MS).toISOString() });
    expect((await listAccessForChild(leo))[0].closedAt).not.toBeNull();
  });
});

describe('demo sandbox history and the parent page loader', () => {
  it('unit-test sandboxes start with an empty log; the demo one has past Sundays that fit the fixture', async () => {
    const plain = await world();
    expect(await listAccessForChild(plain.p('Leo').id)).toHaveLength(0);

    const w = await world({ accessHistory: true });
    const leo = w.p('Leo').id;
    const card = (await getCardForChild(w.churchId, leo))!;
    const services = new Map((await listServices(w.churchId)).map((s) => [s.id, s]));
    const log = await listAccessForChild(leo);
    expect(log.filter((e) => e.reason === 'director')).toHaveLength(1);
    const buddy = log.filter((e) => e.reason === 'checked_in');
    expect(buddy).toHaveLength(5);
    for (const e of buddy) {
      const s = services.get(e.serviceId!)!;
      expect(e.viewerId).toBe(w.p('Priya').id);
      expect(e.openedAt.getTime()).toBeGreaterThan(s.startsAt.getTime());
      expect(e.closedAt!.getTime()).toBe(s.endsAt.getTime());
      expect(e.openedAt.getTime()).toBeGreaterThan(card.directorAckAt!.getTime()); // only after the card was reviewed
    }
    expect(card.parentApprovedAt!.getTime()).toBeLessThan(card.directorAckAt!.getTime());
    // Sam (the new family) has no history at all.
    expect(await listAccessForChild(w.p('Sam').id)).toHaveLength(0);
  });

  it("Maria's page: the acknowledged card, Priya as the buddy, her openings, and the whole timeline done", async () => {
    const w = await world({ accessHistory: true });
    const church = (await getChurch(w.churchId))!;
    const [leo] = await listChildrenOf(w.churchId, w.p('Maria').id);
    expect(leo.firstName).toBe('Leo');
    const data = await loadChildPage(church, leo, w.p('Maria').id, new Date());
    expect(data.card).toMatchObject({ status: 'acknowledged', childFirstName: 'Leo' });
    expect(data.card!.items.some((i) => i.section === 'safety')).toBe(true);
    expect(data.match).toMatchObject({ buddy: 'Priya', serviceLabel: '9:00 service' });
    expect(data.access.filter((r) => r.who === 'Priya')).toHaveLength(5);
    expect(data.tz).toBe('America/Chicago');
    const steps = deriveTimeline({ status: data.card!.status, parentApprovedAt: data.card!.parentApprovedAt, directorAckAt: data.card!.directorAckAt, match: data.match, access: data.access });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('opening the page logs the parent once per church day; a co-parent sees that row, the viewer never their own', async () => {
    const w = await world();
    const church = (await getChurch(w.churchId))!;
    const maria = w.p('Maria').id;
    const [leo] = await listChildrenOf(w.churchId, maria);
    const [alex] = await insertPeople([{ churchId: w.churchId, role: 'parent', firstName: 'Alex' }]);
    await insertHouseholdLinks([{ parentId: alex.id, childId: leo.id }]);
    const parentRows = async () => (await listAccessForChild(leo.id)).filter((e) => e.reason === 'parent');

    const t0 = new Date();
    const first = await loadChildPage(church, leo, maria, t0);
    expect(first.access.filter((r) => r.reason === 'parent')).toEqual([expect.objectContaining({ who: 'Maria', me: true, role: 'parent' })]);
    expect(visibleAccessRows(first.access).some((r) => r.reason === 'parent')).toBe(false); // hidden from Maria herself
    await loadChildPage(church, leo, maria, new Date(t0.getTime() + 60_000)); // a refresh, the language switch…
    expect(await parentRows()).toHaveLength(1);
    await loadChildPage(church, leo, maria, new Date(t0.getTime() + 26 * 3600_000)); // the next day
    expect(await parentRows()).toHaveLength(2);

    // Alex, the other parent, sees Maria's openings in plain words (and is logged too)
    const forAlex = await loadChildPage(church, leo, alex.id, new Date(t0.getTime() + 27 * 3600_000));
    const seen = visibleAccessRows(forAlex.access).filter((r) => r.reason === 'parent');
    expect(seen.map((r) => [r.who, r.me])).toEqual([['Maria', false], ['Maria', false]]);
    h.viewer = { churchId: w.churchId, personId: alex.id, role: 'parent', sandbox: true } satisfies Viewer;
    const { body } = await get(leo.id);
    expect(body.rows!.filter((r) => r.reason === 'parent').map((r) => [r.who, r.me])).toEqual([['Alex', true], ['Maria', false], ['Maria', false]]);

    // no card, nothing to log
    const [sam] = await listChildrenOf(w.churchId, w.p('Jordan').id);
    await loadChildPage(church, sam, w.p('Jordan').id, t0);
    expect(await listAccessForChild(sam.id)).toHaveLength(0);
  });

  it("Jordan's page: Sam, no card yet; the children list is the parent's own, in this church only", async () => {
    const w = await world({ accessHistory: true });
    const other = await world();
    expect((await listChildrenOf(w.churchId, w.p('Jordan').id)).map((c) => c.firstName)).toEqual(['Sam']);
    expect(await listChildrenOf(other.churchId, w.p('Jordan').id)).toEqual([]);
    const church = (await getChurch(w.churchId))!;
    const [sam] = await listChildrenOf(w.churchId, w.p('Jordan').id);
    const data = await loadChildPage(church, sam, w.p('Jordan').id, new Date());
    expect(data).toMatchObject({ card: null, match: null, access: [], notes: [] });
  });
});
