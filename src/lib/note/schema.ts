import { z } from 'zod';

export const MAX_NOTE_SENTENCES = 8;
export const MAX_SENTENCE_CHARS = 300;
export const MAX_MOMENT_NOTE_CHARS = 280;
export const MOMENT_KINDS = ['good', 'hard', 'break', 'bathroom', 'note'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export const NoteSentence = z.object({
  text: z.string().trim().min(1).max(MAX_SENTENCE_CHARS),
  evidence: z.array(z.string().min(1)).min(1),
});
export const NoteDraft = z.object({ sentences: z.array(NoteSentence).min(1).max(MAX_NOTE_SENTENCES) });
export type NoteDraft = z.infer<typeof NoteDraft>;

/** What the model (and the director's browser) sees of a moment. No child name, no ids other than the moment's own. */
export type MomentView = { id: string; step: string; kind: MomentKind; helped: string[]; note?: string };

export type DropReason = 'no_evidence' | 'invalid_shape' | 'too_long' | 'over_limit';
export type VerifiedNoteSentence = { text: string; evidence: string[]; flags: string[] };
export type VerifiedNote = { sentences: VerifiedNoteSentence[]; dropped: { text: string; reason: DropReason }[] };
