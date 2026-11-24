// Plain data the parent page passes from the server to its client components (no React, no server APIs).
import type { CardView } from '@/lib/card/view';

/** One card_access_log row as the parent sees it: names, never ids of other people. */
export type AccessRow = {
  id: string;
  /** First name of whoever opened it; null when that person is no longer in the church. */
  who: string | null;
  /** The viewer's own row (their own reads are not listed; their deletion is). */
  me: boolean;
  role: string;
  reason: 'checked_in' | 'director' | 'parent' | 'room_safety' | 'deleted';
  openedAt: string;
  /** null = still open (a buddy or room leader while the child is checked in). */
  closedAt: string | null;
};

/** The approved assignment the timeline shows: the next one today or later, else the latest past one. */
export type MatchInfo = { buddy: string | null; serviceLabel: string; startsAt: string };

export type NoteView = { id: string; serviceLabel: string | null; serviceStartsAt: string | null; approvedAt: string | null; sentences: string[] };

export type ChildRef = { id: string; firstName: string; gender: 'f' | 'm' | null };

export type ChildPageData = {
  child: ChildRef;
  card: CardView | null;
  match: MatchInfo | null;
  access: AccessRow[];
  notes: NoteView[];
  /** The church's time zone: every time on the page is shown in it, on the server and in the browser alike. */
  tz: string;
  /** Server time when the page was read (for "Today" / "Yesterday"). */
  now: string;
  /** The demo church's clock offset (lib/demo/clock), added to every time shown; 0 for a real church. */
  clockShiftMs: number;
};
