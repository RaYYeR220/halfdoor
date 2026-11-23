// SERVER-ONLY. The director's lesson text -> schedule steps. The model only restructures; code verifies.
import { z } from 'zod';
import { estimatePlainUsd, finalizeAiCall, reserveBudget, type BudgetReason } from '@/lib/venice/budget';
import { claudeJson, LESSON_MODEL } from '@/lib/venice/claude';
import { locateQuote, type Span } from '@/lib/text/locate';
import { SEGMENTS, SENSORY_LOADS, type Step } from './segments';

export const MAX_LESSON_CHARS = 8000;
export const MIN_LESSON_CHARS = 40;
export const MAX_LESSON_MINUTES = 120;
const MAX_TOKENS = 1200;

export const LessonDraft = z.object({
  title: z.string().min(1).max(120),
  steps: z.array(z.object({
    key: z.string().min(1).max(40),
    label: z.string().min(1).max(40),
    segment: z.enum(SEGMENTS),
    sensoryLoad: z.enum(SENSORY_LOADS),
    minutes: z.number().int().min(1).max(60),
  })).min(3).max(12),
  bigIdeaQuote: z.string().min(1),
  verseRef: z.string().max(60).nullable(),
});
export type LessonDraft = z.infer<typeof LessonDraft>;

/** Strict JSON schema sent to the model (mirrors LessonDraft; bounds are re-checked by zod). */
export const LESSON_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'steps', 'bigIdeaQuote', 'verseRef'],
  properties: {
    title: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'label', 'segment', 'sensoryLoad', 'minutes'],
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          segment: { type: 'string', enum: [...SEGMENTS] },
          sensoryLoad: { type: 'string', enum: [...SENSORY_LOADS] },
          minutes: { type: 'integer' },
        },
      },
    },
    bigIdeaQuote: { type: 'string' },
    verseRef: { type: ['string', 'null'] },
  },
} as const;

export const LESSON_SYSTEM_PROMPT = [
  'You restructure a children\'s ministry lesson plan into a visual schedule. You never write teaching, doctrine, stories or advice.',
  'Return JSON only, matching the schema.',
  '- title: the lesson\'s own title, or a short plain one drawn from its text.',
  '- steps: the lesson\'s activities in order, between 3 and 12. Each step has: key (lowercase letters and underscores, unique), label (at most 6 words, plain), segment (exactly one of: ' + SEGMENTS.join(', ') + '), sensoryLoad (low, med or high: how loud, crowded or stimulating it is for a child), minutes (whole number 1 to 60, from the lesson or a sensible estimate).',
  '- bigIdeaQuote: copy the lesson\'s big-idea sentence EXACTLY, character for character, from the lesson text. Do not reword it.',
  '- verseRef: the key Bible reference named in the lesson (for example "Isaiah 9:6"), or null when none is named. Never quote verse text.',
].join('\n');

export type LessonCallOptions = {
  churchId: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

/** Why a draft could not be produced. Codes only. */
export class LessonDraftError extends Error {
  constructor(public readonly code: 'too_long' | 'too_short' | 'no_key' | 'upstream' | 'invalid_output' | BudgetReason) {
    super(code);
  }
}

function parseDraft(content: string): LessonDraft | null {
  const raw = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const r = LessonDraft.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * One reserve-then-settle call per attempt; a second attempt only when the output was not valid JSON for the schema.
 * Spend is recorded in ai_calls (purpose `lesson`, e2ee false).
 */
export async function lessonToDraft(lessonText: string, o: LessonCallOptions): Promise<LessonDraft> {
  if (lessonText.length > MAX_LESSON_CHARS) throw new LessonDraftError('too_long');
  if (lessonText.trim().length < MIN_LESSON_CHARS) throw new LessonDraftError('too_short');
  const apiKey = o.apiKey ?? process.env.VENICE_API_KEY;
  if (!apiKey) throw new LessonDraftError('no_key');
  const user = `Lesson text:\n"""\n${lessonText}\n"""`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const reserved = await reserveBudget({
      churchId: o.churchId, purpose: 'lesson', model: LESSON_MODEL, e2ee: false,
      estimateUsd: estimatePlainUsd(LESSON_MODEL, LESSON_SYSTEM_PROMPT.length + user.length, MAX_TOKENS),
    });
    if (!reserved.ok) throw new LessonDraftError(reserved.reason);
    let res;
    try {
      res = await claudeJson({
        apiKey, system: LESSON_SYSTEM_PROMPT, user, schemaName: 'lesson_draft', schema: LESSON_JSON_SCHEMA,
        maxTokens: MAX_TOKENS, fetchImpl: o.fetchImpl,
      });
    } catch {
      await finalizeAiCall(reserved.id, { ok: false, model: LESSON_MODEL }); // network failure: the estimate stays
      throw new LessonDraftError('upstream');
    }
    if (!res.ok) {
      await finalizeAiCall(reserved.id, { ok: false, model: LESSON_MODEL, free: true });
      throw new LessonDraftError('upstream');
    }
    const draft = parseDraft(res.content);
    await finalizeAiCall(reserved.id, { ok: draft !== null, model: LESSON_MODEL, usage: res.usage });
    if (draft) return draft;
  }
  throw new LessonDraftError('invalid_output');
}

export type VerifiedLesson = {
  title: string;
  steps: Step[];
  bigIdeaQuote: string;
  bigIdeaSpan: Span;
  verseRef: string | null;
  totalMinutes: number;
};

export type LessonError = 'big_idea_not_in_lesson' | 'duplicate_step_key' | 'total_minutes_over_120' | 'bad_label';

export const MAX_LABEL_WORDS = 6;
export const MAX_LABEL_CHARS = 40;
export const MAX_LABEL_WORD_CHARS = 20;

/** NFKC (folds fullwidth lookalikes) and trim: the form a label is checked in and stored as. */
export const normalizeLabel = (label: string): string => label.normalize('NFKC').trim();

/** Labels reach the child-facing pack, so code (not the prompt) holds them to short plain words. */
export function labelOk(label: string): boolean {
  const t = normalizeLabel(label);
  if (!t || t.length > MAX_LABEL_CHARS) return false;
  // Control/format/separator characters and invisible filler code points (Hangul fillers, braille blank).
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u3164\u2800\u115F\u1160\uFFA0]/u.test(t)) return false;
  if (/:\/\/|www\.|@/i.test(t) || /[\p{L}\p{N}-]+\.\p{L}{2,}/u.test(t)) return false;
  if (!/\p{L}/u.test(t)) return false; // digits/symbols only
  const words = t.split(/\s+/);
  return words.length <= MAX_LABEL_WORDS && words.every((w) => w.length <= MAX_LABEL_WORD_CHARS);
}

export function verifyLesson(source: string, d: LessonDraft): { ok: true; lesson: VerifiedLesson } | { ok: false; errors: LessonError[] } {
  const errors: LessonError[] = [];
  const span = locateQuote(source, d.bigIdeaQuote);
  if (!span) errors.push('big_idea_not_in_lesson');
  if (new Set(d.steps.map((s) => s.key)).size !== d.steps.length) errors.push('duplicate_step_key');
  if (d.steps.some((x) => !labelOk(x.label))) errors.push('bad_label');
  const totalMinutes = d.steps.reduce((n, s) => n + s.minutes, 0);
  if (totalMinutes > MAX_LESSON_MINUTES) errors.push('total_minutes_over_120');
  if (errors.length > 0 || !span) return { ok: false, errors };
  return {
    ok: true,
    lesson: {
      title: d.title.trim(),
      steps: d.steps.map((s) => ({ ...s, label: normalizeLabel(s.label) })),
      // The church's own words, as they stand in the source (not the model's copy).
      bigIdeaQuote: source.slice(span.start, span.end),
      bigIdeaSpan: span,
      verseRef: d.verseRef?.trim() || null,
      totalMinutes,
    },
  };
}
