// Pure helpers for the director desk: reason chips, the children filter, the AI ledger's totals and attestation
// record, and flagged-word runs in a note sentence. Plain data in, plain data out; shared by server and client.
import { judgmentFlags } from '@/lib/note/verify';
import type { CardStatus, ChildRow, LedgerAttestation, LedgerRow, LedgerTotals } from './types';

// ---------------------------------------------------------------- buddy match reasons

export type ReasonKind = 'continuity' | 'language' | 'skill' | 'new_family' | 'other';
export type ReasonChip = { label: string; kind: ReasonKind; tone: 'neutral' | 'accent' };

/** The solver's plain reasons ("Same buddy as the last 3 Sundays", "Speaks Spanish", …) as chips. */
export function reasonChip(reason: string): ReasonChip {
  const label = reason.trim();
  const kind: ReasonKind = /^same buddy as/i.test(label)
    ? 'continuity'
    : /^speaks /i.test(label)
      ? 'language'
      : /^(aac experience|medical training)$/i.test(label)
        ? 'skill'
        : /^new family/i.test(label)
          ? 'new_family'
          : 'other';
  // A new family is the one reason that asks something of the director, so it is the one that stands out.
  return { label, kind, tone: kind === 'new_family' ? 'accent' : 'neutral' };
}

// ---------------------------------------------------------------- children list

export type ChildFilter = 'all' | 'review' | 'returned' | 'reviewed' | 'none';
export const CHILD_FILTERS: readonly ChildFilter[] = ['all', 'review', 'returned', 'reviewed', 'none'];

/** Which filter chip a child falls under (besides "all"). */
export function filterOf(status: CardStatus | 'none'): Exclude<ChildFilter, 'all'> {
  if (status === 'parent_approved') return 'review';
  if (status === 'returned') return 'returned';
  if (status === 'acknowledged') return 'reviewed';
  return 'none'; // no card, a draft the parent hasn't approved, or archived
}

export function filterCounts(rows: readonly Pick<ChildRow, 'status'>[]): Record<ChildFilter, number> {
  const out: Record<ChildFilter, number> = { all: rows.length, review: 0, returned: 0, reviewed: 0, none: 0 };
  for (const r of rows) out[filterOf(r.status)] += 1;
  return out;
}

const ORDER: Record<Exclude<ChildFilter, 'all'>, number> = { review: 0, returned: 1, reviewed: 2, none: 3 };

/** Cards waiting for the director first, then sent back, reviewed, none; by name within each. */
export function sortChildren<T extends Pick<ChildRow, 'status' | 'firstName'>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => ORDER[filterOf(a.status)] - ORDER[filterOf(b.status)] || a.firstName.localeCompare(b.firstName));
}

// ---------------------------------------------------------------- AI ledger

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The stored attestation record (what the browser reported) as the ledger shows it; null when there is none. */
export function toLedgerAttestation(raw: unknown): LedgerAttestation | null {
  const a = obj(raw);
  if (!a) return null;
  const q = obj(a.quote) ?? {};
  const sig = q.signature === 'verified' || q.signature === 'pending' || q.signature === 'unverified' ? q.signature : 'unverified';
  const source = q.signatureSource === 'live' || q.signatureSource === 'snapshot' ? q.signatureSource : null;
  const mrtd = str(q.mrtdShort) ?? (str(q.mrtd) ? `${String(q.mrtd).slice(0, 16)}…` : null);
  return {
    provider: str(a.provider) ?? 'unknown',
    hardware: str(a.hardware),
    signature: sig,
    source,
    snapshotDate: source === 'snapshot' ? (str(q.snapshotCapturedAt)?.slice(0, 10) ?? null) : null,
    checkedIn: q.signatureCheckedIn === 'browser' || q.signatureCheckedIn === 'node' ? q.signatureCheckedIn : null,
    checkedAt: str(a.checkedAt),
    mrtdShort: mrtd,
    tcbStatus: str(q.tcbStatus),
  };
}

/** Sums over the ledger. Running calls count at their reserved (worst-case) cost, as the caps do. */
export function ledgerTotals(rows: readonly Pick<LedgerRow, 'e2ee' | 'ok' | 'tokensIn' | 'tokensOut' | 'costUsd'>[]): LedgerTotals {
  const t: LedgerTotals = { calls: 0, e2ee: 0, plain: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, running: 0, failed: 0 };
  for (const r of rows) {
    t.calls += 1;
    if (r.e2ee) t.e2ee += 1;
    else t.plain += 1;
    t.tokensIn += r.tokensIn ?? 0;
    t.tokensOut += r.tokensOut ?? 0;
    t.costUsd += Number.isFinite(r.costUsd) ? r.costUsd : 0;
    if (r.ok === null) t.running += 1;
    if (r.ok === false) t.failed += 1;
  }
  t.costUsd = Math.round(t.costUsd * 1e6) / 1e6;
  return t;
}

/** "$0.0072", "$0.0003", "<$0.0001", "$0" — four decimals, because single calls cost fractions of a cent. */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n < 0.0001) return '<$0.0001';
  // Fractions of a cent need 4 decimals; from $0.10 up, cents are enough.
  return `$${n < 0.1 ? n.toFixed(4) : n.toFixed(2)}`;
}

// ---------------------------------------------------------------- note sentences

export type FlagRun = { text: string; flagged: boolean };

/** A note sentence cut into runs, the judgment words (lib/note/verify) marked. Concatenated runs = the sentence. */
export function flagRuns(text: string, lang: 'en' | 'es'): FlagRun[] {
  const flags = judgmentFlags(text, lang);
  if (flags.length === 0) return text ? [{ text, flagged: false }] : [];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${flags.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const out: FlagRun[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i), flagged: false });
    out.push({ text: m[0], flagged: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), flagged: false });
  return out;
}

/**
 * Which judgment words are flagged in which sentence, as one string. The director's "I've reviewed the flagged words"
 * tick holds for this exact set: editing, adding or removing a flagged word (or the sentence holding it) asks again.
 */
export function flagSignature(sentences: readonly { text: string }[], lang: 'en' | 'es'): string {
  return sentences
    .map((s, i) => {
      const words = flagRuns(s.text, lang).filter((r) => r.flagged).map((r) => r.text.toLowerCase());
      return words.length ? `${i}:${words.join(',')}` : '';
    })
    .filter(Boolean)
    .join('|');
}
