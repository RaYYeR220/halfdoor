// Where the parent's card is: Approved by you · Reviewed by the kids' team · Matched with a buddy · Opened on
// Sunday. Derived from the card's own status and dates, the child's approved assignments and the access log.
import type { CardView } from '@/lib/card/view';
import type { AccessRow, MatchInfo } from './types';

export type StepKey = 'approved' | 'reviewed' | 'matched' | 'opened';
/** 'attention' = the kids' team sent the card back with a question. */
export type StepState = 'done' | 'current' | 'todo' | 'attention';
export type TimelineStep = { key: StepKey; state: StepState; at: string | null; who: string | null };

export type TimelineInput = {
  status: CardView['status'] | null;
  parentApprovedAt: string | null;
  directorAckAt: string | null;
  match: MatchInfo | null;
  access: readonly AccessRow[];
};

const time = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/**
 * Steps follow each other: once one is not done, the ones after it wait. An edit re-approves the card and voids
 * the review, so the later steps start over for the new version; only buddy openings after the latest review count.
 */
export function deriveTimeline(i: TimelineInput): TimelineStep[] {
  const approved = !!i.parentApprovedAt && (i.status === 'parent_approved' || i.status === 'acknowledged' || i.status === 'returned');
  const reviewed = i.status === 'acknowledged' && !!i.directorAckAt;
  const ackAt = time(i.directorAckAt);
  const opening = reviewed
    ? [...i.access].filter((r) => r.reason === 'checked_in' && time(r.openedAt) >= ackAt).sort((a, b) => time(b.openedAt) - time(a.openedAt))[0]
    : undefined;

  const raw: { key: StepKey; done: boolean; attention?: boolean; at: string | null; who: string | null }[] = [
    { key: 'approved', done: approved, at: approved ? i.parentApprovedAt : null, who: null },
    { key: 'reviewed', done: reviewed, attention: i.status === 'returned', at: reviewed ? i.directorAckAt : null, who: null },
    { key: 'matched', done: !!i.match, at: i.match?.startsAt ?? null, who: i.match?.buddy ?? null },
    { key: 'opened', done: !!opening, at: opening?.openedAt ?? null, who: opening?.who ?? null },
  ];

  const out: TimelineStep[] = [];
  let blocked = false;
  for (const s of raw) {
    if (!blocked && s.done) {
      out.push({ key: s.key, state: 'done', at: s.at, who: s.who });
      continue;
    }
    out.push({ key: s.key, state: blocked ? 'todo' : s.attention ? 'attention' : 'current', at: null, who: null });
    blocked = true;
  }
  return out;
}
