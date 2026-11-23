import { describe, expect, test } from 'vitest';
import { patterns } from '@/lib/patterns';
import type { MomentKind } from '@/lib/note/schema';

const STEPS = [{ key: 'worship', segment: 'worship' as const }, { key: 'craft', segment: 'craft' as const }];
const services = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, STEPS]));
const hard = (svc: number[], kind: MomentKind = 'hard') => svc.map((i) => ({ id: `m${i}${kind}`, stepKey: 'worship', serviceId: `s${i}`, kind }));

describe('patterns', () => {
  test('hard in worship in 4 of 5 services', () => {
    const p = patterns(hard([0, 1, 2, 3]), services(5));
    expect(p).toEqual([{ segment: 'worship', kind: 'hard', count: 4, outOf: 5, momentIds: ['m0hard', 'm1hard', 'm2hard', 'm3hard'] }]);
  });
  test('2 of 5 is nothing', () => {
    expect(patterns(hard([0, 1]), services(5))).toEqual([]);
  });
  test('needs at least 4 services', () => {
    expect(patterns(hard([0, 1, 2]), services(3))).toEqual([]);
  });
  test('two hard moments in one service count once; good moments never count', () => {
    const m = [...hard([0, 0, 1, 1]).map((x, i) => ({ ...x, id: `d${i}` })), ...hard([2, 3], 'good')];
    expect(patterns(m, services(5))).toEqual([]);
  });
  test('breaks are separate from hards; steps without a segment are ignored', () => {
    const m = [...hard([0, 1, 2], 'break'), { id: 'x', stepKey: 'other', serviceId: 's3', kind: 'hard' as const }];
    expect(patterns(m, services(4))).toMatchObject([{ segment: 'worship', kind: 'break', count: 3, outOf: 4 }]);
  });
  test('a segment key falls back to the step key', () => {
    expect(patterns(hard([0, 1, 2, 3]), Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`s${i}`, [{ key: 'worship' }]])))).toHaveLength(1);
  });
});
