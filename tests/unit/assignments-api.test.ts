import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { listAssignments } from '@/db/repo/assignments';
import { getCardForChild, insertCard, updateCard } from '@/db/repo/cards';
import { insertPeople, listPeople, updatePerson } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown, approved: [] as string[] }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));
vi.mock('@/lib/pco/hooks', async (orig) => ({
  ...(await orig<typeof import('@/lib/pco/hooks')>()),
  onAssignmentApproved: async (_c: string, id: string) => { h.approved.push(id); },
}));

import * as listRoute from '@/app/api/assignments/route';
import * as solveRoute from '@/app/api/assignments/solve/route';
import * as approveRoute from '@/app/api/assignments/approve/route';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => { h.viewer = null; h.approved = []; });

async function world() {
  const { churchId } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const services = await listServices(churchId);
  const nine = services.find((s) => s.label === '9:00 service' && s.startsAt.getTime() > Date.now() - 3600_000 && s.startsAt.getTime() < Date.now() + 3600_000)!;
  const eleven = services.find((s) => s.label === '11:00 service' && s.startsAt.getTime() > Date.now())!;
  const director: Viewer = { churchId, personId: p('Hannah').id, role: 'director', sandbox: true };
  return { churchId, p, nine, eleven, director };
}
const post = (route: { POST: (r: Request) => Promise<Response> }, url: string, body: unknown) =>
  route.POST(new Request(`http://x${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
type Solved = {
  assignments: { id: string; childName: string; buddyName: string; reasons: string[]; status: string }[];
  unassigned: { childName: string; hints: string[] }[];
  waitingForReview: { name: string }[];
};
const solved = async (res: Response) => (await res.json()) as Solved;
const by = (r: Solved, child: string) => r.assignments.find((a) => a.childName === child)!;

describe('POST /api/assignments/solve', () => {
  it('needs a director', async () => {
    const w = await world();
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id })).status).toBe(401);
    h.viewer = { ...w.director, personId: w.p('Priya').id, role: 'buddy' };
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id })).status).toBe(403);
  });

  const solve = async (w: Awaited<ReturnType<typeof world>>, service = w.nine, extra: object = {}) => {
    h.viewer = w.director;
    return post(solveRoute, '/api/assignments/solve', { serviceId: service.id, ...extra });
  };
  type Full = Solved & { notExpected: { name: string }[]; newFamily: { name: string; note: string }[] };

  it('solves the Fernbrook 9:00 service: Leo keeps Priya, Ana keeps Marco', async () => {
    const w = await world();
    const res = await solve(w);
    expect(res.status).toBe(200);
    const r = (await res.json()) as Full;
    expect(r.assignments.map((a) => a.childName).sort()).toEqual(['Ana', 'Leo']);
    expect(by(r, 'Leo').buddyName).toBe('Priya');
    expect(by(r, 'Leo').reasons).toEqual(['Same buddy as the last 3 Sundays']);
    expect(by(r, 'Ana').buddyName).toBe('Marco');
    expect(by(r, 'Ana').reasons).toEqual(['Same buddy as the last 3 Sundays', 'Speaks Spanish']);
    expect(r.waitingForReview.map((x) => x.name)).toEqual(['Malik']); // parent-approved only
    expect(r.notExpected.map((x) => x.name)).toEqual(['Ivy']); // comes at 11:00; Theo needs no buddy; Sam has no card
    expect(r.newFamily).toEqual([]);
    expect(r.unassigned).toEqual([]);
    expect(r.assignments.every((a) => a.status === 'proposed')).toBe(true);
  });

  it('11:00: Ivy has a visible gap (Priya is on the worship team, Dana lapsed)', async () => {
    const w = await world();
    const r = (await (await solve(w, w.eleven)).json()) as Full;
    expect(r.assignments).toEqual([]);
    expect(r.unassigned).toHaveLength(1);
    expect(r.unassigned[0].childName).toBe('Ivy');
    expect(r.unassigned[0].hints).toEqual([
      "Ivy needs a buddy with AAC experience at 11:00 — Dana's inclusion training expired 2 Oct",
      'Priya is serving on the worship team at 11:00',
    ]);
    expect(r.notExpected.map((x) => x.name)).toEqual(['Ana', 'Leo']);
    expect(r.waitingForReview).toEqual([]); // Malik's card waits for review, but he comes at 9:00, not 11:00
  });

  it('a card waiting for review shows where the child is expected: a family with no history everywhere, others by hand', async () => {
    const w = await world();
    const [kid] = await insertPeople([{ churchId: w.churchId, role: 'child', firstName: 'Noor', gender: 'f' }]);
    await insertCard({ churchId: w.churchId, childId: kid.id, status: 'parent_approved', lang: 'en', supportLevel: 'parts', itemsEnc: 'x', tags: [] });
    const nine = (await (await solve(w)).json()) as Full;
    const eleven = (await (await solve(w, w.eleven)).json()) as Full;
    expect(nine.waitingForReview.map((x) => x.name).sort()).toEqual(['Malik', 'Noor']);
    expect(eleven.waitingForReview.map((x) => x.name)).toEqual(['Noor']);
    const added = (await (await solve(w, w.eleven, { includeChildIds: [w.p('Malik').id] })).json()) as Full;
    expect(added.waitingForReview.map((x) => x.name).sort()).toEqual(['Malik', 'Noor']);
  });

  it('includeChildIds adds a child who is not expected, and rejects junk', async () => {
    const w = await world();
    const r = (await (await solve(w, w.nine, { includeChildIds: [w.p('Ivy').id] })).json()) as Full;
    expect(r.notExpected).toEqual([]);
    expect(by(r, 'Ivy').buddyName).toBe('Priya'); // the only trained, female, AAC buddy at 9:00
    expect(by(r, 'Ivy').reasons).toEqual(['Same buddy as the last 3 Sundays', 'AAC experience']); // her 11:00 buddy history
    expect(by(r, 'Leo').buddyName).not.toBe('Priya'); // yields to Ivy
    expect((await solve(w, w.nine, { includeChildIds: ['nope'] })).status).toBe(400);
  });

  it('a child with no check-in history is expected everywhere, flagged as a new family', async () => {
    const w = await world();
    const [kid] = await insertPeople([{ churchId: w.churchId, role: 'child', firstName: 'Noor', gender: 'f' }]);
    await insertCard({ churchId: w.churchId, childId: kid.id, status: 'acknowledged', lang: 'en', supportLevel: 'parts', itemsEnc: 'x', tags: [] });
    const r = (await (await solve(w)).json()) as Full;
    expect(r.newFamily).toEqual([{ childId: kid.id, name: 'Noor', note: 'New family — confirm which service' }]);
    expect(by(r, 'Noor').reasons).toContain('New family — confirm which service');
    expect(by(r, 'Leo').buddyName).toBe('Priya');
  });

  it('once Malik is acknowledged he gets a buddy without disturbing Leo or Ana', async () => {
    const w = await world();
    h.viewer = w.director;
    await updateCard((await getCardForChild(w.churchId, w.p('Malik').id))!.id, { status: 'acknowledged' });
    const r = (await (await solve(w)).json()) as Full;
    expect(r.waitingForReview).toEqual([]);
    expect(by(r, 'Leo').buddyName).toBe('Priya');
    expect(by(r, 'Ana').buddyName).toBe('Marco');
    expect(by(r, 'Malik').buddyName).toBe('Grace');
  });

  it('Ana and Malik share a buddy when parts children outnumber free buddies', async () => {
    const w = await world();
    await updateCard((await getCardForChild(w.churchId, w.p('Malik').id))!.id, { status: 'acknowledged' });
    for (const x of (await listPeople(w.churchId)).filter((q) => q.role === 'buddy' && !['Priya', 'Marco'].includes(q.firstName))) {
      await updatePerson(x.id, { backgroundExpiresAt: new Date('2020-01-01') });
    }
    const r = (await (await solve(w)).json()) as Full;
    expect(by(r, 'Ana').buddyName).toBe('Marco');
    expect(by(r, 'Malik').buddyName).toBe('Marco');
    expect(by(r, 'Ana').reasons).toContain('Shares with Malik (both part of the morning)');
    expect(by(r, 'Malik').reasons).toEqual(['Shares with Ana (both part of the morning)']);
  });

  it('re-solving replaces proposed rows and leaves approved ones alone', async () => {
    const w = await world();
    const first = await solved(await solve(w));
    const leoRow = by(first, 'Leo');
    expect((await post(approveRoute, '/api/assignments/approve', { assignmentIds: [leoRow.id] })).status).toBe(200);
    const second = await solved(await solve(w));
    expect(second.assignments.map((a) => a.childName)).toEqual(['Ana']); // Leo is already decided
    const rows = (await listAssignments(w.nine.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === leoRow.id)!.status).toBe('approved');
  });

  it('is tenant-scoped', async () => {
    const a = await world();
    const b = await world();
    h.viewer = a.director;
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: b.nine.id })).status).toBe(404);
    expect((await post(solveRoute, '/api/assignments/solve', { serviceId: 'nope' })).status).toBe(400);
  });
});


describe('POST /api/assignments/approve and GET /api/assignments', () => {
  it('flips proposed to approved, calls the hook, lists with names', async () => {
    const w = await world();
    h.viewer = w.director;
    const r = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: w.nine.id }));
    const ids = r.assignments.map((a) => a.id);
    const res = await post(approveRoute, '/api/assignments/approve', { assignmentIds: ids });
    expect(res.status).toBe(200);
    expect((await res.json()).approved.sort()).toEqual([...ids].sort());
    expect(h.approved.sort()).toEqual([...ids].sort());
    // Idempotent: nothing left to flip, no second hook call.
    h.approved = [];
    expect((await (await post(approveRoute, '/api/assignments/approve', { assignmentIds: ids })).json()).approved).toEqual([]);
    expect(h.approved).toEqual([]);

    const list = await (await listRoute.GET(new Request(`http://x/api/assignments?service=${w.nine.id}`))).json();
    expect(list.assignments).toHaveLength(2);
    expect(list.assignments.every((a: { status: string; childName: string }) => a.status === 'approved' && a.childName)).toBe(true);
  });

  it('404s on another church and on bad input, writes nothing', async () => {
    const a = await world();
    const b = await world();
    h.viewer = b.director;
    const theirs = await solved(await post(solveRoute, '/api/assignments/solve', { serviceId: b.nine.id }));
    const mine = await solved(await (async () => { h.viewer = a.director; return post(solveRoute, '/api/assignments/solve', { serviceId: a.nine.id }); })());
    const res = await post(approveRoute, '/api/assignments/approve', { assignmentIds: [mine.assignments[0].id, theirs.assignments[0].id] });
    expect(res.status).toBe(404);
    expect((await listAssignments(a.nine.id)).filter((x) => x.status === 'approved')).toHaveLength(0);
    expect((await post(approveRoute, '/api/assignments/approve', { assignmentIds: [] })).status).toBe(400);
    expect((await post(approveRoute, '/api/assignments/approve', { assignmentIds: ['x'] })).status).toBe(400);
    h.viewer = a.director;
    expect((await listRoute.GET(new Request(`http://x/api/assignments?service=${b.nine.id}`))).status).toBe(404);
  });
});
