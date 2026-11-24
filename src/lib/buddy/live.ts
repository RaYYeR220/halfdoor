// Pure helpers for the live pages (buddy phone, room view): what a heartbeat means for each child, which lesson step
// is on now, which of today's services to open. No I/O and no React; `now` is always passed in.
import type { CheckinStatus } from '@/lib/checkins/types';

/** Where a child stands at the service, from the heartbeat's newest row for them. `session` = that check-in's start. */
export type Presence =
  | { state: 'in'; session: string; code: string | null; inAt: string }
  | { state: 'out'; session: string; inAt: string; outAt: string }
  | { state: 'absent' };

export function presenceOf(checkins: readonly CheckinStatus[], childId: string): Presence {
  const row = checkins.find((c) => c.childId === childId);
  if (!row) return { state: 'absent' };
  if (row.in) return { state: 'in', session: row.checkedInAt, code: row.securityCode, inAt: row.checkedInAt };
  return { state: 'out', session: row.checkedInAt, inAt: row.checkedInAt, outAt: row.checkedOutAt ?? row.checkedInAt };
}

/**
 * What the page holds for a child. `opening`/`open` carry the check-in they belong to. `locked` carries the
 * check-in it was judged against (null before any) and whether the denial may clear on its own (`retry`: the card
 * was still waiting for review, or the service window had not opened yet).
 */
export type Held =
  | { phase: 'none' }
  | { phase: 'opening' | 'open'; session: string }
  | { phase: 'locked'; session: string | null; retry: boolean };

export type LiveEvent =
  | { kind: 'unlock'; childId: string; session: string; code: string | null; inAt: string }
  | { kind: 'lock'; childId: string; outAt: string | null };

/**
 * The heartbeat diff. `unlock`: a check-in the page has not opened yet (new, or a fresh one after a checkout) or one
 * whose denial may have cleared. `lock`: the page holds (or is fetching) a card and the child is no longer checked
 * in under that check-in. Anything else is quiet.
 */
export function diffBeat(held: Readonly<Record<string, Held>>, checkins: readonly CheckinStatus[], childIds: readonly string[]): LiveEvent[] {
  const out: LiveEvent[] = [];
  for (const childId of childIds) {
    const h = held[childId] ?? { phase: 'none' };
    const p = presenceOf(checkins, childId);
    const holding = h.phase === 'opening' || h.phase === 'open';
    if (p.state === 'in') {
      if (holding && h.session === p.session) continue;
      if (h.phase === 'locked' && h.session === p.session && !h.retry) continue;
      // A new check-in while an old one is still open: close the old one first, then open the new one.
      if (holding) out.push({ kind: 'lock', childId, outAt: null });
      out.push({ kind: 'unlock', childId, session: p.session, code: p.code, inAt: p.inAt });
    } else if (holding) {
      out.push({ kind: 'lock', childId, outAt: p.state === 'out' ? p.outAt : null });
    }
  }
  return out;
}

/** Index of the lesson step that is on `now`, from the service start and each step's minutes (clamped to the ends). */
export function currentStepIndex(steps: readonly { minutes: number }[], startsAt: Date, now: Date): number {
  if (steps.length === 0) return 0;
  const elapsed = (now.getTime() - startsAt.getTime()) / 60_000;
  if (elapsed < 0) return 0;
  let edge = 0;
  for (let i = 0; i < steps.length; i++) {
    edge += Math.max(0, steps[i].minutes);
    if (elapsed < edge) return i;
  }
  return steps.length - 1;
}

const WINDOW_MS = 30 * 60_000;

/**
 * The service a live page opens on: the one asked for; else, among those whose access window (30 min either side)
 * holds `now`, the one in progress, then the next to start, then the latest; else the next to start; else the last.
 * null when there are none.
 */
export function pickService<S extends { id: string; startsAt: string; endsAt: string }>(services: readonly S[], now: Date, wanted?: string | null): S | null {
  if (services.length === 0) return null;
  const asked = wanted ? services.find((s) => s.id === wanted) : undefined;
  if (asked) return asked;
  const t = now.getTime();
  const sorted = [...services].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const open = sorted.filter((s) => t >= Date.parse(s.startsAt) - WINDOW_MS && t <= Date.parse(s.endsAt) + WINDOW_MS);
  return (
    open.find((s) => t >= Date.parse(s.startsAt) && t <= Date.parse(s.endsAt)) ??
    open.find((s) => Date.parse(s.startsAt) > t) ??
    open[open.length - 1] ??
    sorted.find((s) => Date.parse(s.startsAt) > t) ??
    sorted[sorted.length - 1]
  );
}
