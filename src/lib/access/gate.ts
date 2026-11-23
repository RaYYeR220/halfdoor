// The access gate. Pure: no I/O, `now` is passed in. Every card read goes through canReadCard.
import type { Viewer } from '@/lib/auth/viewer';

export type CardStatus = 'draft' | 'parent_approved' | 'acknowledged' | 'returned' | 'archived';
export type Scope = 'full' | 'safety';

export type GateInput = {
  viewer: Viewer;
  card: { childId: string; status: CardStatus };
  parentIds: string[];
  service: { id: string; startsAt: Date; endsAt: Date } | null;
  assignment: { buddyId: string; serviceId: string; status: 'proposed' | 'approved' | 'scheduled_in_pco' } | null;
  checkin: { serviceId: string; checkedInAt: Date; checkedOutAt: Date | null } | null;
  now: Date;
  scope: Scope;
};

export type GateResult =
  | { allowed: true; reason: 'checked_in' | 'director' | 'parent' | 'room_safety'; scope: Scope }
  | { allowed: false; reason: 'not_acknowledged' | 'not_assigned' | 'not_checked_in' | 'checked_out' | 'outside_window' | 'other_service' | 'wrong_church' | 'role' };

export const WINDOW_MS = 30 * 60_000;

export function inWindow(service: { startsAt: Date; endsAt: Date }, now: Date): boolean {
  const t = now.getTime();
  return t >= service.startsAt.getTime() - WINDOW_MS && t <= service.endsAt.getTime() + WINDOW_MS;
}

type Deny = Extract<GateResult, { allowed: false }>['reason'];

/** Shared by buddy and leader: a live check-in for THIS service, not checked out, inside the window. */
function checkinProblem(i: GateInput): Deny | null {
  const { service, checkin, now } = i;
  if (!service) return 'not_assigned';
  if (!checkin) return 'not_checked_in';
  if (checkin.serviceId !== service.id) return 'other_service';
  if (checkin.checkedOutAt !== null) return 'checked_out';
  if (!inWindow(service, now)) return 'outside_window';
  return null;
}

export function canReadCard(i: GateInput): GateResult {
  const { viewer, card, scope } = i;
  switch (viewer.role) {
    case 'parent':
      return i.parentIds.includes(viewer.personId) ? { allowed: true, reason: 'parent', scope } : { allowed: false, reason: 'role' };
    case 'director':
      return { allowed: true, reason: 'director', scope };
    case 'buddy': {
      if (card.status !== 'acknowledged') return { allowed: false, reason: 'not_acknowledged' };
      const a = i.assignment;
      if (!i.service || !a || a.buddyId !== viewer.personId || a.serviceId !== i.service.id || a.status === 'proposed') {
        return { allowed: false, reason: 'not_assigned' };
      }
      const problem = checkinProblem(i);
      return problem ? { allowed: false, reason: problem } : { allowed: true, reason: 'checked_in', scope };
    }
    case 'leader': {
      // The room leader sees the safety items of any parent-approved card in the room, never the rest.
      if (card.status !== 'acknowledged' && card.status !== 'parent_approved') return { allowed: false, reason: 'not_acknowledged' };
      const problem = checkinProblem(i);
      return problem ? { allowed: false, reason: problem } : { allowed: true, reason: 'room_safety', scope: 'safety' };
    }
    default:
      return { allowed: false, reason: 'role' };
  }
}
