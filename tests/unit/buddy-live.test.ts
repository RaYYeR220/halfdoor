import { describe, expect, it } from 'vitest';
import { currentStepIndex, diffBeat, pickService, presenceOf, type Held } from '@/lib/buddy/live';
import type { CheckinStatus } from '@/lib/checkins/types';

const IN_AT = '2026-11-22T15:02:00.000Z';
const OUT_AT = '2026-11-22T16:14:00.000Z';
const row = (childId: string, extra: Partial<CheckinStatus> = {}): CheckinStatus => ({
  childId, securityCode: 'K7RD', in: true, checkedInAt: IN_AT, checkedOutAt: null, ...extra,
});

describe('presenceOf', () => {
  it('reads in / out / absent from the heartbeat row', () => {
    expect(presenceOf([row('leo')], 'leo')).toEqual({ state: 'in', session: IN_AT, code: 'K7RD', inAt: IN_AT });
    expect(presenceOf([row('leo', { in: false, checkedOutAt: OUT_AT })], 'leo')).toEqual({ state: 'out', session: IN_AT, inAt: IN_AT, outAt: OUT_AT });
    expect(presenceOf([row('ana')], 'leo')).toEqual({ state: 'absent' });
  });
});

describe('diffBeat: heartbeat to unlock / lock', () => {
  const kids = ['leo', 'ana'];

  it('says nothing while nobody is checked in', () => {
    expect(diffBeat({}, [], kids)).toEqual([]);
    expect(diffBeat({ leo: { phase: 'locked', session: null, retry: false } }, [], kids)).toEqual([]);
  });

  it('unlocks a child the moment their check-in appears', () => {
    expect(diffBeat({}, [row('leo')], kids)).toEqual([{ kind: 'unlock', childId: 'leo', session: IN_AT, code: 'K7RD', inAt: IN_AT }]);
  });

  it('stays quiet while the same check-in is open or being opened', () => {
    for (const phase of ['open', 'opening'] as const) {
      expect(diffBeat({ leo: { phase, session: IN_AT } }, [row('leo')], kids)).toEqual([]);
    }
  });

  it('locks at checkout, with the checkout time', () => {
    const held: Record<string, Held> = { leo: { phase: 'open', session: IN_AT } };
    expect(diffBeat(held, [row('leo', { in: false, checkedOutAt: OUT_AT })], kids)).toEqual([{ kind: 'lock', childId: 'leo', outAt: OUT_AT }]);
  });

  it('locks a card still being fetched when the child leaves, and when the row disappears', () => {
    expect(diffBeat({ leo: { phase: 'opening', session: IN_AT } }, [row('leo', { in: false, checkedOutAt: OUT_AT })], kids)).toEqual([
      { kind: 'lock', childId: 'leo', outAt: OUT_AT },
    ]);
    expect(diffBeat({ leo: { phase: 'open', session: IN_AT } }, [], kids)).toEqual([{ kind: 'lock', childId: 'leo', outAt: null }]);
  });

  it('a new check-in after a checkout the page missed: lock the old one, open the new one', () => {
    const later = '2026-11-22T16:20:00.000Z';
    expect(diffBeat({ leo: { phase: 'open', session: IN_AT } }, [row('leo', { checkedInAt: later })], kids)).toEqual([
      { kind: 'lock', childId: 'leo', outAt: null },
      { kind: 'unlock', childId: 'leo', session: later, code: 'K7RD', inAt: later },
    ]);
  });

  it('retries a denial that can clear (review, window) but not a final one', () => {
    expect(diffBeat({ leo: { phase: 'locked', session: IN_AT, retry: true } }, [row('leo')], kids)).toHaveLength(1);
    expect(diffBeat({ leo: { phase: 'locked', session: IN_AT, retry: false } }, [row('leo')], kids)).toEqual([]);
    // A fresh check-in is always tried, whatever the last one said.
    expect(diffBeat({ leo: { phase: 'locked', session: 'older', retry: false } }, [row('leo')], kids)).toHaveLength(1);
  });

  it('ignores children who are not this buddy\'s', () => {
    expect(diffBeat({}, [row('malik')], kids)).toEqual([]);
  });
});

describe('currentStepIndex', () => {
  const steps = [{ minutes: 5 }, { minutes: 15 }, { minutes: 15 }, { minutes: 10 }];
  const start = new Date('2026-11-22T15:00:00Z');
  const at = (min: number) => new Date(start.getTime() + min * 60_000);

  it('follows each step\'s minutes from the service start', () => {
    expect(currentStepIndex(steps, start, at(0))).toBe(0);
    expect(currentStepIndex(steps, start, at(4.9))).toBe(0);
    expect(currentStepIndex(steps, start, at(5))).toBe(1);
    expect(currentStepIndex(steps, start, at(19))).toBe(1);
    expect(currentStepIndex(steps, start, at(20))).toBe(2);
    expect(currentStepIndex(steps, start, at(44))).toBe(3);
  });

  it('clamps before the start and after the end', () => {
    expect(currentStepIndex(steps, start, at(-20))).toBe(0);
    expect(currentStepIndex(steps, start, at(300))).toBe(3);
    expect(currentStepIndex([], start, at(10))).toBe(0);
  });
});

describe('pickService', () => {
  const s = (id: string, startMin: number, endMin: number) => {
    const base = Date.parse('2026-11-22T15:00:00Z');
    return { id, startsAt: new Date(base + startMin * 60_000).toISOString(), endsAt: new Date(base + endMin * 60_000).toISOString() };
  };
  const nine = s('nine', 0, 75);
  const eleven = s('eleven', 120, 195);
  const now = (min: number) => new Date(Date.parse('2026-11-22T15:00:00Z') + min * 60_000);

  it('takes the one asked for, if it is one of them', () => {
    expect(pickService([nine, eleven], now(10), 'eleven')?.id).toBe('eleven');
    expect(pickService([nine, eleven], now(10), 'nope')?.id).toBe('nine');
  });

  it('else the one whose window holds now, else the next, else the last', () => {
    expect(pickService([eleven, nine], now(-25), null)?.id).toBe('nine');
    expect(pickService([nine, eleven], now(80), null)?.id).toBe('nine');
    // Both windows open (nine just ended, eleven about to start): the one coming up.
    expect(pickService([nine, eleven], now(104), null)?.id).toBe('eleven');
    expect(pickService([nine, eleven], now(-90), null)?.id).toBe('nine');
    expect(pickService([nine, eleven], now(400), null)?.id).toBe('eleven');
    expect(pickService([], now(0), null)).toBeNull();
  });
});
