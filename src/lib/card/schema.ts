import { z } from 'zod';
import type { Lang } from '@/lib/text/lang';
import type { Span } from '@/lib/text/locate';

export const SECTIONS = ['loves', 'communicates', 'hard', 'helps', 'signs', 'needs', 'avoid', 'safety'] as const;
export type Section = (typeof SECTIONS)[number];

export const TAGS = [
  'noise_sensitive', 'crowds_hard', 'transitions_hard', 'needs_breaks', 'needs_visual_schedule',
  'nonverbal_or_aac', 'touch_sensitive', 'sensory_seeking', 'mobility_aid', 'bathroom_help',
  'food_allergy', 'medical_plan', 'pickup_restriction', 'elopement_risk', 'spanish_home',
] as const;
export type Tag = (typeof TAGS)[number];

export const MAX_DRAFT_ITEMS = 40;
export const MAX_DRAFT_TAGS = 20;
export const DraftItem = z.object({
  section: z.enum(SECTIONS),
  text: z.string().min(1).max(400),
  quotes: z.array(z.string().min(1)).min(1).max(4),
});
export const DraftTag = z.object({ tag: z.enum(TAGS), item: z.number().int().min(0) });
export const DraftCard = z.object({
  items: z.array(DraftItem).max(MAX_DRAFT_ITEMS),
  tags: z.array(DraftTag).max(MAX_DRAFT_TAGS),
});
export type DraftCard = z.infer<typeof DraftCard>;

export type CardItem = {
  /** `i<n>`: position in verifier output order (stable for a given source + draft). */
  id: string;
  section: Section;
  text: string;
  kind: 'paraphrase' | 'verbatim';
  quotes: { text: string; span: Span }[];
  translation: { lang: 'en' | 'es'; text: string; withheld: boolean } | null;
};

/** `invalid_shape`: the model's item did not fit the draft schema (unknown section, no usable quote, wrong types); `section` is null when it was not a known section. */
export type DroppedItem = { section: Section | null; text: string; reason: 'quote_not_found' | 'unsaid_label' | 'invalid_shape' };

/** `id` is `s<start offset of the sentence>`. */
export type SafetyPrompt = { id: string; sentence: string; span: Span; matched: string };

export type VerifiedCard = {
  lang: Lang;
  items: CardItem[];
  dropped: DroppedItem[];
  safetyPrompts: SafetyPrompt[];
  tags: Tag[];
};
