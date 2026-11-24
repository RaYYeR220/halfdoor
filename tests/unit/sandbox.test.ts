import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, setDbForTests, type Db } from '@/db/client';
import * as schema from '@/db/schema';
import { PURGE_BATCH, createSandbox, purgeExpiredSandboxes } from '@/db/sandbox';
import { CARDS } from '@/db/seed/fernbrook';
import { listCards } from '@/db/repo/cards';
import { getChurch, getChurchBySlug } from '@/db/repo/churches';
import { listPeople, listHouseholdLinks } from '@/db/repo/people';
import { listServices } from '@/db/repo/services';
import { listAssignments } from '@/db/repo/assignments';
import { listMomentsForChild } from '@/db/repo/moments';
import { listLessons } from '@/db/repo/lessons';
import { openJson, SealError } from '@/lib/crypto/atrest';
import type { CardItem } from '@/lib/card/schema';

beforeAll(async () => {
  process.env.MASTER_KEY = randomBytes(32).toString('base64');
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  setDbForTests(db as unknown as Db);
});

/** A child's card, unscoped (test-only: the app reads cards through the church-scoped getCardForChild). */
async function getCard(childId: string) {
  const [row] = await getDb().select().from(schema.cards).where(eq(schema.cards.childId, childId));
  return row;
}

async function leoOf(churchId: string) {
  const people = await listPeople(churchId);
  return people.find((p) => p.firstName === 'Leo')!;
}

describe('createSandbox', () => {
  it('copies the fixture with sealed cards', async () => {
    const { churchId, slug } = await createSandbox();
    expect((await getChurchBySlug(slug))?.id).toBe(churchId);
    const people = await listPeople(churchId);
    expect(people).toHaveLength(19);
    const count = (role: string) => people.filter((p) => p.role === role).length;
    expect([count('child'), count('buddy'), count('director'), count('parent')]).toEqual([6, 9, 1, 3]);

    const church = (await getChurch(churchId))!;
    expect(church.mode).toBe('sandbox');
    const ttl = church.expiresAt!.getTime() - church.createdAt.getTime();
    expect(Math.abs(ttl - 24 * 3600_000)).toBeLessThan(60_000);

    const leo = await leoOf(churchId);
    const card = (await getCard(leo.id))!;
    expect(card.itemsEnc).not.toContain('peanut');
    expect(() => JSON.parse(card.itemsEnc)).toThrow();
    const items = openJson<CardItem[]>(church.wrappedDek, card.itemsEnc);
    expect(items.length).toBeGreaterThanOrEqual(5);
    const safety = items.filter((i) => i.section === 'safety').map((i) => i.text);
    expect(safety).toContain('He IS allergic to peanuts - he has an EpiPen in his backpack.');
    expect(safety).toContain('His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.');
    expect(card.status).toBe('acknowledged');
    expect(card.supportLevel).toBe('all_morning');
    expect(card.tags).toEqual(expect.arrayContaining(['noise_sensitive', 'food_allergy', 'pickup_restriction']));
  });

  it('seals five cards, none for Sam, Malik awaits acknowledgement, and no story is stored', async () => {
    const { churchId } = await createSandbox();
    const church = (await getChurch(churchId))!;
    const people = await listPeople(churchId);
    const cards = await listCards(churchId);
    expect(cards).toHaveLength(5);
    const sam = people.find((p) => p.firstName === 'Sam')!;
    expect(await getCard(sam.id)).toBeUndefined();
    const malik = people.find((p) => p.firstName === 'Malik')!;
    expect((await getCard(malik.id))!.status).toBe('parent_approved');
    const ana = people.find((p) => p.firstName === 'Ana')!;
    expect((await getCard(ana.id))!.lang).toBe('es');
    for (const c of cards) {
      const items = openJson<CardItem[]>(church.wrappedDek, c.itemsEnc);
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.every((i) => i.quotes.length > 0)).toBe(true);
      expect(JSON.stringify(c)).not.toContain('Leo is 7');
    }
    for (const seed of Object.values(CARDS)) expect(JSON.stringify(cards)).not.toContain(seed.story);
    const links = await listHouseholdLinks(people.filter((p) => p.role === 'child').map((p) => p.id));
    expect(links).toHaveLength(3);
  });

  it('anchors services to creation time and seeds history for the patterns feature', async () => {
    const before = Date.now();
    const { churchId } = await createSandbox();
    const church = (await getChurch(churchId))!;
    const services = await listServices(churchId);
    expect(services).toHaveLength(12); // 2 today + 5 past 9:00 + 5 past 11:00
    const T = church.createdAt.getTime();
    const upcoming = services.filter((s) => s.startsAt.getTime() > T - 6 * 60_000);
    expect(upcoming.map((s) => s.label)).toEqual(['9:00 service', '11:00 service']);
    expect(upcoming.every((s) => s.room === 'Kids Room B')).toBe(true);
    expect(upcoming[0].startsAt.getTime() - T).toBe(-5 * 60_000);
    expect(upcoming[0].endsAt.getTime() - T).toBe(70 * 60_000);
    expect(upcoming[1].startsAt.getTime() - T).toBe(115 * 60_000);
    expect(upcoming[1].endsAt.getTime() - T).toBe(190 * 60_000);
    expect(T).toBeGreaterThanOrEqual(before - 1000);

    const pastAll = services.filter((s) => s.startsAt.getTime() < T - 6 * 60_000);
    expect(pastAll).toHaveLength(10);
    const past = pastAll.filter((s) => s.label === '9:00 service');
    expect(past).toHaveLength(5);

    const leo = await leoOf(churchId);
    const moments = await listMomentsForChild(leo.id);
    expect(moments.filter((m) => m.kind === 'hard' && m.stepKey === 'worship')).toHaveLength(4);
    expect(moments.some((m) => m.kind === 'good')).toBe(true);

    const people = await listPeople(churchId);
    const priya = people.find((p) => p.firstName === 'Priya')!;
    const marco = people.find((p) => p.firstName === 'Marco')!;
    const ana = people.find((p) => p.firstName === 'Ana')!;
    for (const s of past) {
      const a = await listAssignments(s.id);
      expect(a.every((x) => x.status === 'approved')).toBe(true);
      expect(a.find((x) => x.childId === leo.id)?.buddyId).toBe(priya.id);
      expect(a.find((x) => x.childId === ana.id)?.buddyId).toBe(marco.id);
    }

    const lessons = await listLessons(churchId); // ordered by date: last week's, then this week's
    expect(lessons).toHaveLength(2);
    const lesson = lessons[1];
    expect(lesson.title).toBe('Waiting with hope');
    expect(lesson.verseRef).toBe('Isaiah 9:6');
    expect(lesson.verseText).toContain('Wonderful Counselor');
    expect(lesson.bigIdeaQuote && lesson.sourceText.includes(lesson.bigIdeaQuote)).toBe(true);
    expect((lesson.steps as { key: string; sensoryLoad: string }[]).find((s) => s.key === 'worship')?.sensoryLoad).toBe('high');
    const linked = (await listServices(churchId)).map((s) => s.lessonId);
    expect(linked.every((id) => id !== null)).toBe(true);
    expect(new Set(linked).size).toBe(2);
  });

  it('has the expired and skilled buddies the director demo needs', async () => {
    const { churchId } = await createSandbox();
    const people = await listPeople(churchId);
    const by = (n: string) => people.find((p) => p.firstName === n)!;
    expect(by('Dana').inclusionTrainingAt!.toISOString()).toBe('2025-10-02T00:00:00.000Z');
    expect(by('Ben').backgroundExpiresAt!.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(by('Priya').skills).toEqual(['aac']);
    expect(by('Marco').langs).toEqual(['en', 'es']);
    expect(by('Ruth').skills).toEqual(['medical']);
    expect(by('Grace').inclusionTrainingAt!.getTime()).toBeGreaterThan(Date.now() - 183 * 86400_000);
  });

  it('gives each sandbox its own key: one cannot open the other\'s card', async () => {
    const a = await createSandbox();
    const b = await createSandbox();
    const [ca, cb] = [(await getChurch(a.churchId))!, (await getChurch(b.churchId))!];
    expect(ca.wrappedDek).not.toBe(cb.wrappedDek);
    const cardA = (await getCard((await leoOf(a.churchId)).id))!;
    expect(() => openJson(cb.wrappedDek, cardA.itemsEnc)).toThrow(SealError);
  });
});

describe('purgeExpiredSandboxes', () => {
  it('removes expired sandboxes with everything under them and keeps live ones', async () => {
    const old = await createSandbox();
    const keep = await createSandbox();
    const db = (await import('@/db/client')).getDb();
    const { eq } = await import('drizzle-orm');
    await db.update(schema.churches).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.churches.id, old.churchId));
    const n = await purgeExpiredSandboxes();
    expect(n).toBe(1);
    expect(await getChurch(old.churchId)).toBeUndefined();
    expect(await listPeople(old.churchId)).toHaveLength(0);
    expect(await listCards(old.churchId)).toHaveLength(0);
    expect(await getChurch(keep.churchId)).toBeDefined();
  });
  it('deletes at most a batch per call, oldest expiry first', async () => {
    const db = (await import('@/db/client')).getDb();
    const { eq, and, lt } = await import('drizzle-orm');
    await purgeExpiredSandboxes(); // start from no backlog
    const made = [await createSandbox(), await createSandbox(), await createSandbox()];
    for (const [i, m] of made.entries()) {
      await db.update(schema.churches).set({ expiresAt: new Date(Date.now() - (10 - i) * 1000) }).where(eq(schema.churches.id, m.churchId));
    }
    expect(PURGE_BATCH).toBe(25);
    expect(await purgeExpiredSandboxes(new Date(), 2)).toBe(2);
    expect(await getChurch(made[0].churchId)).toBeUndefined(); // the two that expired first
    expect(await getChurch(made[1].churchId)).toBeUndefined();
    expect(await getChurch(made[2].churchId)).toBeDefined();
    expect(await purgeExpiredSandboxes(new Date(), 2)).toBe(1);
    const left = await db.select().from(schema.churches).where(and(eq(schema.churches.mode, 'sandbox'), lt(schema.churches.expiresAt, new Date())));
    expect(left).toHaveLength(0);
  });
});
