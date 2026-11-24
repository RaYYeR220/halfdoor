// SERVER-ONLY. Tenant-scoped gate evaluation and the logged card read.
import { closeAccess, insertAccess, listOpenAccess } from '@/db/repo/access';
import { getAssignmentFor } from '@/db/repo/assignments';
import { getCardForChild, type CardRow } from '@/db/repo/cards';
import { getLatestCheckin, getLatestCheckinInChurch } from '@/db/repo/checkins';
import { getChurch } from '@/db/repo/churches';
import { getPersonInChurch, listHouseholdLinks } from '@/db/repo/people';
import { getServiceInChurch } from '@/db/repo/services';
import type { Viewer } from '@/lib/auth/viewer';
import { buildCardView, type CardView } from '@/lib/card/view';
import { canReadCard, type GateResult, type Scope } from './gate';

type Allowed = Extract<GateResult, { allowed: true }>;
type Denied = Extract<GateResult, { allowed: false }>;

/** `card` is null only on a denial: the gate's answer comes before whether a card exists. */
export type Evaluated =
  | { allowed: true; card: CardRow; childFirstName: string; result: Allowed }
  | { allowed: false; card: CardRow | null; childFirstName: string; result: Denied };

/**
 * null = no such child/service IN THIS CHURCH, or no card for a viewer the gate would let in (callers answer 404).
 * A viewer the gate refuses gets the refusal whether or not the child has a card, so a refused buddy, leader or
 * parent can't learn that a card exists (an assigned buddy can still tell a card under review from none).
 */
export async function evaluateGate(
  viewer: Viewer, childId: string, serviceId: string | null, scope: Scope, now: Date,
): Promise<Evaluated | null> {
  const child = await getPersonInChurch(viewer.churchId, childId);
  if (!child || child.role !== 'child') return null;
  const service = serviceId ? (await getServiceInChurch(viewer.churchId, serviceId)) ?? null : null;
  if (serviceId && !service) return null;
  const card = (await getCardForChild(viewer.churchId, childId)) ?? null;

  const needsContext = viewer.role === 'buddy' || viewer.role === 'leader';
  const parentIds = viewer.role === 'parent' ? (await listHouseholdLinks([childId])).map((l) => l.parentId) : [];
  const assignment = needsContext && service ? (await getAssignmentFor(service.id, childId)) ?? null : null;
  const checkin = needsContext
    ? ((service ? await getLatestCheckin(service.id, childId) : undefined) ?? (await getLatestCheckinInChurch(viewer.churchId, childId)) ?? null)
    : null;

  // No card: judge an acknowledged stand-in, so the answer is the one a real card would get on every other ground.
  const result = canReadCard({ viewer, card: card ?? { childId, status: 'acknowledged' }, parentIds, service, assignment, checkin, now, scope });
  if (!result.allowed) return { allowed: false, card, childFirstName: child.firstName, result };
  return card ? { allowed: true, card, childFirstName: child.firstName, result } : null;
}

export type OpenResult =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'locked'; reason: Exclude<GateResult, { allowed: true }>['reason'] }
  | { kind: 'open'; card: CardView };

/** Gate, then log the opening (allowed) or close the viewer's open entries on this card (denied). */
export async function openCard(
  viewer: Viewer, childId: string, serviceId: string | null, scope: Scope, now: Date,
): Promise<OpenResult> {
  const ev = await evaluateGate(viewer, childId, serviceId, scope, now);
  if (!ev) return { kind: 'not_found' };
  if (!ev.allowed) {
    const { result } = ev;
    if (result.reason === 'role') return { kind: 'forbidden' };
    // Close exactly this viewer's openings of this child at this service (none when no service was named).
    if (serviceId) {
      const stale = (await listOpenAccess(viewer.personId)).filter((e) => e.childId === childId && e.serviceId === serviceId).map((e) => e.id);
      await closeAccess(stale, now);
    }
    return { kind: 'locked', reason: result.reason };
  }
  const { card, result } = ev;
  const church = await getChurch(viewer.churchId);
  if (!church) return { kind: 'not_found' };
  const view = buildCardView(card, ev.childFirstName, church.wrappedDek, viewer.role, result.scope);
  // Parent and director reads are instantaneous; buddy/leader entries stay open until the gate closes.
  if (result.reason === 'checked_in' || result.reason === 'room_safety') await logSessionRead(viewer, card.id, childId, serviceId, result.reason, now);
  else {
    await insertAccess({
      cardId: card.id, childId, serviceId: null, viewerId: viewer.personId, role: viewer.role, reason: result.reason, openedAt: now, closedAt: now,
    });
  }
  return { kind: 'open', card: view };
}

/**
 * A buddy's or room leader's read while the gate is open. One entry per session: while this viewer already has an open
 * entry for this child at this service, a re-read (the phone checking the gate again, the picture schedule) is part
 * of it, so the family's log reads "Priya opened Leo's card · 9:02 – 10:14" once, not once per request.
 */
export async function logSessionRead(
  viewer: Viewer, cardId: string, childId: string, serviceId: string | null, reason: 'checked_in' | 'room_safety', now: Date,
): Promise<void> {
  const open = (await listOpenAccess(viewer.personId)).some((e) => e.childId === childId && e.serviceId === serviceId);
  if (open) return;
  await insertAccess({ cardId, childId, serviceId, viewerId: viewer.personId, role: viewer.role, reason, openedAt: now, closedAt: null });
}


/** Heartbeat side: close every open entry of this viewer whose gate now denies, judged at the entry's own service. */
export async function closeStaleAccess(viewer: Viewer, now: Date): Promise<void> {
  if (viewer.role !== 'buddy' && viewer.role !== 'leader') return;
  const stale: string[] = [];
  const verdicts = new Map<string, boolean>();
  for (const e of await listOpenAccess(viewer.personId)) {
    if (!e.childId) { stale.push(e.id); continue; }
    const key = `${e.childId}|${e.serviceId}`;
    if (!verdicts.has(key)) {
      const ev = await evaluateGate(viewer, e.childId, e.serviceId, viewer.role === 'leader' ? 'safety' : 'full', now);
      verdicts.set(key, !!ev?.allowed);
    }
    if (!verdicts.get(key)) stale.push(e.id);
  }
  await closeAccess(stale, now);
}
