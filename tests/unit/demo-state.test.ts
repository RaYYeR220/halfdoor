import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { createSandbox } from '@/db/sandbox';
import { insertAccess } from '@/db/repo/access';
import { approveProposed, insertAssignments, listAssignmentsForChild } from '@/db/repo/assignments';
import { getCardForChild, insertCard, updateCard } from '@/db/repo/cards';
import { insertNote, updateNote } from '@/db/repo/notes';
import { listPeople } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { stationAction } from '@/lib/checkins/station';
import { buildPersonas } from '@/lib/demo/personas';
import { DEMO_STEP_FLAGS, readDemoState } from '@/lib/demo/state';
import type { Viewer } from '@/lib/auth/viewer';

const h = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/lib/auth/viewer', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/viewer')>()), getViewer: async () => h.viewer }));

import { GET } from '@/app/api/demo/state/route';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  process.env.LINK_SECRET = randomBytes(32).toString('base64url');
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});
beforeEach(() => { h.viewer = null; });

async function world() {
  const { churchId, slug } = await createSandbox();
  const people = await listPeople(churchId);
  const p = (name: string) => people.find((x) => x.firstName === name)!;
  const services = await listServices(churchId);
  const now = Date.now();
  const nine = services.find((s) => s.startsAt.getTime() <= now && s.endsAt.getTime() >= now)!;
  const pastNine = services.find((s) => s.label === nine.label && s.startsAt.getTime() < now - 6 * 24 * 3600_000)!;
  const as = (name: string, role: Viewer['role'], sandbox = true): Viewer => ({ churchId, personId: p(name).id, role, sandbox });
  return { churchId, slug, people, p, nine, pastNine, as };
}

const flagsOf = (s: Awaited<ReturnType<typeof readDemoState>>) => DEMO_STEP_FLAGS.filter((k) => s[k]);

describe('readDemoState', () => {
  it('a fresh sandbox has no step done', async () => {
    const w = await world();
    expect(await readDemoState(w.churchId)).toEqual({
      samCardApproved: false, samCardAcknowledged: false, samAssignedApproved: false, samCheckedIn: false,
      samCardOpenedByBuddy: false, samCheckedOut: false, samNoteApproved: false, samBuddyId: null, samBuddyName: null,
    });
  });

  it('walks the seven steps of Sam\'s Sunday in order', async () => {
    const w = await world();
    const sam = w.p('Sam').id;

    // 1: a draft is not approved; a returned card is not approved; parent_approved is.
    const card = await insertCard({ churchId: w.churchId, childId: sam, status: 'draft', lang: 'en', itemsEnc: 'sealed' });
    expect(flagsOf(await readDemoState(w.churchId))).toEqual([]);
    await updateCard(card.id, { status: 'returned' });
    expect(flagsOf(await readDemoState(w.churchId))).toEqual([]);
    await updateCard(card.id, { status: 'parent_approved', parentApprovedAt: new Date() });
    expect(flagsOf(await readDemoState(w.churchId))).toEqual(['samCardApproved']);

    // 2
    await updateCard(card.id, { status: 'acknowledged', directorAckAt: new Date() });
    expect((await getCardForChild(w.churchId, sam))?.status).toBe('acknowledged');
    expect(flagsOf(await readDemoState(w.churchId))).toEqual(['samCardApproved', 'samCardAcknowledged']);

    // 3: a proposal is not enough; an approved match today is, and names the buddy.
    await insertAssignments([{ serviceId: w.nine.id, childId: sam, buddyId: w.p('Grace').id, status: 'proposed' }]);
    let s = await readDemoState(w.churchId);
    expect(s.samAssignedApproved).toBe(false);
    expect(s.samBuddyId).toBeNull();
    await approveProposed((await listAssignmentsForChild(sam)).map((a) => a.id));
    s = await readDemoState(w.churchId);
    expect(s.samAssignedApproved).toBe(true);
    expect(s.samBuddyId).toBe(w.p('Grace').id);
    expect(s.samBuddyName).toBe('Grace');

    // 4
    expect((await stationAction(w.churchId, w.nine.id, sam, 'in', new Date())).ok).toBe(true);
    expect(flagsOf(await readDemoState(w.churchId))).toEqual(DEMO_STEP_FLAGS.slice(0, 4));

    // 5: only a buddy's checked-in opening counts (the director reading the card does not).
    await insertAccess({ cardId: card.id, childId: sam, viewerId: w.p('Hannah').id, role: 'director', reason: 'director' });
    expect((await readDemoState(w.churchId)).samCardOpenedByBuddy).toBe(false);
    await insertAccess({ cardId: card.id, childId: sam, serviceId: w.nine.id, viewerId: w.p('Grace').id, role: 'buddy', reason: 'checked_in' });
    expect(flagsOf(await readDemoState(w.churchId))).toEqual(DEMO_STEP_FLAGS.slice(0, 5));

    // 6: checking out keeps step 4 done.
    expect((await stationAction(w.churchId, w.nine.id, sam, 'out', new Date())).ok).toBe(true);
    expect(flagsOf(await readDemoState(w.churchId))).toEqual(DEMO_STEP_FLAGS.slice(0, 6));

    // 7: a draft note does not count; an approved one does.
    const note = await insertNote({ serviceId: w.nine.id, childId: sam, lang: 'en', draftEnc: 'sealed', status: 'draft' });
    expect((await readDemoState(w.churchId)).samNoteApproved).toBe(false);
    await updateNote(note.id, { status: 'approved', approvedAt: new Date() });
    expect(flagsOf(await readDemoState(w.churchId))).toEqual(DEMO_STEP_FLAGS);
  });

  it('past Sundays do not count as today', async () => {
    const w = await world();
    const sam = w.p('Sam').id;
    await insertAssignments([{ serviceId: w.pastNine.id, childId: sam, buddyId: w.p('Priya').id, status: 'approved' }]);
    expect((await readDemoState(w.churchId)).samAssignedApproved).toBe(false);
  });

  it('progress in one sandbox does not show in another', async () => {
    const a = await world();
    const b = await world();
    await insertCard({ churchId: a.churchId, childId: a.p('Sam').id, status: 'parent_approved', lang: 'en', itemsEnc: 'sealed' });
    expect((await readDemoState(a.churchId)).samCardApproved).toBe(true);
    expect((await readDemoState(b.churchId)).samCardApproved).toBe(false);
  });
});

describe('GET /api/demo/state', () => {
  it('401 without a viewer, 403 outside a sandbox, flags for a sandbox persona', async () => {
    const w = await world();
    expect((await GET()).status).toBe(401);
    h.viewer = w.as('Hannah', 'director', false);
    expect((await GET()).status).toBe(403);
    h.viewer = w.as('Jordan', 'parent');
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toMatchObject({ samCardApproved: false, samBuddyId: null });
  });
});

describe('personas', () => {
  it('maps the eight role-bar personas to people and their home pages', async () => {
    const w = await world();
    const ps = buildPersonas(w.slug, w.people);
    expect(ps.map((x) => x.key)).toEqual(['hannah', 'jordan', 'maria', 'lucia', 'priya', 'marco', 'grace', 'tom']);
    const by = Object.fromEntries(ps.map((x) => [x.key, x]));
    expect(by.hannah.href).toBe(`/c/${w.slug}/desk`);
    expect(by.jordan.href).toBe(`/c/${w.slug}/parent/${w.p('Jordan').id}`);
    expect(by.grace.href).toBe(`/c/${w.slug}/buddy/${w.p('Grace').id}`);
    expect(by.tom).toMatchObject({ href: `/c/${w.slug}/room`, value: `${w.p('Tom').id}:leader` });
    expect(by.lucia.name).toBe('Lucía');
  });
});
