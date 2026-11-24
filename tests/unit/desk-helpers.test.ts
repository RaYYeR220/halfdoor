import { describe, expect, it } from 'vitest';
import {
  filterCounts, filterOf, flagRuns, formatUsd, ledgerTotals, reasonChip, sortChildren, toLedgerAttestation,
} from '@/lib/desk/helpers';
import { upcomingServices } from '@/lib/desk/server';
import type { Service } from '@/db/repo/services';

describe('reasonChip', () => {
  it('names what kind of reason the solver gave, and only a new family stands out', () => {
    expect(reasonChip('Same buddy as the last 3 Sundays')).toEqual({ label: 'Same buddy as the last 3 Sundays', kind: 'continuity', tone: 'neutral' });
    expect(reasonChip('Same buddy as last Sunday').kind).toBe('continuity');
    expect(reasonChip('Same buddy as 2 of the last 3 Sundays').kind).toBe('continuity');
    expect(reasonChip('Speaks Spanish')).toMatchObject({ kind: 'language', tone: 'neutral' });
    expect(reasonChip('AAC experience').kind).toBe('skill');
    expect(reasonChip('Medical training').kind).toBe('skill');
    expect(reasonChip('New family — confirm which service')).toMatchObject({ kind: 'new_family', tone: 'accent' });
    expect(reasonChip('  Something else  ')).toEqual({ label: 'Something else', kind: 'other', tone: 'neutral' });
  });
});

describe('children filter', () => {
  const rows = [
    { firstName: 'Theo', status: 'acknowledged' as const },
    { firstName: 'Sam', status: 'none' as const },
    { firstName: 'Malik', status: 'parent_approved' as const },
    { firstName: 'Ana', status: 'acknowledged' as const },
    { firstName: 'Zed', status: 'returned' as const },
    { firstName: 'Bo', status: 'draft' as const },
  ];

  it('puts each status under one chip; drafts count as "no card yet" (the team never sees them)', () => {
    expect(filterOf('parent_approved')).toBe('review');
    expect(filterOf('returned')).toBe('returned');
    expect(filterOf('acknowledged')).toBe('reviewed');
    expect(filterOf('draft')).toBe('none');
    expect(filterOf('archived')).toBe('none');
    expect(filterOf('none')).toBe('none');
    expect(filterCounts(rows)).toEqual({ all: 6, review: 1, returned: 1, reviewed: 2, none: 2 });
  });

  it('sorts what needs the director first, then by name', () => {
    expect(sortChildren(rows).map((r) => r.firstName)).toEqual(['Malik', 'Zed', 'Ana', 'Theo', 'Bo', 'Sam']);
  });
});

describe('AI ledger', () => {
  it('reads the stored attestation record defensively', () => {
    expect(toLedgerAttestation(null)).toBeNull();
    expect(toLedgerAttestation('nope')).toBeNull();
    expect(toLedgerAttestation({
      provider: 'near-ai', hardware: 'intel-tdx', checkedAt: '2026-11-24T10:00:00Z',
      quote: { signature: 'verified', signatureSource: 'live', signatureCheckedIn: 'browser', mrtdShort: 'abcdef0123456789…', tcbStatus: 'UpToDate' },
    })).toEqual({
      provider: 'near-ai', hardware: 'intel-tdx', signature: 'verified', source: 'live', snapshotDate: null, checkedIn: 'browser',
      checkedAt: '2026-11-24T10:00:00Z', mrtdShort: 'abcdef0123456789…', tcbStatus: 'UpToDate',
    });
    const snap = toLedgerAttestation({ quote: { signature: 'verified', signatureSource: 'snapshot', snapshotCapturedAt: '2026-11-23T21:32:00Z', mrtd: 'f'.repeat(96) } });
    expect(snap).toMatchObject({ provider: 'unknown', source: 'snapshot', snapshotDate: '2026-11-23', mrtdShort: `${'f'.repeat(16)}…` });
    // Anything else in the signature slot is never shown as verified.
    expect(toLedgerAttestation({ quote: { signature: 'yes' } })?.signature).toBe('unverified');
  });

  it('totals calls, tokens and cost; running calls count at their reserved cost', () => {
    const t = ledgerTotals([
      { e2ee: true, ok: true, tokensIn: 1200, tokensOut: 300, costUsd: 0.000330 },
      { e2ee: false, ok: true, tokensIn: 900, tokensOut: 500, costUsd: 0.0068 },
      { e2ee: true, ok: null, tokensIn: null, tokensOut: null, costUsd: 0.0006 },
      { e2ee: true, ok: false, tokensIn: null, tokensOut: null, costUsd: 0 },
    ]);
    expect(t).toEqual({ calls: 4, e2ee: 3, plain: 1, tokensIn: 2100, tokensOut: 800, costUsd: 0.00773, running: 1, failed: 1 });
    expect(ledgerTotals([])).toEqual({ calls: 0, e2ee: 0, plain: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, running: 0, failed: 0 });
  });

  it('shows fractions of a cent', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.00003)).toBe('<$0.0001');
    expect(formatUsd(0.00726)).toBe('$0.0073');
    expect(formatUsd(1.5)).toBe('$1.50');
    expect(formatUsd(Number.NaN)).toBe('$0');
  });
});

describe('flagRuns', () => {
  it('marks judgment words in place and keeps the sentence intact', () => {
    const text = 'The child had a meltdown at worship, then a Tantrum at snack.';
    const runs = flagRuns(text, 'en');
    expect(runs.map((r) => r.text).join('')).toBe(text);
    expect(runs.filter((r) => r.flagged).map((r) => r.text)).toEqual(['meltdown', 'Tantrum']);
    expect(flagRuns('Sang every song.', 'en')).toEqual([{ text: 'Sang every song.', flagged: false }]);
    expect(flagRuns('', 'en')).toEqual([]);
    // Whole words only: "badge" is not "bad".
    expect(flagRuns('She got a badge.', 'en').some((r) => r.flagged)).toBe(false);
    expect(flagRuns('Tuvo un berrinche corto.', 'es').filter((r) => r.flagged).map((r) => r.text)).toEqual(['berrinche']);
  });
});

describe('upcomingServices', () => {
  const H = 3600_000;
  const svc = (startOffsetH: number, id: string): Service => ({
    id, churchId: 'c', label: `${id} service`, startsAt: new Date(Date.UTC(2026, 10, 22, 15) + startOffsetH * H),
    endsAt: new Date(Date.UTC(2026, 10, 22, 15) + (startOffsetH + 1.25) * H), room: null, pcoEventId: null, pcoServiceTypeId: null, pcoPlanId: null, lessonId: null,
  });

  it("a sandbox plans for the services around now; its past Sundays stay out", () => {
    const now = new Date(Date.UTC(2026, 10, 22, 15) + 5 * 60_000);
    const list = [svc(0, 'a'), svc(2, 'b'), svc(-168, 'past'), svc(-166, 'past2')];
    expect(upcomingServices({ mode: 'sandbox', tz: 'America/Chicago' }, list, now).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('a real church plans for the next day with services, seen from midweek', () => {
    const wednesday = new Date(Date.UTC(2026, 10, 18, 18)); // Wed Nov 18, noon in Chicago
    const list = [svc(0, 'nine'), svc(2, 'eleven'), svc(-168, 'last'), svc(168, 'next')];
    expect(upcomingServices({ mode: 'live', tz: 'America/Chicago' }, list, wednesday).map((s) => s.id)).toEqual(['nine', 'eleven']);
    expect(upcomingServices({ mode: 'live', tz: 'America/Chicago' }, [svc(-168, 'last')], wednesday)).toEqual([]);
  });
});
