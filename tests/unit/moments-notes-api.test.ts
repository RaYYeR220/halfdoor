import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { insertAssignments } from '@/db/repo/assignments';
import { getCardForChild } from '@/db/repo/cards';
import { getChurch } from '@/db/repo/churches';
import { listMoments, listMomentsForChild } from '@/db/repo/moments';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { openJson } from '@/lib/crypto/atrest';
import type { CardItem } from '@/lib/card/schema';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));

import * as momentsRoute from '@/app/api/moments/route';
import * as notesRoute from '@/app/api/notes/route';
import * as contextRoute from '@/app/api/notes/context/route';
import * as patternsRoute from '@/app/api/patterns/route';
import * as stationRoute from '@/app/api/station/route';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => { h.viewer = null; });

async function world() {
  const { churchId } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const now = Date.now();
  const service = (await listServices(churchId)).find((s) => s.startsAt.getTime() <= now && s.endsAt.getTime() >= now)!;
  await insertAssignments([{ serviceId: service.id, childId: p('Leo').id, buddyId: p('Priya').id, status: 'approved' }]);
  const as = (name: string, role: Viewer['role']): Viewer => ({ churchId, personId: p(name).id, role, sandbox: true });
  const card = (await getCardForChild(churchId, p('Leo').id))!;
  const items = openJson<CardItem[]>((await getChurch(churchId))!.wrappedDek, card.itemsEnc);
  return { churchId, p, service, as, items };
}
type World = Awaited<ReturnType<typeof world>>;

const post = (url: string, body: unknown) =>
  new Request(`http://x${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (url: string) => new Request(`http://x${url}`);
const checkIn = async (w: World, action: 'in' | 'out') => {
  h.viewer = w.as('Maria', 'parent');
  await stationRoute.POST(post('/api/station', { serviceId: w.service.id, childId: w.p('Leo').id, action }));
};
const log = (w: World, extra: Record<string, unknown> = {}) =>
  momentsRoute.POST(post('/api/moments', { serviceId: w.service.id, childId: w.p('Leo').id, stepKey: 'worship', kind: 'hard', ...extra }));

describe('POST /api/moments', () => {
  it('403 until the buddy passes the gate, then logs; 403 again after check-out', async () => {
    const w = await world();
    h.viewer = w.as('Priya', 'buddy');
    expect((await log(w)).status).toBe(403); // not checked in
    await checkIn(w, 'in');
    h.viewer = w.as('Priya', 'buddy');
    const ok = await log(w, { helpedItemIds: [w.items[0].id], note: 'covered his ears' });
    expect(ok.status).toBe(200);
    const { id } = await ok.json();
    const row = (await listMoments(w.service.id)).find((m) => m.id === id)!;
    expect(row.noteEnc).toBeTruthy();
    expect(row.noteEnc).not.toContain('covered');
    expect(row.buddyId).toBe(w.p('Priya').id);
    await checkIn(w, 'out');
    h.viewer = w.as('Priya', 'buddy');
    expect((await log(w)).status).toBe(403);
  });
  it('unassigned buddy, wrong role, anonymous', async () => {
    const w = await world();
    await checkIn(w, 'in');
    h.viewer = w.as('Marco', 'buddy');
    expect((await log(w)).status).toBe(403);
    h.viewer = w.as('Hannah', 'director');
    expect((await log(w)).status).toBe(403);
    h.viewer = null;
    expect((await log(w)).status).toBe(401);
  });
  it('validates step, helped items, kind and note length', async () => {
    const w = await world();
    await checkIn(w, 'in');
    h.viewer = w.as('Priya', 'buddy');
    expect((await log(w, { stepKey: 'nonsense' })).status).toBe(400);
    expect((await log(w, { stepKey: 'other' })).status).toBe(200);
    expect((await log(w, { stepKey: 'story', kind: 'good' })).status).toBe(200);
    expect((await log(w, { helpedItemIds: ['i999'] })).status).toBe(400);
    expect((await log(w, { kind: 'angry' })).status).toBe(400);
    expect((await log(w, { note: 'x'.repeat(281) })).status).toBe(400);
  });
  it("kind 'note' needs text", async () => {
    const w = await world();
    await checkIn(w, 'in');
    h.viewer = w.as('Priya', 'buddy');
    expect((await log(w, { kind: 'note' })).status).toBe(400);
    expect((await log(w, { kind: 'note', note: '   ' })).status).toBe(400);
    expect((await log(w, { kind: 'note', note: 'said grace' })).status).toBe(200);
  });
  it('tenant isolation: a buddy of another church cannot log here', async () => {
    const w = await world();
    const other = await world();
    await checkIn(w, 'in');
    h.viewer = other.as('Priya', 'buddy');
    expect((await log(w)).status).toBe(404);
  });
});

describe('notes: context, save, approve, read', () => {
  async function withMoments() {
    const w = await world();
    await checkIn(w, 'in');
    h.viewer = w.as('Priya', 'buddy');
    const a = await (await log(w, { helpedItemIds: [w.items[2].id], note: 'ears' })).json();
    const b = await (await log(w, { stepKey: 'craft', kind: 'good' })).json();
    return { w, a: a.id as string, b: b.id as string };
  }
  const ctx = (w: World) => contextRoute.GET(get(`/api/notes/context?service=${w.service.id}&child=${w.p('Leo').id}`));
  const save = (w: World, sentences: unknown, approve: boolean) =>
    notesRoute.POST(post('/api/notes', { serviceId: w.service.id, childId: w.p('Leo').id, sentences, approve }));
  const read = (w: World) => notesRoute.GET(get(`/api/notes?child=${w.p('Leo').id}`));

  it('context is director-only and returns only helped item texts', async () => {
    const { w, a } = await withMoments();
    h.viewer = w.as('Priya', 'buddy');
    expect((await ctx(w)).status).toBe(403);
    h.viewer = w.as('Hannah', 'director');
    const body = await (await ctx(w)).json();
    expect(body.childFirstName).toBe('Leo');
    expect(body.moments).toHaveLength(2);
    const m = body.moments.find((x: { id: string }) => x.id === a);
    expect(m).toMatchObject({ step: 'Worship', kind: 'hard', note: 'ears', helped: [w.items[2].text] });
    expect(JSON.stringify(body)).not.toContain(w.items[0].text);
  });
  it('rejects evidence from another child or service; director sees drafts, parent only approved', async () => {
    const { w, a, b } = await withMoments();
    h.viewer = w.as('Hannah', 'director');
    expect((await save(w, [{ text: 'x', evidence: ['00000000-0000-4000-8000-000000000000'] }], false)).status).toBe(400);
    // Leo's own moment at a past service is not evidence for this service's note
    const pastLeo = await listMomentsForChild(w.p('Leo').id);
    const foreign = pastLeo.find((m) => m.serviceId !== w.service.id)!; // Leo's moment at a past service
    expect((await save(w, [{ text: 'x', evidence: [foreign.id] }], false)).status).toBe(400);

    const sentences = [{ text: 'He had a meltdown in worship.', evidence: [a] }, { text: 'Craft went well.', evidence: [a, b] }];
    const draft = await save(w, sentences, false);
    expect(draft.status).toBe(200);
    expect((await draft.json()).flags).toEqual([['meltdown'], []]);

    h.viewer = w.as('Maria', 'parent');
    expect((await (await read(w)).json()).notes).toEqual([]);
    h.viewer = w.as('Hannah', 'director');
    const dir = (await (await read(w)).json()).notes;
    expect(dir).toHaveLength(1);
    expect(dir[0]).toMatchObject({ status: 'draft', approvedAt: null });
    expect(dir[0].sentences[0].evidence).toEqual([a]);

    // flagged sentences need an explicit acknowledgement; nothing is written on 409
    const refused = await save(w, sentences, true);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'flags_need_review', flags: [['meltdown'], []] });
    h.viewer = w.as('Maria', 'parent');
    expect((await (await read(w)).json()).notes).toEqual([]);
    h.viewer = w.as('Hannah', 'director');
    expect((await notesRoute.POST(post('/api/notes', { serviceId: w.service.id, childId: w.p('Leo').id, sentences, approve: true, acknowledgeFlags: true }))).status).toBe(200);
    h.viewer = w.as('Maria', 'parent');
    const par = (await (await read(w)).json()).notes;
    expect(par).toHaveLength(1);
    expect(par[0]).toMatchObject({ status: 'approved', sentences: [{ text: sentences[0].text }, { text: sentences[1].text }] });
    expect(par[0].sentences[0].evidence).toBeUndefined();
    expect(par[0].approvedAt).toBeTruthy();
  });
  it('two concurrent saves leave one row', async () => {
    const { w, a, b } = await withMoments();
    h.viewer = w.as('Hannah', 'director');
    const rs = await Promise.all([save(w, [{ text: 'One.', evidence: [a] }], false), save(w, [{ text: 'Two.', evidence: [b] }], true)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect((await rs[0].json()).id).toBe((await rs[1].json()).id);
    expect((await (await read(w)).json()).notes).toHaveLength(1);
  });
  it('other children names in a buddy note are scrubbed from the context', async () => {
    const w = await world();
    await checkIn(w, 'in');
    h.viewer = w.as('Priya', 'buddy');
    expect((await log(w, { note: "He hid with Ana and ana's sister while Malik cried" })).status).toBe(200);
    h.viewer = w.as('Hannah', 'director');
    const body = await (await ctx(w)).json();
    expect(body.moments[0].note).toBe("He hid with another child and another child's sister while another child cried");
  });
  it('other parents, buddies and other churches get nothing', async () => {
    const { w } = await withMoments();
    h.viewer = w.as('Jordan', 'parent');
    expect((await read(w)).status).toBe(403);
    h.viewer = w.as('Priya', 'buddy');
    expect((await read(w)).status).toBe(403);
    expect((await save(w, [{ text: 'x', evidence: ['a'] }], false)).status).toBe(403);
    const other = await world();
    h.viewer = other.as('Hannah', 'director');
    expect((await read(w)).status).toBe(404);
    expect((await ctx(w)).status).toBe(404);
  });
});

describe('GET /api/patterns', () => {
  it('Leo: hard at worship in 4 of the 5 past services', async () => {
    const w = await world();
    h.viewer = w.as('Hannah', 'director');
    const body = await (await patternsRoute.GET(get(`/api/patterns?child=${w.p('Leo').id}`))).json();
    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0]).toMatchObject({ segment: 'worship', kind: 'hard', count: 4, outOf: 5 });
    h.viewer = w.as('Priya', 'buddy');
    expect((await patternsRoute.GET(get(`/api/patterns?child=${w.p('Leo').id}`))).status).toBe(403);
    h.viewer = (await world()).as('Hannah', 'director');
    expect((await patternsRoute.GET(get(`/api/patterns?child=${w.p('Leo').id}`))).status).toBe(404);
  });
});
