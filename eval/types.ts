// Eval answer-key types. In the repo, `Tag` comes from the Task 3 card module
// (TAGS const); it is copied here as a string union so this folder stands alone.
export type Tag =
  | 'noise_sensitive'
  | 'crowds_hard'
  | 'transitions_hard'
  | 'needs_breaks'
  | 'needs_visual_schedule'
  | 'nonverbal_or_aac'
  | 'touch_sensitive'
  | 'sensory_seeking'
  | 'mobility_aid'
  | 'bathroom_help'
  | 'food_allergy'
  | 'medical_plan'
  | 'pickup_restriction'
  | 'elopement_risk'
  | 'spanish_home';

export type KeyFact = {
  id: string;
  kind: 'allergy' | 'medical' | 'medication' | 'pickup' | 'wandering' | 'other_safety';
  must: string[][] /* AND of OR-groups of case-insensitive regex sources */;
  limiter: boolean;
};

export type Trap = { id: string; pattern: string; why: string };

export type EvalStory = {
  id: string;
  lang: 'en' | 'es';
  text: string;
  facts: KeyFact[];
  traps: Trap[];
  tags: Tag[];
};
