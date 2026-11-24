// Plain data the director desk passes from its server pages and routes to client components (no React, no server APIs).

export type CardStatus = 'draft' | 'parent_approved' | 'acknowledged' | 'returned' | 'archived';
export type SupportLevel = 'all_morning' | 'parts' | 'none';

/** One child on the Children list: the card's state, never its content. */
export type ChildRow = {
  id: string;
  firstName: string;
  grade: string | null;
  /** 'none' = no card yet. */
  status: CardStatus | 'none';
  supportLevel: SupportLevel | null;
  /** The card's language ('en' | 'es'), null without a card. */
  lang: string | null;
  /** Latest of the parent's approval and the director's acknowledgement (ISO), null without either. */
  updatedAt: string | null;
  /** First names of the child's parents. */
  parents: string[];
};

/** The church's clock as every desk page shows it (see lib/demo/clock and lib/parent/format). */
export type DeskClock = { tz: string; now: string; shiftMs: number };

export type DeskService = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
};

export type AssignmentRow = {
  id: string;
  childId: string;
  childName: string;
  buddyId: string;
  buddyName: string;
  status: 'proposed' | 'approved' | 'scheduled_in_pco';
  reasons: string[];
};

/** POST /api/assignments/solve's answer. */
export type SolveResult = {
  assignments: AssignmentRow[];
  unassigned: { childId: string; childName: string; hints: string[] }[];
  waitingForReview: { childId: string; name: string }[];
  notExpected: { childId: string; name: string }[];
  newFamily: { childId: string; name: string; note: string }[];
};

/** A child expected at a service, for the Sunday pack. */
export type PackChild = { id: string; firstName: string; lang: 'en' | 'es' };

/** A child with moments at one of today's services, for Notes. */
export type NoteChild = {
  childId: string;
  firstName: string;
  parents: string[];
  counts: { good: number; hard: number; break: number; bathroom: number; note: number };
  note: { status: 'draft' | 'approved'; approvedAt: string | null } | null;
};

export type NotesService = DeskService & { children: NoteChild[] };

export type PatternMoment = {
  id: string;
  serviceId: string;
  at: string;
  step: string;
  kind: 'good' | 'hard' | 'break' | 'bathroom' | 'note';
  helped: string[];
};

export type PatternView = {
  segment: string;
  kind: 'hard' | 'break';
  count: number;
  outOf: number;
  momentIds: string[];
  /** Every service where the child had this segment, oldest first, with what was logged in it. */
  services: { serviceId: string; startsAt: string; moments: PatternMoment[] }[];
};

export type ChildPatterns = { childId: string; firstName: string; patterns: PatternView[] };

export type LedgerAttestation = {
  provider: string;
  hardware: string | null;
  signature: 'verified' | 'pending' | 'unverified';
  /** Where Intel's signature was checked from: live Intel data or the saved snapshot. */
  source: 'live' | 'snapshot' | null;
  snapshotDate: string | null;
  checkedIn: 'browser' | 'node' | null;
  checkedAt: string | null;
  mrtdShort: string | null;
  tcbStatus: string | null;
};

export type LedgerRow = {
  id: string;
  at: string;
  purpose: 'card' | 'translate' | 'note' | 'lesson';
  model: string;
  e2ee: boolean;
  /** null = reserved / still running (cost is the worst-case estimate). */
  ok: boolean | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number;
  attestation: LedgerAttestation | null;
  /** The full record the browser reported, as stored. */
  attestationRaw: unknown;
  attestationMismatch: boolean;
};

export type LedgerTotals = {
  calls: number;
  e2ee: number;
  plain: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  running: number;
  failed: number;
};

export type Ledger = { rows: LedgerRow[]; totals: LedgerTotals; cap: { calls: number } | null };
