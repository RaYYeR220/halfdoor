import type { Tag } from '@/lib/card/schema';

export type SupportLevel = 'all_morning' | 'parts' | 'none';
export type Skill = 'aac' | 'medical' | 'es';

export type SolverChild = {
  id: string;
  name: string;
  supportLevel: SupportLevel;
  tags: Tag[];
  gender: 'f' | 'm' | null;
  /** Buddies on this child's last approved services, most recent first (max 3). */
  lastBuddyIds: string[];
};

export type SolverBuddy = {
  id: string;
  name: string;
  /** Null (unknown) can never satisfy the bathroom_help same-gender rule. */
  gender: 'f' | 'm' | null;
  skills: Skill[];
  trainingAt: Date | null;
  backgroundExpiresAt: Date | null;
  busy: boolean;
};

export type Violation =
  | 'training_expired' | 'background_expired' | 'busy' | 'gender_rule' | 'needs_aac' | 'needs_medical';

export type SolveInput = { serviceDate: Date; children: SolverChild[]; buddies: SolverBuddy[] };

export type Assignment = { childId: string; buddyId: string; reasons: string[] };

export type Unassigned = {
  childId: string;
  violationsByBuddy: Record<string, Violation[]>;
  gapHints: { buddyId: string; fix: Violation }[];
};

export type SolveResult = { assignments: Assignment[]; unassigned: Unassigned[] };
