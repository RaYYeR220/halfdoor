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

export type Evaluated = { card: CardRow; childFirstName: string; result: GateResult };

/** null = no such child/card/service IN THIS CHURCH (callers answer 404). */
export async function evaluateGate(
  viewer: Viewer, childId: string, serviceId: string | null, scope: Scope, now: Date,
): Promise<Evaluated | null> {
  const child = await getPersonInChurch(viewer.churchId, childId);
  if (!child || child.role !== 'child') return null;
  const card = await getCardForChild(viewer.churchId, childId);
  if (!card) return null;
  const service = serviceId ? (await getServiceInChurch(viewer.churchId, serviceId)) ?? null : null;
  if (serviceId && !service) return null;

  const needsContext = viewer.role === 'buddy' || viewer.role === 'leader';
  const parentIds = viewer.role === 'parent' ? (await listHouseholdLinks([childId])).map((l) => l.parentId) : [];
  const assignment = needsContext && service ? (await getAssignmentFor(service.id, childId)) ?? null : null;
  const checkin = needsContext
    ? ((service ? await getLatestCheckin(service.id, childId) : undefined) ?? (await getLatestCheckinInChurch(viewer.churchId, childId)) ?? null)
    : null;

  const result = canReadCard({ viewer, card, parentIds, service, assignment, checkin, now, scope });
  return { card, childFirstName: child.firstName, result };
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
  const { card, result } = ev;
  if (!result.allowed) {
    if (result.reason === 'role') return { kind: 'forbidden' };
    const stale = (await listOpenAccess(viewer.personId)).filter((e) => e.childId === childId).map((e) => e.id);
    await closeAccess(stale, now);
    return { kind: 'locked', reason: result.reason };
  }
  const church = await getChurch(viewer.churchId);
  if (!church) return { kind: 'not_found' };
  const view = buildCardView(card, ev.childFirstName, church.wrappedDek, viewer.role, result.scope);
  // Parent and director reads are instantaneous; buddy/leader entries stay open until the gate closes.
  const session = result.reason === 'checked_in' || result.reason === 'room_safety';
  await insertAccess({
    cardId: card.id, childId, viewerId: viewer.personId, role: viewer.role, reason: result.reason,
    openedAt: now, closedAt: session ? null : now,
  });
  return { kind: 'open', card: view };
}

/** Heartbeat side: close every open entry of this viewer whose gate now denies. */
export async function closeStaleAccess(viewer: Viewer, serviceId: string, now: Date): Promise<void> {
  if (viewer.role !== 'buddy' && viewer.role !== 'leader') return;
  const open = await listOpenAccess(viewer.personId);
  const stale: string[] = [];
  const verdicts = new Map<string, boolean>();
  for (const e of open) {
    if (!verdicts.has(e.childId)) {
      const ev = await evaluateGate(viewer, e.childId, serviceId, viewer.role === 'leader' ? 'safety' : 'full', now);
      verdicts.set(e.childId, !!ev?.result.allowed);
    }
    if (!verdicts.get(e.childId)) stale.push(e.id);
  }
  await closeAccess(stale, now);
}
