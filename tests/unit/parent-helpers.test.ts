import { describe, expect, it } from 'vitest';
import { StoryLengthError } from '@/lib/card/pipeline';
import type { CardItem, SafetyPrompt } from '@/lib/card/schema';
import { verifyCard } from '@/lib/card/verify';
import { AttestationError } from '@/lib/crypto/attestation';
import { CARDS } from '@/db/seed/fernbrook';
import { demoClockShift } from '@/lib/demo/clock';
import { translator, type Lang } from '@/lib/i18n';
import { accessLine, visibleAccessRows } from '@/lib/parent/accessLog';
import { describeDraftError } from '@/lib/parent/errors';
import { buildSegments, lineIdsOf, markSources, promptMarkId } from '@/lib/parent/highlight';
import { plural } from '@/lib/parent/plural';
import { pickMatch, toAccessRows, viewedToday } from '@/lib/parent/server';
import { approvalLanded, runTracker, serverViewOf } from '@/lib/parent/flow';
import { formatNumber } from '@/lib/parent/format';
import { startOfZonedDay } from '@/lib/time/zoned';
import { deriveTimeline, type TimelineInput } from '@/lib/parent/timeline';
import type { AccessRow } from '@/lib/parent/types';
import { BudgetError, EnclaveError } from '@/lib/venice/enclaveClient';

const item = (id: string, section: CardItem['section'], spans: [number, number][]): CardItem => ({
  id, section, text: id, kind: section === 'safety' ? 'verbatim' : 'paraphrase',
  quotes: spans.map(([start, end]) => ({ text: '', span: { start, end } })), translation: null,
});

describe('buildSegments: the parent text cut into plain and marked runs', () => {
  it('splits at every span edge and labels overlaps with both lines, safety winning the tone', () => {
    const segs = buildSegments(10, markSources([item('i0', 'loves', [[2, 5]]), item('i1', 'safety', [[4, 8]])]));
    expect(segs).toEqual([
      { start: 0, end: 2, ids: [], tone: null },
      { start: 2, end: 4, ids: ['i0'], tone: 'line' },
      { start: 4, end: 5, ids: ['i0', 'i1'], tone: 'safety' },
      { start: 5, end: 8, ids: ['i1'], tone: 'safety' },
      { start: 8, end: 10, ids: [], tone: null },
    ]);
  });

  it('covers the whole text exactly once, clips stray spans and merges equal neighbours', () => {
    const segs = buildSegments(12, markSources([item('i0', 'helps', [[3, 6], [6, 9], [-4, 1], [11, 40], [5, 5]])]));
    expect(segs.map((s) => [s.start, s.end, s.ids.join()])).toEqual([[0, 1, 'i0'], [1, 3, ''], [3, 9, 'i0'], [9, 11, ''], [11, 12, 'i0']]);
    expect(buildSegments(0, [])).toEqual([]);
  });

  it('marks safety-net prompts with their own id, and words lead only to card lines', () => {
    const prompt: SafetyPrompt = { id: 's4', sentence: 'x', span: { start: 4, end: 7 }, matched: 'x' };
    const segs = buildSegments(8, markSources([item('i0', 'loves', [[0, 6]])], [prompt]));
    const shared = segs.find((s) => s.start === 4)!;
    expect(shared.ids).toEqual(['i0', promptMarkId('s4')]);
    expect(lineIdsOf(shared)).toEqual(['i0']);
    expect(segs.find((s) => s.start === 6)).toMatchObject({ ids: ['p:s4'], tone: 'prompt' });
  });

  it("on a real verified card, every quote's words are marked for its line", () => {
    const seed = CARDS.leo;
    const card = verifyCard(seed.story, seed.draft);
    const segs = buildSegments(seed.story.length, markSources(card.items));
    for (const it of card.items) {
      const marked = segs.filter((s) => s.ids.includes(it.id)).map((s) => seed.story.slice(s.start, s.end)).join('');
      expect(marked).toBe(it.quotes.map((q) => q.text).join(''));
    }
    expect(segs.filter((s) => s.tone === 'safety').length).toBeGreaterThan(0);
  });
});

describe('deriveTimeline', () => {
  const base: TimelineInput = { status: null, parentApprovedAt: null, directorAckAt: null, match: null, access: [] };
  const open = (who: string, at: string): AccessRow => ({ id: at, who, me: false, role: 'buddy', reason: 'checked_in', openedAt: at, closedAt: null });
  const states = (i: TimelineInput) => deriveTimeline(i).map((s) => s.state);

  it('no card yet: approving is the step in front of the parent', () => {
    expect(states(base)).toEqual(['current', 'todo', 'todo', 'todo']);
  });

  it('approved, waiting for the kids team', () => {
    expect(states({ ...base, status: 'parent_approved', parentApprovedAt: '2026-11-20T10:00:00Z' })).toEqual(['done', 'current', 'todo', 'todo']);
  });

  it('all four done, with the buddy and the opening after the review', () => {
    const steps = deriveTimeline({
      status: 'acknowledged', parentApprovedAt: '2026-11-01T10:00:00Z', directorAckAt: '2026-11-02T10:00:00Z',
      match: { buddy: 'Priya', serviceLabel: '9:00 service', startsAt: '2026-11-22T15:00:00Z' },
      access: [open('Dana', '2026-10-25T15:04:00Z'), open('Priya', '2026-11-15T15:04:00Z'), open('Priya', '2026-11-22T15:04:00Z')],
    });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(steps[2]).toMatchObject({ who: 'Priya', at: '2026-11-22T15:00:00Z' });
    expect(steps[3]).toMatchObject({ who: 'Priya', at: '2026-11-22T15:04:00Z' });
  });

  it('openings from before the latest review do not count for the new version', () => {
    const s = states({
      status: 'acknowledged', parentApprovedAt: '2026-11-20T10:00:00Z', directorAckAt: '2026-11-21T10:00:00Z',
      match: { buddy: 'Priya', serviceLabel: '9:00 service', startsAt: '2026-11-22T15:00:00Z' },
      access: [open('Priya', '2026-11-15T15:04:00Z'), { ...open('Hannah', '2026-11-21T11:00:00Z'), reason: 'director', role: 'director' }],
    });
    expect(s).toEqual(['done', 'done', 'done', 'current']);
  });

  it('sent back with a question: the review step needs the parent, later steps wait', () => {
    const s = states({ ...base, status: 'returned', parentApprovedAt: '2026-11-20T10:00:00Z', match: { buddy: 'Priya', serviceLabel: 'x', startsAt: '2026-11-22T15:00:00Z' } });
    expect(s).toEqual(['done', 'attention', 'todo', 'todo']);
  });
});

describe('access log sentences', () => {
  const tz = 'America/Chicago';
  const now = new Date('2026-11-22T17:30:00Z'); // Sunday 11:30 AM in Chicago
  const ws = (s: string) => s.replace(/[   ]/g, ' ');
  const line = (row: Partial<AccessRow>, lang: Lang = 'en', childName = 'Sam') =>
    accessLine(
      { id: 'x', who: 'Priya', me: false, role: 'buddy', reason: 'checked_in', openedAt: '2026-11-22T15:02:00Z', closedAt: '2026-11-22T16:14:00Z', ...row },
      { lang, tz, now, t: translator(lang), childName },
    );

  it('a buddy session that ended (EN)', () => {
    expect(ws(line({}).sentence)).toBe("Priya opened Sam's card · Today 9:02 – 10:14 AM (while Sam was checked in)");
  });

  it('a session still open says so', () => {
    const l = line({ closedAt: null });
    expect(l.openNow).toBe(true);
    expect(ws(l.sentence)).toBe("Priya opened Sam's card · Today 9:02 AM · open now (Sam is checked in)");
  });

  it('room leader, director, deletion, an earlier week and someone who left', () => {
    expect(ws(line({ who: 'Tom', role: 'leader', reason: 'room_safety' }).sentence)).toBe(
      "Tom saw Sam's safety lines · Today 9:02 – 10:14 AM (room view, while Sam was checked in)",
    );
    expect(ws(line({ who: 'Hannah', role: 'director', reason: 'director', openedAt: '2026-11-21T22:12:00Z', closedAt: '2026-11-21T22:12:00Z' }).sentence)).toBe(
      "Hannah opened Sam's card · Yesterday 4:12 PM (kids' team)",
    );
    expect(ws(line({ me: true, who: 'Jordan', role: 'parent', reason: 'deleted', openedAt: '2026-11-19T20:00:00Z' }).sentence)).toBe(
      "You deleted Sam's card · Thu 2:00 PM",
    );
    expect(ws(line({ who: null, role: 'system', reason: 'deleted', openedAt: '2026-11-22T06:00:00Z' }).action)).toBe("Sam's card was deleted automatically");
    expect(ws(line({ openedAt: '2026-11-15T15:02:00Z', closedAt: '2026-11-15T16:14:00Z' }).when)).toBe('Sun, Nov 15, 9:02 – 10:14 AM');
    expect(line({ who: null }).action).toBe("Someone no longer on the team opened Sam's card");
  });

  it('Spanish, without gendered words for the child', () => {
    const l = line({ who: 'Marco' }, 'es', 'Ana');
    expect(l.action).toBe('Marco abrió la tarjeta de Ana');
    expect(ws(l.sentence)).toMatch(/^Marco abrió la tarjeta de Ana · Hoy 9:02.+10:14.+\(entre la entrada y la salida de Ana\)$/);
    expect(ws(line({ who: 'Marco', closedAt: null }, 'es', 'Ana').sentence)).toMatch(/· abierta ahora \(desde la entrada de Ana\)$/);
    expect(line({ me: true, reason: 'deleted', role: 'parent' }, 'es', 'Ana').action).toBe('Usted eliminó la tarjeta de Ana');
    expect(line({ who: 'Hannah', role: 'director', reason: 'director' }, 'es', 'Ana').context).toBe('equipo de niños');
  });

  it("the parent's own reads are not listed, their deletion is", () => {
    const rows: AccessRow[] = [
      { id: 'a', who: 'Jordan', me: true, role: 'parent', reason: 'parent', openedAt: 'x', closedAt: 'x' },
      { id: 'b', who: 'Alex', me: false, role: 'parent', reason: 'parent', openedAt: 'x', closedAt: 'x' },
      { id: 'c', who: 'Jordan', me: true, role: 'parent', reason: 'deleted', openedAt: 'x', closedAt: 'x' },
    ];
    expect(visibleAccessRows(rows).map((r) => r.id)).toEqual(['b', 'c']);
  });
});

describe('toAccessRows / pickMatch (server mapping, pure)', () => {
  const people = [{ id: 'p1', firstName: 'Priya' }, { id: 'me', firstName: 'Maria' }];
  it('names instead of ids, marks the viewer, newest first, drops unknown reasons', () => {
    const at = (iso: string) => new Date(iso);
    const rows = toAccessRows(
      [
        { id: '1', cardId: null, childId: 'c', serviceId: 's', viewerId: 'p1', role: 'buddy', reason: 'checked_in', openedAt: at('2026-11-01T10:00:00Z'), closedAt: null },
        { id: '2', cardId: null, childId: 'c', serviceId: null, viewerId: 'me', role: 'parent', reason: 'deleted', openedAt: at('2026-11-02T10:00:00Z'), closedAt: at('2026-11-02T10:00:00Z') },
        { id: '3', cardId: null, childId: 'c', serviceId: null, viewerId: 'gone', role: 'director', reason: 'director', openedAt: at('2026-10-01T10:00:00Z'), closedAt: at('2026-10-01T10:00:00Z') },
        { id: '4', cardId: null, childId: 'c', serviceId: null, viewerId: 'p1', role: 'buddy', reason: 'mystery' as never, openedAt: at('2026-10-01T10:00:00Z'), closedAt: null },
      ],
      people,
      'me',
    );
    expect(rows.map((r) => [r.id, r.who, r.me])).toEqual([['2', 'Maria', true], ['1', 'Priya', false], ['3', null, false]]);
    expect(rows[1].closedAt).toBeNull();
  });

  it('prefers the next approved assignment, else the latest past one; other services never show', () => {
    const now = new Date('2026-11-22T12:00:00Z');
    const svc = (id: string, start: string) => ({ id, label: `${id} service`, startsAt: new Date(start), endsAt: new Date(Date.parse(start) + 75 * 60_000) });
    const services = [svc('past', '2026-11-15T15:00:00Z'), svc('older', '2026-11-08T15:00:00Z'), svc('next', '2026-11-22T15:00:00Z')];
    const a = (serviceId: string, status = 'approved') => ({ serviceId, buddyId: 'p1', status });
    expect(pickMatch([a('past'), a('older'), a('next')], services, people, now)).toEqual({ buddy: 'Priya', serviceLabel: 'next service', startsAt: '2026-11-22T15:00:00.000Z' });
    expect(pickMatch([a('older'), a('past'), a('next', 'proposed')], services, people, now)?.serviceLabel).toBe('past service');
    expect(pickMatch([a('elsewhere')], services, people, now)).toBeNull();
  });
});

describe('describeDraftError: codes only, never text from the error', () => {
  it('maps each failure to the enclave panel or a plain message', () => {
    const unverified = new EnclaveError('quote_unverified', { quote: { reasonCode: 'verification_failed', reason: 'Leo has peanuts' } } as never);
    expect(describeDraftError(unverified)).toEqual({ kind: 'enclave', status: { error: 'signature', reason: 'verification_failed' } });
    expect(describeDraftError(new EnclaveError('attestation_request_failed_502'))).toEqual({ kind: 'enclave', status: { error: 'unavailable' } });
    expect(describeDraftError(new AttestationError('quote_binding_failed', 'nonce'))).toEqual({ kind: 'enclave', status: { error: 'binding' } });
    expect(describeDraftError(new AttestationError('not_verified'))).toEqual({ kind: 'enclave', status: { error: 'unavailable' } });
    expect(describeDraftError(new EnclaveError('request_failed_500'))).toEqual({ kind: 'message', key: 'parent.error.noAnswer' });
    expect(describeDraftError(new EnclaveError('plaintext_in_e2ee_stream'))).toEqual({ kind: 'message', key: 'parent.error.unsealed' });
    expect(describeDraftError(new BudgetError('sandbox_cap'))).toEqual({ kind: 'message', key: 'parent.error.budgetSandbox' });
    expect(describeDraftError(new BudgetError('daily_cap'))).toEqual({ kind: 'message', key: 'parent.error.budgetDaily' });
    expect(describeDraftError(new StoryLengthError(12))).toEqual({ kind: 'message', key: 'parent.error.length' });
    expect(describeDraftError(new TypeError('Failed to fetch'))).toEqual({ kind: 'message', key: 'parent.error.network' });
    expect(describeDraftError(new Error('the model did not return a usable card'))).toEqual({ kind: 'message', key: 'parent.error.unusable' });
  });
});

describe('demo clock: sandbox times read like their service labels, on a Sunday', () => {
  const tz = 'America/Chicago';
  const wall = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

  it('shifts so the first of today\'s services starts at its label time on a Sunday; the others follow', () => {
    const now = new Date('2026-11-24T00:37:12.345Z'); // a Monday evening in Chicago
    const at = (min: number) => new Date(now.getTime() + min * 60_000);
    const services = [
      { label: '9:00 service', startsAt: at(-5) },
      { label: '11:00 service', startsAt: at(115) },
      { label: '9:00 service', startsAt: at(-5 - 7 * 24 * 60) },
    ];
    const shift = demoClockShift(services, now, tz);
    expect(wall(services[0].startsAt.getTime() + shift)).toBe('Sun 09:00');
    expect(wall(services[1].startsAt.getTime() + shift)).toBe('Sun 11:00');
    expect(wall(services[2].startsAt.getTime() + shift)).toBe('Sun 09:00');
    expect(wall(at(-5 + 3).getTime() + shift)).toBe('Sun 09:03'); // check-in 3 minutes in
    // and the parent page formats it that way
    const ctx = { lang: 'en' as const, tz, now, t: translator('en'), shiftMs: shift };
    expect(accessLine({ id: 'x', who: 'Priya', me: false, role: 'buddy', reason: 'checked_in', openedAt: at(-1).toISOString(), closedAt: at(65).toISOString() }, { ...ctx, childName: 'Sam' }).when.replace(/[  ]/g, ' ')).toBe(
      'Today 9:04 – 10:10 AM',
    );
  });

  it('is 0 when no labelled service is near (a real church, or no services today)', () => {
    const now = new Date('2026-11-24T00:00:00Z');
    expect(demoClockShift([], now, tz)).toBe(0);
    expect(demoClockShift([{ label: 'Kids Church', startsAt: now }], now, tz)).toBe(0);
    expect(demoClockShift([{ label: '9:00 service', startsAt: new Date(now.getTime() - 7 * 86_400_000) }], now, tz)).toBe(0);
  });
});

describe('page state: approval landing and enclave runs', () => {
  it('server view from the stored card', () => {
    expect(serverViewOf(null)).toBe('write');
    expect(serverViewOf({ status: 'draft' })).toBe('write');
    expect(serverViewOf({ status: 'archived' })).toBe('write');
    expect(serverViewOf({ status: 'parent_approved' })).toBe('approved');
    expect(serverViewOf({ status: 'acknowledged' })).toBe('approved');
    expect(serverViewOf({ status: 'returned' })).toBe('returned');
  });

  it('a re-approval lands only when the server shows the new version (no flash of the old card)', () => {
    // version 3 approved before; the parent edits and approves again, the PUT answers version 4
    expect(approvalLanded({ view: 'approved', version: 3 }, 4)).toBe(false);
    expect(approvalLanded({ view: 'approved', version: 4 }, 4)).toBe(true);
    expect(approvalLanded({ view: 'approved', version: 5 }, 4)).toBe(true);
    // first approval: nothing on the server yet, then version 1
    expect(approvalLanded({ view: 'write', version: null }, 1)).toBe(false);
    expect(approvalLanded({ view: 'approved', version: 1 }, 1)).toBe(true);
    // returned card re-approved: still returned until the refresh arrives
    expect(approvalLanded({ view: 'returned', version: 2 }, 3)).toBe(false);
    expect(approvalLanded({ view: 'approved', version: 9 }, null)).toBe(false);
  });

  it('runs: a new run or an abort silences the old one and aborts its signal', () => {
    const runs = runTracker();
    const first = runs.start();
    expect(first.live()).toBe(true);
    expect(runs.current()?.live()).toBe(true);
    const second = runs.start();
    expect(first.signal.aborted).toBe(true);
    expect(first.live()).toBe(false); // a late callback of the first draft is ignored
    expect(second.live()).toBe(true);
    runs.abort(); // unmount, child switch, Stop, Edit my words
    expect(second.signal.aborted).toBe(true);
    expect(second.live()).toBe(false);
    expect(runs.current()).toBeNull();
  });
});

describe('numbers and days in the church time zone', () => {
  it('formats counts in the UI language', () => {
    expect(formatNumber(6000, 'en')).toBe('6,000');
    expect(formatNumber(6000, 'es')).toBe(new Intl.NumberFormat('es-419').format(6000));
    expect(formatNumber(1234567, 'es')).toBe(new Intl.NumberFormat('es-419').format(1234567));
  });

  it('start of the day is local midnight, across a DST change too', () => {
    expect(startOfZonedDay(new Date('2026-11-24T00:30:00Z'), 'America/Chicago').toISOString()).toBe('2026-11-23T06:00:00.000Z');
    expect(startOfZonedDay(new Date('2026-07-01T12:00:00Z'), 'America/Chicago').toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(startOfZonedDay(new Date('2026-11-24T00:30:00Z'), 'Europe/Madrid').toISOString()).toBe('2026-11-23T23:00:00.000Z');
  });

  it('a parent view is logged once per viewer per church day', () => {
    const tz = 'America/Chicago';
    const now = new Date('2026-11-22T20:00:00Z'); // 2 PM in Chicago
    const row = (viewerId: string, at: string, reason: AccessRow['reason'] = 'parent') => ({ viewerId, reason, openedAt: new Date(at) });
    expect(viewedToday([], 'me', now, tz)).toBe(false);
    expect(viewedToday([row('me', '2026-11-22T06:30:00Z')], 'me', now, tz)).toBe(true); // 00:30 today
    expect(viewedToday([row('me', '2026-11-22T05:30:00Z')], 'me', now, tz)).toBe(false); // 23:30 yesterday
    expect(viewedToday([row('other', '2026-11-22T15:00:00Z')], 'me', now, tz)).toBe(false);
    expect(viewedToday([row('me', '2026-11-22T15:00:00Z', 'deleted')], 'me', now, tz)).toBe(false);
  });
});

describe('plural', () => {
  it('one and other, in both languages', () => {
    expect(plural(translator('en'), 'parent.review.lines', 1)).toBe('1 line');
    expect(plural(translator('en'), 'parent.review.lines', 7)).toBe('7 lines');
    expect(plural(translator('es'), 'parent.review.left', 2)).toBe('2 omitidas');
    expect(plural(translator('es'), 'parent.draft.kept', 1)).toBe('1 línea conservada');
  });
});
