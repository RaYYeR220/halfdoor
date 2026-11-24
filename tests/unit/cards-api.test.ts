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
import { getCardForChild, updateCard } from '@/db/repo/cards';
import { listAccessForChild } from '@/db/repo/access';
import { purgeExpiredCards } from '@/lib/access/purge';
import { resetHeartbeatThrottle } from '@/lib/checkins/heartbeat';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));

import * as cardRoute from '@/app/api/cards/[childId]/route';
import * as ackRoute from '@/app/api/cards/[childId]/ack/route';
import * as returnRoute from '@/app/api/cards/[childId]/return/route';
import * as notesRoute from '@/app/api/cards/[childId]/team-notes/route';
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

describe('GET /api/cards/:childId: the buddy gate', () => {
  it('locks until the child checks in, logs the opening, closes it on check-out', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    h.viewer = w.as('Priya', 'buddy');
    const q = `?service=${w.service.id}`;
    expect(await (await getCard(leo, q)).json()).toEqual({ locked: true, reason: 'not_checked_in' });
    expect(await listAccessForChild(leo)).toHaveLength(0);

    h.viewer = w.as('Maria', 'parent'); // anyone may play the front desk in a sandbox
    expect((await station(w, 'Leo', 'in')).status).toBe(200);

    h.viewer = w.as('Priya', 'buddy');
    const open = await (await getCard(leo, q)).json();
    expect(open.locked).toBe(false);
    expect(open.card.childFirstName).toBe('Leo');
    expect(open.card.items.some((i: { section: string }) => i.section === 'loves')).toBe(true);
    let log = await listAccessForChild(leo);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ role: 'buddy', reason: 'checked_in', closedAt: null, viewerId: w.p('Priya').id });

    h.viewer = w.as('Maria', 'parent');
    await station(w, 'Leo', 'out');
    h.viewer = w.as('Priya', 'buddy');
    expect(await (await getCard(leo, q)).json()).toEqual({ locked: true, reason: 'checked_out' });
    log = await listAccessForChild(leo);
    expect(log).toHaveLength(1);
    expect(log[0].closedAt).not.toBeNull();
  });

  it('checkout itself closes the buddy and room-leader sessions at the checkout time; other children stay open', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    await insertAssignments([{ serviceId: w.service.id, childId: w.p('Ana').id, buddyId: w.p('Marco').id, status: 'approved' }]);
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    await station(w, 'Ana', 'in');
    h.viewer = w.as('Priya', 'buddy');
    expect((await (await getCard(leo, `?service=${w.service.id}`)).json()).locked).toBe(false);
    h.viewer = w.as('Tom', 'leader');
    expect((await (await getCard(leo, `?service=${w.service.id}&scope=safety`)).json()).locked).toBe(false);
    h.viewer = w.as('Marco', 'buddy');
    expect((await (await getCard(w.p('Ana').id, `?service=${w.service.id}`)).json()).locked).toBe(false);

    h.viewer = w.as('Hannah', 'director');
    const before = Date.now();
    await station(w, 'Leo', 'out');
    const sessions = (await listAccessForChild(leo)).filter((e) => e.reason === 'checked_in' || e.reason === 'room_safety');
    expect(sessions.map((e) => e.role).sort()).toEqual(['buddy', 'leader']);
    for (const e of sessions) {
      expect(e.closedAt).not.toBeNull();
      expect(e.closedAt!.getTime()).toBeGreaterThanOrEqual(before);
    }
    expect((await listAccessForChild(w.p('Ana').id)).filter((e) => e.reason === 'checked_in')).toEqual([expect.objectContaining({ closedAt: null })]);
  });

  it('heartbeat closes the buddy\'s open entry once the child is out', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    h.viewer = w.as('Priya', 'buddy');
    expect((await (await getCard(leo, `?service=${w.service.id}`)).json()).locked).toBe(false);
    const hb = await (await beat(w)).json();
    expect(hb.checkins).toEqual([{
      childId: leo, securityCode: expect.stringMatching(/^[A-HJ-NP-Z2-9]{4}$/), in: true, checkedInAt: expect.any(String), checkedOutAt: null,
    }]);
    expect(hb.viewerId).toBe(w.p('Priya').id);
    expect((await listAccessForChild(leo))[0].closedAt).toBeNull();
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'out');
    h.viewer = w.as('Priya', 'buddy');
    const after = await (await beat(w)).json();
    expect(after.checkins[0].in).toBe(false);
    expect(Date.parse(after.checkins[0].checkedOutAt)).toBeGreaterThanOrEqual(Date.parse(after.checkins[0].checkedInAt));
    expect((await listAccessForChild(leo))[0].closedAt).not.toBeNull();
  });

  it('a buddy who is not assigned to the child is locked even when checked in', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    h.viewer = w.as('Marco', 'buddy');
    expect(await (await getCard(w.p('Leo').id, `?service=${w.service.id}`)).json()).toEqual({ locked: true, reason: 'not_assigned' });
  });

  it('a check-in at another service of the church does not unlock this one', async () => {
    const w = await world();
    const other = (await listServices(w.churchId)).find((s) => s.id !== w.service.id)!;
    h.viewer = w.as('Hannah', 'director');
    await stationRoute.POST(req('POST', '/api/station', { serviceId: other.id, childId: w.p('Leo').id, action: 'in' }));
    h.viewer = w.as('Priya', 'buddy');
    expect(await (await getCard(w.p('Leo').id, `?service=${w.service.id}`)).json()).toEqual({ locked: true, reason: 'other_service' });
  });

  it('a card being updated opens with its safety lines only; a draft stays locked', async () => {
    const w = await world();
    const card = (await getCardForChild(w.churchId, w.p('Leo').id))!;
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    for (const status of ['parent_approved', 'returned'] as const) {
      await updateCard(card.id, { status });
      h.viewer = w.as('Priya', 'buddy');
      const body = await (await getCard(w.p('Leo').id, `?service=${w.service.id}`)).json();
      expect(body.locked).toBe(false);
      expect(body.card.status).toBe(status);
      expect(body.card.items.length).toBeGreaterThan(0);
      expect(body.card.items.every((i: { section: string }) => i.section === 'safety')).toBe(true);
      expect(body.card.teamNotes).toBeUndefined();
      h.viewer = w.as('Tom', 'leader');
      expect((await (await getCard(w.p('Leo').id, `?service=${w.service.id}&scope=safety`)).json()).locked).toBe(false);
    }
    await updateCard(card.id, { status: 'draft' });
    h.viewer = w.as('Priya', 'buddy');
    expect(await (await getCard(w.p('Leo').id, `?service=${w.service.id}`)).json()).toEqual({ locked: true, reason: 'not_acknowledged' });
    h.viewer = w.as('Hannah', 'director');
    expect(await (await getCard(w.p('Leo').id)).json()).toEqual({ locked: true, reason: 'draft' });
  });

  it('the room leader gets safety items only, and no team notes', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    await notesRoute.PUT(req('PUT', 'x', { text: 'Ask Priya first' }), params(w.p('Leo').id));
    await station(w, 'Leo', 'in');
    h.viewer = w.as('Tom', 'leader');
    const body = await (await getCard(w.p('Leo').id, `?service=${w.service.id}`)).json();
    expect(body.locked).toBe(false);
    expect(body.card.items.length).toBeGreaterThan(0);
    expect(body.card.items.every((i: { section: string }) => i.section === 'safety')).toBe(true);
    expect(body.card.teamNotes).toBeUndefined();
    expect((await listAccessForChild(w.p('Leo').id)).at(-1)).toMatchObject({ role: 'leader', reason: 'room_safety' });
  });

  it('team notes reach director and buddy, attributed in the view as plain text', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    expect((await notesRoute.PUT(req('PUT', 'x', { text: 'Ask Priya first' }), params(w.p('Leo').id))).status).toBe(200);
    expect((await (await getCard(w.p('Leo').id)).json()).card.teamNotes).toBe('Ask Priya first');
    const raw = (await getCardForChild(w.churchId, w.p('Leo').id))!.teamNotesEnc!;
    expect(raw).not.toContain('Priya');
  });
});

describe('auth and tenancy', () => {
  it('a refused viewer gets the same answer whether or not the child has a card', async () => {
    const w = await world();
    const sam = w.p('Sam').id;
    expect(await getCardForChild(w.churchId, sam)).toBeUndefined();
    const q = `?service=${w.service.id}`;
    // An unassigned buddy: not_assigned for a child with a card and for one without.
    h.viewer = w.as('Marco', 'buddy');
    expect(await (await getCard(sam, q)).json()).toEqual({ locked: true, reason: 'not_assigned' });
    expect(await (await getCard(w.p('Leo').id, q)).json()).toEqual({ locked: true, reason: 'not_assigned' });
    // A parent of another child: 403 either way.
    h.viewer = w.as('Maria', 'parent');
    expect((await getCard(sam)).status).toBe(403);
    // A room leader before check-in: the check-in answer, not "no card".
    h.viewer = w.as('Tom', 'leader');
    expect(await (await getCard(sam, `${q}&scope=safety`)).json()).toEqual({ locked: true, reason: 'not_checked_in' });
    // Someone the gate lets in learns there is no card.
    h.viewer = w.as('Hannah', 'director');
    expect((await getCard(sam)).status).toBe(404);
  });

  it('401 without a viewer, 403 for the wrong role, 404 for a bad id', async () => {
    const w = await world();
    expect((await getCard(w.p('Leo').id)).status).toBe(401);
    h.viewer = w.as('Priya', 'buddy');
    expect((await ackRoute.POST(req('POST', 'x'), params(w.p('Leo').id))).status).toBe(403);
    expect((await cardRoute.DELETE(req('DELETE', 'x'), params(w.p('Leo').id))).status).toBe(403);
    expect((await getCard('not-a-uuid')).status).toBe(404);
    h.viewer = w.as('Jordan', 'parent');
    expect((await getCard(w.p('Leo').id)).status).toBe(403); // another family's child
  });

  it('a director of sandbox A gets 404 for a child, service and station call of sandbox B', async () => {
    const a = await world();
    const b = await world();
    h.viewer = a.as('Hannah', 'director');
    expect((await getCard(b.p('Leo').id)).status).toBe(404);
    expect((await ackRoute.POST(req('POST', 'x'), params(b.p('Leo').id))).status).toBe(404);
    expect((await returnRoute.POST(req('POST', 'x', { question: 'q' }), params(b.p('Leo').id))).status).toBe(404);
    expect((await notesRoute.PUT(req('PUT', 'x', { text: 't' }), params(b.p('Leo').id))).status).toBe(404);
    expect((await getCard(a.p('Leo').id, `?service=${b.service.id}`)).status).toBe(404);
    expect((await stationRoute.POST(req('POST', '/api/station', { serviceId: b.service.id, childId: a.p('Leo').id, action: 'in' }))).status).toBe(404);
    expect((await stationRoute.POST(req('POST', '/api/station', { serviceId: a.service.id, childId: b.p('Leo').id, action: 'in' }))).status).toBe(404);
    expect((await heartbeatRoute.GET(req('GET', `/api/heartbeat?service=${b.service.id}`))).status).toBe(404);
    // and nothing leaked into B
    expect(await listAccessForChild(b.p('Leo').id)).toHaveLength(0);
  });

  it('the station is sandbox only and validates its body', async () => {
    const w = await world();
    h.viewer = { ...w.as('Hannah', 'director'), sandbox: false };
    expect((await station(w, 'Leo', 'in')).status).toBe(403);
    h.viewer = w.as('Hannah', 'director');
    expect((await stationRoute.POST(req('POST', '/api/station', { serviceId: w.service.id, childId: w.p('Leo').id, action: 'sideways' }))).status).toBe(400);
    expect((await station(w, 'Leo', 'out')).status).toBe(409);
    expect((await station(w, 'Leo', 'in')).status).toBe(200);
    expect((await station(w, 'Leo', 'in')).status).toBe(409);
  });

  it('a parent heartbeat lists only her own children', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    await station(w, 'Leo', 'in');
    await station(w, 'Ana', 'in');
    h.viewer = w.as('Maria', 'parent');
    const hb = await (await beat(w)).json();
    expect(hb.checkins.map((c: { childId: string }) => c.childId)).toEqual([w.p('Leo').id]);
  });
});

describe('parent save / approve, director ack / return', () => {
  async function itemsOf(w: World) {
    h.viewer = w.as('Maria', 'parent');
    return (await (await getCard(w.p('Leo').id)).json()).card.items as { id: string; section: string; kind: string; text: string }[];
  }
  const body = (items: unknown, over: Record<string, unknown> = {}) => ({ items, tags: ['noise_sensitive'], supportLevel: 'parts', lang: 'en', approve: false, ...over });
  const put = (w: World, b: unknown) => cardRoute.PUT(req('PUT', 'x', b), params(w.p('Leo').id));

  it('rejects structurally bad cards without echoing them', async () => {
    const w = await world();
    const items = await itemsOf(w);
    const noQuote = items.map((i, k) => (k === 0 ? { ...i, quotes: [] } : i));
    const softSafety = items.map((i) => (i.section === 'safety' ? { ...i, kind: 'paraphrase' } : i));
    const longText = items.map((i, k) => (k === 0 ? { ...i, text: 'x'.repeat(401) } : i));
    const tooMany = Array.from({ length: 41 }, (_, k) => ({ ...items[0], id: `i${k}` }));
    for (const bad of [body(noQuote), body(softSafety), body(longText), body(tooMany), body(items, { tags: ['nope'] }), body(items, { supportLevel: 'lots' })]) {
      const res = await put(w, bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_card' });
    }
  });

  it('save keeps draft and voids the ack; approve sets parent_approved, bumps version, 12-month retention', async () => {
    const w = await world();
    const items = await itemsOf(w);
    const before = (await getCardForChild(w.churchId, w.p('Leo').id))!;
    expect(before.status).toBe('acknowledged');
    let res = await put(w, body(items));
    expect(await res.json()).toMatchObject({ status: 'draft', version: before.version });
    let row = (await getCardForChild(w.churchId, w.p('Leo').id))!;
    expect(row.status).toBe('draft');
    expect(row.directorAckAt).toBeNull();

    res = await put(w, body(items, { approve: true }));
    expect(await res.json()).toMatchObject({ status: 'parent_approved', version: before.version + 1 });
    row = (await getCardForChild(w.churchId, w.p('Leo').id))!;
    expect(row.parentApprovedAt).not.toBeNull();
    const months = (row.retainUntil!.getTime() - Date.now()) / (30 * 24 * 3600_000);
    expect(months).toBeGreaterThan(11.5);
    expect(months).toBeLessThan(12.5);
    expect(row.itemsEnc).not.toContain('peanuts');
  });

  it('a parent can only edit her own child', async () => {
    const w = await world();
    const items = await itemsOf(w);
    h.viewer = w.as('Jordan', 'parent');
    expect((await put(w, body(items))).status).toBe(403);
  });

  it('ack only from parent_approved; return needs a question and clears the ack', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    h.viewer = w.as('Hannah', 'director');
    expect((await ackRoute.POST(req('POST', 'x'), params(leo))).status).toBe(409); // already acknowledged
    expect((await returnRoute.POST(req('POST', 'x', { question: '   ' }), params(leo))).status).toBe(400);
    expect((await returnRoute.POST(req('POST', 'x', { question: 'Which peanut brand?' }), params(leo))).status).toBe(200);
    const row = (await getCardForChild(w.churchId, leo))!;
    expect(row).toMatchObject({ status: 'returned', directorAckAt: null });
    expect(row.returnedQuestionEnc).not.toBeNull();
    expect(row.returnedQuestionEnc).not.toContain('peanut');
    expect((await ackRoute.POST(req('POST', 'x'), params(leo))).status).toBe(409); // returned
    // parent sees the question, then re-approves, then director acks
    h.viewer = w.as('Maria', 'parent');
    const view = (await (await getCard(leo)).json()).card;
    expect(view.returnedQuestion).toBe('Which peanut brand?');
    expect((await put(w, body(view.items, { approve: true }))).status).toBe(200);
    h.viewer = w.as('Hannah', 'director');
    expect((await ackRoute.POST(req('POST', 'x'), params(leo))).status).toBe(200);
    expect((await getCardForChild(w.churchId, leo))!).toMatchObject({ status: 'acknowledged', returnedQuestionEnc: null });
  });
});

describe('delete and retention', () => {
  it('hard-deletes the card, moment notes and drafts, keeps log rows with a deleted tombstone', async () => {
    const w = await world();
    const leo = w.p('Leo').id;
    await db.update(schema.moments).set({ noteEnc: 'sealed-note' }).where(eq(schema.moments.childId, leo));
    await db.insert(schema.parentNotes).values({ serviceId: w.service.id, childId: leo, lang: 'en', draftEnc: 'sealed', status: 'draft' });
    h.viewer = w.as('Hannah', 'director');
    await getCard(leo); // one logged read
    h.viewer = w.as('Maria', 'parent');
    expect((await cardRoute.DELETE(req('DELETE', 'x'), params(leo))).status).toBe(200);

    expect(await getCardForChild(w.churchId, leo)).toBeUndefined();
    const notes = await db.select().from(schema.moments).where(eq(schema.moments.childId, leo));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((m) => m.noteEnc === null)).toBe(true);
    expect(await db.select().from(schema.parentNotes).where(eq(schema.parentNotes.childId, leo))).toHaveLength(0);
    const log = await listAccessForChild(leo);
    expect(log.map((r) => r.reason)).toEqual(['director', 'deleted']);
    expect(log.every((r) => r.cardId === null)).toBe(true);
    expect((await cardRoute.DELETE(req('DELETE', 'x'), params(leo))).status).toBe(404);
  });

  it('purgeExpiredCards removes cards past retain_until and nothing else', async () => {
    const w = await world();
    const leo = (await getCardForChild(w.churchId, w.p('Leo').id))!;
    const ana = (await getCardForChild(w.churchId, w.p('Ana').id))!;
    await updateCard(leo.id, { retainUntil: new Date(Date.now() - 1000) });
    const n = await purgeExpiredCards(new Date());
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await getCardForChild(w.churchId, w.p('Leo').id)).toBeUndefined();
    expect(await getCardForChild(w.churchId, w.p('Ana').id)).toBeDefined();
    void ana;
  });
});
