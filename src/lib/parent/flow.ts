// Small pieces of the parent page's state machine, kept pure so they can be tested without a browser.

export type ServerView = 'write' | 'approved' | 'returned';

/** What the stored card says the page should show when the parent is not in the middle of something. */
export function serverViewOf(card: { status: string } | null): ServerView {
  if (!card || card.status === 'draft' || card.status === 'archived') return 'write';
  return card.status === 'returned' ? 'returned' : 'approved';
}

/**
 * The approval this browser just sent has reached the page: the server's card is approved at (at least) the version
 * the PUT returned. Until then the review stays on screen, so a re-approval never flashes the previous version.
 */
export function approvalLanded(server: { view: ServerView; version: number | null }, approvedVersion: number | null): boolean {
  return approvedVersion !== null && server.view === 'approved' && (server.version ?? 0) >= approvedVersion;
}

export type Run = {
  readonly signal: AbortSignal;
  /** Still the newest run and not aborted: only then may its callbacks touch the page. */
  live(): boolean;
};

/**
 * One piece of enclave work at a time (a draft, then possibly its translation). Starting a run aborts the one before;
 * a late callback from an aborted or replaced run sees live() === false and is ignored.
 */
export function runTracker() {
  let seq = 0;
  let cur: { id: number; ac: AbortController } | null = null;
  const handle = (id: number, ac: AbortController): Run => ({ signal: ac.signal, live: () => cur?.id === id && !ac.signal.aborted });
  return {
    start(): Run {
      cur?.ac.abort();
      const ac = new AbortController();
      seq += 1;
      cur = { id: seq, ac };
      return handle(seq, ac);
    },
    /** The current run when it is still live (a draft's translation belongs to the draft's run). */
    current(): Run | null {
      return cur && !cur.ac.signal.aborted ? handle(cur.id, cur.ac) : null;
    },
    abort(): void {
      cur?.ac.abort();
      cur = null;
    },
  };
}
