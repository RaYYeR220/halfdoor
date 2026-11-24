import { describe, expect, it } from 'vitest';
import { buildPersonas } from '@/lib/demo/personas';
import { STEPS, buddyFor, stepTarget } from '@/lib/demo/guideSteps';

const people = [
  { id: 'p-hannah', firstName: 'Hannah', role: 'director' },
  { id: 'p-jordan', firstName: 'Jordan', role: 'parent' },
  { id: 'p-tom', firstName: 'Tom', role: 'buddy' },
  { id: 'p-priya', firstName: 'Priya', role: 'buddy' },
  { id: 'c-sam', firstName: 'Sam', role: 'child' },
];
const personas = buildPersonas('fernbrook', people);
const byKey = new Map(personas.map((p) => [p.key, p]));
const ctx = (buddyId: string | null) => ({ base: '/c/fernbrook', samId: 'c-sam', buddyId, serviceId: 'svc-1' });
const buddyStep = STEPS.find((s) => s.who === 'buddy')!;

describe('DemoGuide step 5 target', () => {
  it('is Tom as the buddy (his own id), not the room-leader persona value, when the solver matched Tom', () => {
    expect(byKey.get('tom')!.value).toBe('p-tom:leader');
    const buddy = buddyFor('p-tom', personas, 'Tom');
    const to = stepTarget(buddyStep, ctx('p-tom'), byKey, buddy);
    expect(to).toEqual({ value: 'p-tom', name: 'Tom', href: '/c/fernbrook/buddy/p-tom?service=svc-1&child=c-sam' });
    expect(to!.value).not.toContain(':leader');
  });

  it('uses the persona name for a plain buddy and falls back to the state name for an unlisted one', () => {
    expect(buddyFor('p-priya', personas, 'ignored')).toEqual({ value: 'p-priya', name: 'Priya' });
    expect(buddyFor('p-zed', personas, 'Zed')).toEqual({ value: 'p-zed', name: 'Zed' });
  });

  it('has no target until a buddy is matched', () => {
    expect(stepTarget(buddyStep, ctx(null), byKey, buddyFor(null, personas, null))).toBeNull();
  });

  it('keeps the other steps on their personas', () => {
    const checkIn = STEPS.find((s) => s.flag === 'samCheckedIn')!;
    expect(stepTarget(checkIn, ctx('p-tom'), byKey, null)).toMatchObject({ value: 'p-hannah', href: '/c/fernbrook/station?service=svc-1&child=c-sam' });
  });
});
