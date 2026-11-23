import { describe, expect, it } from 'vitest';
import { hungarian, INF } from '@/lib/solver/hungarian';
import { eligibility, explainGap, solve } from '@/lib/solver/solve';
import type { SolverBuddy, SolverChild } from '@/lib/solver/types';

const SERVICE = new Date('2026-11-23T15:00:00Z');
const GOOD_BG = new Date('2027-06-30T00:00:00Z');
const fresh = new Date('2026-10-01T00:00:00Z');

const buddy = (name: string, o: Partial<SolverBuddy> = {}): SolverBuddy => ({
  id: name.toLowerCase(), name, gender: 'f', skills: [], trainingAt: fresh, backgroundExpiresAt: GOOD_BG, busy: false, ...o,
});
const child = (name: string, o: Partial<SolverChild> = {}): SolverChild => ({
  id: name.toLowerCase(), name, supportLevel: 'all_morning', tags: [], gender: 'f', lastBuddyIds: [], ...o,
});

const priya = () => buddy('Priya', { skills: ['aac'] });
const dana = () => buddy('Dana', { skills: ['aac'], trainingAt: new Date('2025-10-02T00:00:00Z') });
const ivy = () => child('Ivy', { tags: ['nonverbal_or_aac', 'bathroom_help', 'mobility_aid'] });

describe('hungarian', () => {
  it('finds the optimum of a known 3x3', () => {
    const m = [[4, 1, 3], [2, 0, 5], [3, 2, 2]];
    const pick = hungarian(m);
    expect(pick.reduce((s, j, i) => s + m[i][j], 0)).toBe(5); // 1 + 2 + 2
    expect(new Set(pick).size).toBe(3);
  });
  it('handles wide and tall matrices, and INF cells', () => {
    expect(hungarian([[9, 1, 5]])).toEqual([1]);
    const tall = hungarian([[1], [0], [2]]);
    expect(tall.filter((j) => j === 0)).toHaveLength(1);
    expect(tall[1]).toBe(0);
    expect(hungarian([[INF, INF], [1, 2]])).toEqual([-1, 0]);
    expect(hungarian([])).toEqual([]);
  });
});

describe('eligibility', () => {
  it('checks training window, background, busy, gender, skills', () => {
    expect(eligibility(priya(), ivy(), SERVICE)).toEqual({ ok: true, violations: [] });
    expect(eligibility(dana(), ivy(), SERVICE).violations).toEqual(['training_expired']);
    expect(eligibility(buddy('Ben', { gender: 'm', backgroundExpiresAt: new Date('2026-11-20T00:00:00Z') }), ivy(), SERVICE).violations)
      .toEqual(['background_expired', 'gender_rule', 'needs_aac']);
    expect(eligibility(buddy('Ruth', { busy: true }), child('Theo', { tags: ['medical_plan'] }), SERVICE).violations).toEqual(['busy', 'needs_medical']);
  });
});

describe('solve', () => {
  it('empty inputs', () => {
    expect(solve({ serviceDate: SERVICE, children: [], buddies: [] })).toEqual({ assignments: [], unassigned: [] });
    expect(solve({ serviceDate: SERVICE, children: [child('Leo')], buddies: [] }).unassigned).toHaveLength(1);
  });

  it('Ivy gets Priya, not Dana (expired training)', () => {
    const r = solve({ serviceDate: SERVICE, children: [ivy()], buddies: [dana(), priya(), buddy('Grace')] });
    expect(r.assignments).toEqual([{ childId: 'ivy', buddyId: 'priya', reasons: ['AAC experience'] }]);
    expect(r.unassigned).toEqual([]);
  });

  it('Dana shows as a training_expired gap hint only when Priya is busy', () => {
    const r = solve({ serviceDate: SERVICE, children: [ivy()], buddies: [dana(), { ...priya(), busy: true }, buddy('Grace')] });
    expect(r.assignments).toEqual([]);
    expect(r.unassigned[0].gapHints).toEqual([{ buddyId: 'dana', fix: 'training_expired' }]);
    expect(explainGap(ivy(), r.unassigned[0], [dana()], '11:00 service')).toEqual([
      "Ivy needs a buddy with AAC experience at 11:00 — Dana's inclusion training expired 2 Oct",
    ]);
  });

  it('explains busy buddies with their reason', () => {
    const worship = { ...priya(), busy: true, busyReason: 'serving on the worship team' };
    const r = solve({ serviceDate: SERVICE, children: [ivy()], buddies: [dana(), worship] });
    expect(r.unassigned[0].busyBuddyIds).toEqual(['priya']);
    expect(explainGap(ivy(), r.unassigned[0], [dana(), worship], '11:00 service')).toEqual([
      "Ivy needs a buddy with AAC experience at 11:00 — Dana's inclusion training expired 2 Oct",
      'Priya is serving on the worship team at 11:00',
    ]);
  });

  it('a bathroom_help girl never gets a male buddy', () => {
    const c = child('Ivy', { tags: ['bathroom_help'] });
    const r = solve({ serviceDate: SERVICE, children: [c], buddies: [buddy('Aaron', { gender: 'm' }), buddy('Zed', { gender: 'f' })] });
    expect(r.assignments[0].buddyId).toBe('zed'); // Aaron would win the name tie-break otherwise
    const only = solve({ serviceDate: SERVICE, children: [c], buddies: [buddy('Aaron', { gender: 'm' })] });
    expect(only.assignments).toEqual([]);
    expect(only.unassigned[0].violationsByBuddy.aaron).toEqual(['gender_rule']);
  });

  it('all ineligible returns gaps with no hint for non-fixable buddies', () => {
    const r = solve({
      serviceDate: SERVICE,
      children: [child('Leo', { gender: 'm' })],
      buddies: [buddy('Ben', { backgroundExpiresAt: new Date('2026-11-20T00:00:00Z') }), buddy('Tom', { busy: true })],
    });
    expect(r.assignments).toEqual([]);
    expect(r.unassigned[0].gapHints).toEqual([{ buddyId: 'ben', fix: 'background_expired' }]);
    expect(r.unassigned[0].violationsByBuddy.tom).toEqual(['busy']);
    expect(explainGap(child('Leo'), { gapHints: [{ buddyId: 'ben', fix: 'background_expired' }] }, [buddy('Ben', { backgroundExpiresAt: new Date('2026-11-20T00:00:00Z') })]))
      .toEqual(["Leo needs a buddy — Ben's background check expired 20 Nov"]);
    expect(explainGap(child('Leo'), { gapHints: [] }, [])).toEqual(['No trained buddy is free — ask a director to cover']);
  });

  it('continuity keeps Leo with last Sundays buddy when costs otherwise tie', () => {
    const buddies = [buddy('Ana'), buddy('Priya'), buddy('Zoe')];
    const r = solve({ serviceDate: SERVICE, children: [child('Leo', { lastBuddyIds: ['priya', 'priya', 'priya'] })], buddies });
    expect(r.assignments).toEqual([{ childId: 'leo', buddyId: 'priya', reasons: ['Same buddy as the last 3 Sundays'] }]);
    const two = solve({ serviceDate: SERVICE, children: [child('Leo', { lastBuddyIds: ['priya', 'zoe', 'priya'] })], buddies });
    expect(two.assignments[0].reasons).toEqual(['Same buddy as 2 of the last 3 Sundays']);
    const one = solve({ serviceDate: SERVICE, children: [child('Leo', { lastBuddyIds: ['priya'] })], buddies });
    expect(one.assignments[0].reasons).toEqual(['Same buddy as last Sunday']);
  });

  it('is deterministic: exact ties resolve to the buddy first by name', () => {
    const r = solve({ serviceDate: SERVICE, children: [child('Leo')], buddies: [buddy('Zoe'), buddy('Mia'), buddy('Abe')] });
    expect(r.assignments[0].buddyId).toBe('abe');
  });

  it('gives the scarce skilled buddy to the child who needs her, Leo moves aside', () => {
    const leo = child('Leo', { gender: 'm', lastBuddyIds: ['priya'] });
    const r = solve({ serviceDate: SERVICE, children: [leo, ivy()], buddies: [priya(), buddy('Grace'), buddy('Tom', { gender: 'm' })] });
    expect(r.assignments.find((a) => a.childId === 'ivy')!.buddyId).toBe('priya');
    expect(r.assignments.find((a) => a.childId === 'leo')!.buddyId).toBe('grace');
  });

  it('parts children share one buddy only when capacity forces it, never with an all_morning child', () => {
    const ana = child('Ana', { supportLevel: 'parts', tags: ['spanish_home'] });
    const malik = child('Malik', { supportLevel: 'parts', gender: 'm' });
    const marco = buddy('Marco', { gender: 'm', skills: ['es'] });
    const r = solve({ serviceDate: SERVICE, children: [child('Leo', { lastBuddyIds: ['priya'] }), ana, malik], buddies: [priya(), marco] });
    // Leo takes Priya (phase 1); Ana + Malik share Marco.
    expect(r.assignments.find((a) => a.childId === 'leo')!.buddyId).toBe('priya');
    const a = r.assignments.find((x) => x.childId === 'ana')!;
    const m = r.assignments.find((x) => x.childId === 'malik')!;
    expect(a.buddyId).toBe('marco');
    expect(m.buddyId).toBe('marco');
    expect(a.reasons).toEqual(['Speaks Spanish', 'Shares with Malik (both part of the morning)']);
    expect(m.reasons).toEqual(['Shares with Ana (both part of the morning)']);
    // A third parts child has nowhere to go: unassigned, not squeezed in as a third.
    const three = solve({ serviceDate: SERVICE, children: [child('Leo', { lastBuddyIds: ['priya'] }), ana, malik, child('Zia', { supportLevel: 'parts' })], buddies: [priya(), marco] });
    expect(three.unassigned.map((u) => u.childId)).toEqual(['zia']);
  });

  it('skips none children', () => {
    const r = solve({ serviceDate: SERVICE, children: [child('Theo', { supportLevel: 'none', tags: ['medical_plan'] })], buddies: [buddy('Ruth')] });
    expect(r).toEqual({ assignments: [], unassigned: [] });
  });
});
