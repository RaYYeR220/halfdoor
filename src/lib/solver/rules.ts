import type { SolverBuddy, SolverChild, Violation } from './types';

const DAY = 24 * 3600_000;
export const TRAINING_VALID_DAYS = 365;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'd MMM' in UTC, e.g. "2 Oct". */
export function fmtDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function trainingExpiresAt(b: SolverBuddy): Date | null {
  return b.trainingAt ? new Date(b.trainingAt.getTime() + TRAINING_VALID_DAYS * DAY) : null;
}

export function eligibility(b: SolverBuddy, c: SolverChild, serviceDate: Date): { ok: boolean; violations: Violation[] } {
  const v: Violation[] = [];
  if (!b.trainingAt || serviceDate.getTime() - b.trainingAt.getTime() > TRAINING_VALID_DAYS * DAY) v.push('training_expired');
  if (!b.backgroundExpiresAt || b.backgroundExpiresAt.getTime() < serviceDate.getTime()) v.push('background_expired');
  if (b.busy) v.push('busy');
  if (c.tags.includes('bathroom_help') && (!c.gender || b.gender !== c.gender)) v.push('gender_rule');
  if (c.tags.includes('nonverbal_or_aac') && !b.skills.includes('aac')) v.push('needs_aac');
  if (c.tags.includes('medical_plan') && !b.skills.includes('medical')) v.push('needs_medical');
  return { ok: v.length === 0, violations: v };
}

/** How much of the child's recent history this buddy covers, 0..1. */
export function continuity(b: SolverBuddy, c: SolverChild): number {
  const recent = c.lastBuddyIds.slice(0, 3);
  if (recent.length === 0) return 0;
  return recent.filter((id) => id === b.id).length / recent.length;
}

function skillMatched(b: SolverBuddy, c: SolverChild): boolean {
  return (c.tags.includes('nonverbal_or_aac') && b.skills.includes('aac')) || (c.tags.includes('medical_plan') && b.skills.includes('medical'));
}

/** Cost = 10 - 6*continuity - 3*(spanish_home && es) - 2*(skill matched) + slot index. Lower is better. */
export function cost(b: SolverBuddy, c: SolverChild, slot: number): number {
  const es = c.tags.includes('spanish_home') && b.skills.includes('es');
  return 10 - 6 * continuity(b, c) - (es ? 3 : 0) - (skillMatched(b, c) ? 2 : 0) + slot;
}

export function reasonsFor(b: SolverBuddy, c: SolverChild): string[] {
  const out: string[] = [];
  const recent = c.lastBuddyIds.slice(0, 3);
  const n = recent.filter((id) => id === b.id).length;
  if (n > 0) {
    if (n === recent.length) out.push(n === 1 ? 'Same buddy as last Sunday' : `Same buddy as the last ${n} Sundays`);
    else out.push(`Same buddy as ${n} of the last ${recent.length} Sundays`);
  }
  if (c.tags.includes('spanish_home') && b.skills.includes('es')) out.push('Speaks Spanish');
  if (c.tags.includes('nonverbal_or_aac') && b.skills.includes('aac')) out.push('AAC experience');
  if (c.tags.includes('medical_plan') && b.skills.includes('medical')) out.push('Medical training');
  return out;
}

/** Plain-language gap explanation for one unassigned child. */
export function explainGap(
  child: SolverChild,
  hints: { buddyId: string; fix: Violation }[],
  buddies: SolverBuddy[],
  serviceLabel?: string,
): string[] {
  const need = child.tags.includes('nonverbal_or_aac') ? ' with AAC experience'
    : child.tags.includes('medical_plan') ? ' with medical training' : '';
  const at = serviceLabel ? ` at ${serviceLabel}` : '';
  const lines: string[] = [];
  for (const h of hints) {
    const b = buddies.find((x) => x.id === h.buddyId);
    if (!b) continue;
    let why: string;
    if (h.fix === 'training_expired') {
      const exp = trainingExpiresAt(b);
      why = exp ? `${b.name}'s inclusion training expired ${fmtDay(exp)}` : `${b.name} has no inclusion training on record`;
    } else {
      why = b.backgroundExpiresAt ? `${b.name}'s background check expired ${fmtDay(b.backgroundExpiresAt)}` : `${b.name} has no background check on record`;
    }
    lines.push(`${child.name} needs a buddy${need}${at} — ${why}`);
  }
  return lines.length > 0 ? lines : ['No trained buddy is free — ask a director to cover'];
}
