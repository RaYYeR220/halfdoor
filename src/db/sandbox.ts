import { randomBytes } from 'node:crypto';
import { verifyCard } from '@/lib/card/verify';
import { newWrappedDek, sealJson } from '@/lib/crypto/atrest';
import { deleteChurch, insertChurch, insertSandboxChurchLimited, listExpiredSandboxes } from './repo/churches';
import { insertAssignments } from './repo/assignments';
import { insertBlockouts } from './repo/blockouts';
import { insertCard } from './repo/cards';
import { insertCheckins, type NewCheckin } from './repo/checkins';
import { insertLesson } from './repo/lessons';
import { insertMoments, type NewMoment } from './repo/moments';
import { insertHouseholdLinks, insertPeople, type NewPerson } from './repo/people';
import { insertServices } from './repo/services';
import {
  CARDS, FERNBROOK_NAME, FERNBROOK_TZ, HOUSEHOLDS, LESSON, PEOPLE, SERVICE_ROOM,
} from './seed/fernbrook';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const SANDBOX_TTL = DAY;
const RETENTION = 365 * DAY;
const PAST_WEEKS = 5;

/** Copy the Fernbrook fixture into a fresh church with its own DEK. Times are relative to now. */
export async function createSandbox(opts: { creatorHash?: string } = {}): Promise<{ churchId: string; slug: string }> {
  return (await build((values) => insertChurch({ ...values, creatorHash: opts.creatorHash ?? null })))!;
}

export const DEMO_LIMITS = { perHash: 5, perHashWindowMs: 3600_000, perDay: 300 } as const;

/** Rate-limited creation: the counts and the church insert happen under one lock. Null = over the limit. */
export async function createSandboxReserved(
  creatorHash: string,
  now: Date = new Date(),
): Promise<{ churchId: string; slug: string } | null> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return build((values) =>
    insertSandboxChurchLimited(values, {
      creatorHash,
      perHash: DEMO_LIMITS.perHash,
      hashSince: new Date(now.getTime() - DEMO_LIMITS.perHashWindowMs),
      perDay: DEMO_LIMITS.perDay,
      daySince: dayStart,
    }),
  );
}

async function build(
  insert: (values: Parameters<typeof insertChurch>[0]) => Promise<Awaited<ReturnType<typeof insertChurch>> | null>,
): Promise<{ churchId: string; slug: string } | null> {
  const T = Date.now();
  const at = (offsetMs: number) => new Date(T + offsetMs);
  const wrappedDek = newWrappedDek();
  const slug = `fernbrook-${randomBytes(5).toString('hex')}`;

  const church = await insert({
    name: FERNBROOK_NAME, slug, tz: FERNBROOK_TZ, mode: 'sandbox', wrappedDek,
    createdAt: at(0), expiresAt: at(SANDBOX_TTL),
  });
  if (!church) return null;
  try {
    await seed(church.id, wrappedDek, T);
  } catch (err) {
    await deleteChurch(church.id);
    throw err;
  }
  return { churchId: church.id, slug };
}

async function seed(churchId: string, wrappedDek: string, T: number): Promise<void> {
  const at = (offsetMs: number) => new Date(T + offsetMs);

  const rows: NewPerson[] = PEOPLE.map((p) => ({
    churchId,
    role: p.role,
    firstName: p.firstName,
    lang: p.lang ?? 'en',
    gender: p.gender ?? null,
    grade: p.grade ?? null,
    skills: p.skills ?? [],
    langs: p.langs ?? [p.lang ?? 'en'],
    inclusionTrainingAt: p.trainingAt ? new Date(p.trainingAt) : p.trainingDaysAgo ? at(-p.trainingDaysAgo * DAY) : null,
    backgroundExpiresAt: p.backgroundExpiresAt ? new Date(p.backgroundExpiresAt) : null,
  }));
  const inserted = await insertPeople(rows);
  const id = Object.fromEntries(PEOPLE.map((p, i) => [p.key, inserted[i].id])) as Record<string, string>;

  await insertHouseholdLinks(HOUSEHOLDS.map(([parent, child]) => ({ parentId: id[parent], childId: id[child] })));

  const leoItemIds: string[] = [];
  for (const [key, seedCard] of Object.entries(CARDS)) {
    const verified = verifyCard(seedCard.story, seedCard.draft);
    if (key === 'leo') leoItemIds.push(...verified.items.map((i) => i.id));
    const approved = seedCard.status === 'acknowledged' ? at(-2 * DAY) : at(-DAY);
    await insertCard({
      churchId,
      childId: id[key],
      status: seedCard.status,
      lang: verified.lang === 'other' ? 'en' : verified.lang,
      supportLevel: seedCard.supportLevel,
      itemsEnc: sealJson(wrappedDek, verified.items),
      tags: verified.tags,
      parentApprovedAt: approved,
      directorAckAt: seedCard.status === 'acknowledged' ? at(-DAY) : null,
      retainUntil: at(RETENTION),
    });
  }

  const [nine, eleven] = await insertServices([
    { churchId, label: '9:00 service', startsAt: at(-5 * MIN), endsAt: at(70 * MIN), room: SERVICE_ROOM },
    { churchId, label: '11:00 service', startsAt: at(115 * MIN), endsAt: at(190 * MIN), room: SERVICE_ROOM },
  ]);
  void nine;
  // Planning Center Services blockout: Priya plays on the worship team during the 11:00.
  await insertBlockouts([{
    churchId, personId: id.priya, startsAt: eleven.startsAt, endsAt: eleven.endsAt, reason: 'Serving on the worship team',
  }]);

  const pastServices = await insertServices(
    Array.from({ length: PAST_WEEKS }, (_, k) => {
      const start = -5 * MIN - (k + 1) * 7 * DAY;
      return { churchId, label: '9:00 service', startsAt: at(start), endsAt: at(start + 75 * MIN), room: SERVICE_ROOM };
    }),
  );

  const pastElevens = await insertServices(
    Array.from({ length: PAST_WEEKS }, (_, k) => {
      const start = 115 * MIN - (k + 1) * 7 * DAY;
      return { churchId, label: '11:00 service', startsAt: at(start), endsAt: at(start + 75 * MIN), room: SERVICE_ROOM };
    }),
  );

  // Past attendance (checked in, checked out): who is expected at which service this Sunday.
  const attended = (s: { id: string; startsAt: Date; endsAt: Date }, childId: string): NewCheckin => ({
    serviceId: s.id, childId, source: 'demo_station',
    checkedInAt: new Date(s.startsAt.getTime() + 3 * MIN), checkedOutAt: s.endsAt,
  });
  await insertCheckins([
    ...pastServices.flatMap((s) => [id.leo, id.ana, id.malik, id.theo].map((c) => attended(s, c))),
    ...pastElevens.map((s) => attended(s, id.ivy)),
  ]);

  await insertAssignments([
    // Ivy's 11:00 buddy: Priya on the 3 most recent Sundays, Dana before that.
    ...pastElevens.map((s, k) => ({ serviceId: s.id, childId: id.ivy, buddyId: k < 3 ? id.priya : id.dana, status: 'approved' as const })),
    ...pastServices.flatMap((s) => [
      { serviceId: s.id, childId: id.leo, buddyId: id.priya, status: 'approved' as const },
      { serviceId: s.id, childId: id.ana, buddyId: id.marco, status: 'approved' as const },
    ]),
  ]);

  // Leo: hard at worship in 4 of 5 past Sundays; the fifth goes well with the headphones.
  const headphones = leoItemIds[2] ? [leoItemIds[2]] : [];
  const moments: NewMoment[] = pastServices.flatMap((s, k): NewMoment[] => {
    const base = { serviceId: s.id, childId: id.leo, buddyId: id.priya };
    const worshipAt = new Date(s.startsAt.getTime() + 10 * MIN);
    const out: NewMoment[] = k < 4
      ? [{ ...base, stepKey: 'worship', kind: 'hard', at: worshipAt }]
      : [{ ...base, stepKey: 'worship', kind: 'good', helpedItemIds: headphones, at: worshipAt }];
    if (k % 2 === 0) out.push({ ...base, stepKey: 'craft', kind: 'good', at: new Date(s.startsAt.getTime() + 50 * MIN) });
    return out;
  });
  await insertMoments(moments);

  await insertLesson({
    churchId,
    serviceDate: at(115 * MIN),
    sourceText: LESSON.sourceText,
    title: LESSON.title,
    bigIdeaQuote: LESSON.bigIdea,
    verseRef: LESSON.verseRef,
    verseText: null,
    steps: LESSON.steps,
  });
}

/** Deletes expired sandboxes (everything under them cascades). Returns how many went. */
export async function purgeExpiredSandboxes(now: Date = new Date()): Promise<number> {
  const expired = await listExpiredSandboxes(now);
  for (const c of expired) await deleteChurch(c.id);
  return expired.length;
}
