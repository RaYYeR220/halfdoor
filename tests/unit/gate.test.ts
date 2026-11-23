import { describe, expect, it } from 'vitest';
import { canReadCard, type GateInput } from '@/lib/access/gate';

const MIN = 60_000;
const start = new Date('2026-11-22T15:00:00Z');
const end = new Date('2026-11-22T16:15:00Z');
const service = { id: 's1', startsAt: start, endsAt: end };
const at = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN);

const base = (over: Partial<GateInput> = {}): GateInput => ({
  viewer: { churchId: 'c', personId: 'buddy1', role: 'buddy', sandbox: true },
  card: { childId: 'kid', status: 'acknowledged' },
  parentIds: ['mom'],
  service,
  assignment: { buddyId: 'buddy1', serviceId: 's1', status: 'approved' },
  checkin: { serviceId: 's1', checkedInAt: at(start, -5), checkedOutAt: null },
  now: at(start, 10),
  scope: 'full',
  ...over,
});

describe('canReadCard: buddy', () => {
  it('buddy with approved assignment and active check-in reads full', () => {
    expect(canReadCard(base())).toEqual({ allowed: true, reason: 'checked_in', scope: 'full' });
  });
  it('a scheduled_in_pco assignment counts too', () => {
    expect(canReadCard(base({ assignment: { buddyId: 'buddy1', serviceId: 's1', status: 'scheduled_in_pco' } })).allowed).toBe(true);
  });
  it('checked-out denies', () => {
    const r = canReadCard(base({ checkin: { serviceId: 's1', checkedInAt: at(start, -5), checkedOutAt: at(start, 5) } }));
    expect(r).toEqual({ allowed: false, reason: 'checked_out' });
  });
  it('check-in for other service denies', () => {
    expect(canReadCard(base({ checkin: { serviceId: 's2', checkedInAt: at(start, -5), checkedOutAt: null } }))).toEqual({ allowed: false, reason: 'other_service' });
  });
  it('outside window denies (endsAt + 31 min)', () => {
    expect(canReadCard(base({ now: at(end, 31) }))).toEqual({ allowed: false, reason: 'outside_window' });
    expect(canReadCard(base({ now: at(start, -31), checkin: { serviceId: 's1', checkedInAt: at(start, -40), checkedOutAt: null } }))).toEqual({ allowed: false, reason: 'outside_window' });
  });
  it('window edges are inclusive: start-30 and end+30 are in', () => {
    expect(canReadCard(base({ now: at(start, -30) })).allowed).toBe(true);
    expect(canReadCard(base({ now: at(end, 30) })).allowed).toBe(true);
  });
  it('not acknowledged denies, whatever else is true', () => {
    for (const status of ['draft', 'parent_approved', 'returned', 'archived'] as const) {
      expect(canReadCard(base({ card: { childId: 'kid', status } }))).toEqual({ allowed: false, reason: 'not_acknowledged' });
    }
  });
  it('no checked-in child denies', () => {
    expect(canReadCard(base({ checkin: null }))).toEqual({ allowed: false, reason: 'not_checked_in' });
  });
  it('proposed, missing, someone else\'s or other-service assignment denies', () => {
    const denied = { allowed: false, reason: 'not_assigned' };
    expect(canReadCard(base({ assignment: { buddyId: 'buddy1', serviceId: 's1', status: 'proposed' } }))).toEqual(denied);
    expect(canReadCard(base({ assignment: null }))).toEqual(denied);
    expect(canReadCard(base({ assignment: { buddyId: 'other', serviceId: 's1', status: 'approved' } }))).toEqual(denied);
    expect(canReadCard(base({ assignment: { buddyId: 'buddy1', serviceId: 's2', status: 'approved' } }))).toEqual(denied);
    expect(canReadCard(base({ service: null }))).toEqual(denied);
  });
});

describe('canReadCard: parent, director, leader', () => {
  it('parent reads draft', () => {
    const v = { churchId: 'c', personId: 'mom', role: 'parent' as const, sandbox: true };
    expect(canReadCard(base({ viewer: v, card: { childId: 'kid', status: 'draft' }, service: null, assignment: null, checkin: null }))).toEqual({ allowed: true, reason: 'parent', scope: 'full' });
  });
  it('a parent of another child is refused', () => {
    const v = { churchId: 'c', personId: 'stranger', role: 'parent' as const, sandbox: true };
    expect(canReadCard(base({ viewer: v }))).toEqual({ allowed: false, reason: 'role' });
  });
  it('director reads any status, full', () => {
    const v = { churchId: 'c', personId: 'dir', role: 'director' as const, sandbox: true };
    expect(canReadCard(base({ viewer: v, card: { childId: 'kid', status: 'returned' }, checkin: null }))).toEqual({ allowed: true, reason: 'director', scope: 'full' });
  });
  it('leader gets safety scope only, even when full is asked', () => {
    const v = { churchId: 'c', personId: 'tom', role: 'leader' as const, sandbox: true };
    expect(canReadCard(base({ viewer: v, assignment: null }))).toEqual({ allowed: true, reason: 'room_safety', scope: 'safety' });
  });
  it('leader needs an active check-in in the window', () => {
    const v = { churchId: 'c', personId: 'tom', role: 'leader' as const, sandbox: true };
    expect(canReadCard(base({ viewer: v, checkin: null })).allowed).toBe(false);
    expect(canReadCard(base({ viewer: v, checkin: { serviceId: 's1', checkedInAt: start, checkedOutAt: at(start, 1) } }))).toEqual({ allowed: false, reason: 'checked_out' });
    expect(canReadCard(base({ viewer: v, now: at(end, 31) }))).toEqual({ allowed: false, reason: 'outside_window' });
  });
});
