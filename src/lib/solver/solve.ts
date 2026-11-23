import { hungarian, INF } from './hungarian';
import { cost, eligibility, reasonsFor } from './rules';
import type { Assignment, SolveInput, SolveResult, SolverBuddy, SolverChild, Unassigned, Violation } from './types';

export { eligibility, explainGap } from './rules';

const byNameThenId = <T extends { name: string; id: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** Column j = buddy floor(j / slots), slot j % slots. */
function runPhase(
  children: SolverChild[], buddies: SolverBuddy[], slots: number, serviceDate: Date,
): { pairs: { child: SolverChild; buddy: SolverBuddy }[]; missed: SolverChild[] } {
  if (children.length === 0) return { pairs: [], missed: [] };
  const cols = buddies.flatMap((b, rank) => Array.from({ length: slots }, (_, slot) => ({ b, rank, slot })));
  const matrix = children.map((c) => cols.map(({ b, rank, slot }) =>
    // Tiny rank term: exact ties resolve toward the buddy first by name (total stays far below 1).
    eligibility(b, c, serviceDate).ok ? cost(b, c, slot) + rank * 1e-4 : INF));
  const pick = hungarian(matrix);
  const pairs: { child: SolverChild; buddy: SolverBuddy }[] = [];
  const missed: SolverChild[] = [];
  children.forEach((c, i) => (pick[i] >= 0 ? pairs.push({ child: c, buddy: cols[pick[i]].b }) : missed.push(c)));
  return { pairs, missed };
}

export function solve(input: SolveInput): SolveResult {
  const children = input.children.filter((c) => c.supportLevel !== 'none').sort(byNameThenId);
  const buddies = [...input.buddies].sort(byNameThenId);
  const { serviceDate } = input;

  // Phase 1: all-morning children get a buddy to themselves. Phase 2: part-morning children share what is left, two per buddy.
  const morning = runPhase(children.filter((c) => c.supportLevel === 'all_morning'), buddies, 1, serviceDate);
  const taken = new Set(morning.pairs.map((p) => p.buddy.id));
  const parts = runPhase(children.filter((c) => c.supportLevel === 'parts'), buddies.filter((b) => !taken.has(b.id)), 2, serviceDate);

  const assignments: Assignment[] = [];
  for (const { child, buddy } of morning.pairs) assignments.push({ childId: child.id, buddyId: buddy.id, reasons: reasonsFor(buddy, child) });
  for (const { child, buddy } of parts.pairs) {
    const reasons = reasonsFor(buddy, child);
    for (const m of parts.pairs.filter((p) => p.buddy.id === buddy.id && p.child.id !== child.id)) {
      reasons.push(`Shares with ${m.child.name} (both part of the morning)`);
    }
    assignments.push({ childId: child.id, buddyId: buddy.id, reasons });
  }

  const unassigned: Unassigned[] = [...morning.missed, ...parts.missed].map((c) => {
    const violationsByBuddy: Record<string, Violation[]> = {};
    const gapHints: Unassigned['gapHints'] = [];
    for (const b of buddies) {
      const { ok, violations } = eligibility(b, c, serviceDate);
      if (ok) continue; // eligible, just out of capacity
      violationsByBuddy[b.id] = violations;
      if (violations.length === 1 && (violations[0] === 'training_expired' || violations[0] === 'background_expired')) {
        gapHints.push({ buddyId: b.id, fix: violations[0] });
      }
    }
    return { childId: c.id, violationsByBuddy, gapHints };
  });
  return { assignments, unassigned };
}
