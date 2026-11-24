// SERVER-ONLY. What the director desk's pages and read routes show, read tenant-scoped and one query at a time
// (the pooler's server pool is small). Card content is never read here: only status, tags, levels and names.
import { listAiCalls } from '@/db/repo/aiCalls';
import { listAssignments, listAssignmentsInChurch } from '@/db/repo/assignments';
import { listCards } from '@/db/repo/cards';
import { listCheckinsInChurch } from '@/db/repo/checkins';
import type { Church } from '@/db/repo/churches';
import { listLessons } from '@/db/repo/lessons';
import { listMoments } from '@/db/repo/moments';
import { listNotes } from '@/db/repo/notes';
import { listHouseholdLinks, listPeople, type Person } from '@/db/repo/people';
import { listServices, type Service } from '@/db/repo/services';
import { demoClockShift } from '@/lib/demo/clock';
import { ATTENDANCE_WINDOW } from '@/lib/solver/inputs';
import { startOfZonedDay } from '@/lib/time/zoned';
import { CAPS } from '@/lib/venice/prices';
import { ledgerTotals, toLedgerAttestation } from './helpers';
import type {
  AssignmentRow, CardStatus, ChildRow, DeskClock, DeskService, Ledger, LedgerRow, NoteChild, NotesService, PackChild, SupportLevel,
} from './types';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** A sandbox's "today": its two services start 5 min before and 115 min after it was made; past Sundays are whole weeks back. */
const SANDBOX_TODAY = 36 * HOUR;

/**
 * The services the desk plans for. A sandbox: its two services around now. A real church: the first day, from
 * today on (church time zone), that has services, up to a week ahead ("this Sunday" seen from a Wednesday).
 */
export function upcomingServices(church: Pick<Church, 'mode' | 'tz'>, services: readonly Service[], now: Date): Service[] {
  const sorted = [...services].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (church.mode === 'sandbox') return sorted.filter((s) => Math.abs(s.startsAt.getTime() - now.getTime()) <= SANDBOX_TODAY);
  const from = startOfZonedDay(now, church.tz).getTime();
  const first = sorted.find((s) => s.endsAt.getTime() >= now.getTime() && s.startsAt.getTime() >= from && s.startsAt.getTime() < from + 8 * DAY);
  if (!first) return [];
  const day = startOfZonedDay(first.startsAt, church.tz).getTime();
  return sorted.filter((s) => s.startsAt.getTime() >= day && s.startsAt.getTime() < day + DAY);
}

export function clockOf(church: Pick<Church, 'mode' | 'tz'>, services: readonly Service[], now: Date): DeskClock {
  return { tz: church.tz, now: now.toISOString(), shiftMs: church.mode === 'sandbox' ? demoClockShift(services, now, church.tz) : 0 };
}

export function toDeskService(s: Service, lessonTitle: string | null = null): DeskService {
  return {
    id: s.id, label: s.label, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), room: s.room, lessonId: s.lessonId, lessonTitle,
  };
}

/** Just the desk clock (one read). */
export async function loadClock(church: Church, now: Date): Promise<DeskClock> {
  return clockOf(church, await listServices(church.id), now);
}

/** Today's (or this Sunday's) services with the lesson linked to each, and the desk clock. */
export async function loadUpcoming(church: Church, now: Date): Promise<{ services: DeskService[]; clock: DeskClock; raw: Service[] }> {
  const all = await listServices(church.id);
  const raw = upcomingServices(church, all, now);
  const titles = raw.some((s) => s.lessonId) ? new Map((await listLessons(church.id)).map((l) => [l.id, l.title])) : new Map<string, string>();
  return {
    services: raw.map((s) => toDeskService(s, s.lessonId ? (titles.get(s.lessonId) ?? null) : null)),
    clock: clockOf(church, all, now),
    raw,
  };
}

// ---------------------------------------------------------------- children

const parentNames = async (people: readonly Person[], childIds: string[]): Promise<Map<string, string[]>> => {
  const names = new Map(people.map((p) => [p.id, p.firstName]));
  const out = new Map<string, string[]>();
  for (const l of await listHouseholdLinks(childIds)) {
    const n = names.get(l.parentId);
    if (n) out.set(l.childId, [...(out.get(l.childId) ?? []), n].sort());
  }
  return out;
};

/** Every child of the church with their card's state (never its content). */
export async function loadChildren(churchId: string): Promise<ChildRow[]> {
  const people = await listPeople(churchId);
  const cards = new Map((await listCards(churchId)).map((c) => [c.childId, c]));
  const children = people.filter((p) => p.role === 'child');
  const parents = await parentNames(people, children.map((c) => c.id));
  return children.map((p) => {
    const c = cards.get(p.id);
    const stamps = [c?.parentApprovedAt, c?.directorAckAt].filter((d): d is Date => !!d).map((d) => d.getTime());
    return {
      id: p.id,
      firstName: p.firstName,
      grade: p.grade,
      status: (c?.status ?? 'none') as CardStatus | 'none',
      supportLevel: (c?.supportLevel ?? null) as SupportLevel | null,
      lang: c ? c.lang : null,
      updatedAt: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null,
      parents: parents.get(p.id) ?? [],
    };
  });
}

// ---------------------------------------------------------------- this Sunday

/** The services' current matches (proposed and decided) with names, keyed by service id. */
export async function loadAssignments(churchId: string, serviceIds: string[]): Promise<Record<string, AssignmentRow[]>> {
  const names = new Map((await listPeople(churchId)).map((p) => [p.id, p.firstName]));
  const out: Record<string, AssignmentRow[]> = {};
  for (const id of serviceIds) {
    out[id] = (await listAssignments(id)).map((r) => ({
      id: r.id, childId: r.childId, childName: names.get(r.childId) ?? '', buddyId: r.buddyId, buddyName: names.get(r.buddyId) ?? '',
      status: r.status, reasons: Array.isArray(r.reasons) ? (r.reasons as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    }));
  }
  return out;
}

// ---------------------------------------------------------------- Sunday pack

/**
 * Children with an approved card who are expected at each service: matched there, a regular of that service
 * (checked in at a same-labelled one in the last 5 weeks, as the solver counts it), or new (never checked in).
 */
export async function loadPackChildren(churchId: string, services: readonly Service[]): Promise<Record<string, PackChild[]>> {
  const people = await listPeople(churchId);
  const cards = new Map((await listCards(churchId)).map((c) => [c.childId, c]));
  const checkins = await listCheckinsInChurch(churchId);
  const matched = await listAssignmentsInChurch(churchId);
  const ever = new Set(checkins.map((c) => c.childId));
  const out: Record<string, PackChild[]> = {};
  for (const s of services) {
    const regulars = new Set(checkins
      .filter((c) => c.label === s.label && c.startsAt.getTime() <= s.startsAt.getTime() && s.startsAt.getTime() - c.startsAt.getTime() <= ATTENDANCE_WINDOW)
      .map((c) => c.childId));
    const here = new Set(matched.filter((a) => a.serviceId === s.id).map((a) => a.childId));
    out[s.id] = people
      .filter((p) => p.role === 'child')
      .filter((p) => {
        const card = cards.get(p.id);
        if (!card || (card.status !== 'acknowledged' && card.status !== 'parent_approved')) return false;
        return here.has(p.id) || regulars.has(p.id) || !ever.has(p.id);
      })
      .map((p) => ({ id: p.id, firstName: p.firstName, lang: cards.get(p.id)?.lang === 'es' ? ('es' as const) : ('en' as const) }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }
  return out;
}

// ---------------------------------------------------------------- notes

const KINDS = ['good', 'hard', 'break', 'bathroom', 'note'] as const;

/** Per service: the children a buddy logged moments for (counts only, nothing decrypted) and their note's state. */
export async function loadNotesBoard(churchId: string, services: readonly DeskService[]): Promise<NotesService[]> {
  const people = await listPeople(churchId);
  const names = new Map(people.map((p) => [p.id, p.firstName]));
  const out: NotesService[] = [];
  for (const s of services) {
    const moments = await listMoments(s.id);
    const notes = new Map((await listNotes(s.id)).map((n) => [n.childId, n]));
    const ids = [...new Set(moments.map((m) => m.childId))].filter((id) => names.has(id));
    const parents = ids.length ? await parentNames(people, ids) : new Map<string, string[]>();
    const children: NoteChild[] = ids.map((id) => {
      const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as NoteChild['counts'];
      for (const m of moments) if (m.childId === id) counts[m.kind] += 1;
      const n = notes.get(id);
      return {
        childId: id,
        firstName: names.get(id)!,
        parents: parents.get(id) ?? [],
        counts,
        note: n ? { status: n.status, approvedAt: n.approvedAt?.toISOString() ?? null } : null,
      };
    });
    out.push({ ...s, children: children.sort((a, b) => a.firstName.localeCompare(b.firstName)) });
  }
  return out;
}

// ---------------------------------------------------------------- AI ledger

/** Every AI call this church made, newest first, with totals; the sandbox call cap when there is one. */
export async function loadLedger(church: Pick<Church, 'id' | 'mode'>): Promise<Ledger> {
  const rows: LedgerRow[] = (await listAiCalls(church.id))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      purpose: r.purpose,
      model: r.model,
      e2ee: r.e2ee,
      ok: r.ok,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUsd: r.costUsd === null ? 0 : Number(r.costUsd),
      attestation: toLedgerAttestation(r.attestation),
      attestationRaw: r.attestation ?? null,
      attestationMismatch: r.attestationMismatch,
    }));
  return { rows, totals: ledgerTotals(rows), cap: church.mode === 'sandbox' ? { calls: CAPS.perSandboxCalls } : null };
}
