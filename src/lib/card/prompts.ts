import { SECTIONS, TAGS, type CardItem } from './schema';

export const CHILD_PLACEHOLDER = 'the child';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type Redaction = {
  text: string;
  /** Replaced segments: [start,end) in the redacted text <-> [start,end) in the original. */
  segments: { rs: number; re: number; os: number; oe: number }[];
};

/** Replace the child's first name (and its possessive) with "the child", keeping an offset map. */
export function redactName(story: string, childName: string, placeholder: string = CHILD_PLACEHOLDER): Redaction {
  const name = childName.trim();
  if (!name) return { text: story, segments: [] };
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(['’]s)?(?![\\p{L}\\p{N}])`, 'giu');
  let out = '';
  let last = 0;
  const segments: Redaction['segments'] = [];
  for (const m of story.matchAll(re)) {
    const os = m.index!;
    out += story.slice(last, os);
    const rep = placeholder + (m[1] ? "'s" : '');
    segments.push({ rs: out.length, re: out.length + rep.length, os, oe: os + m[0].length });
    out += rep;
    last = os + m[0].length;
  }
  out += story.slice(last);
  return { text: out, segments };
}

/** Map an offset in the redacted text back to the original. `end` rounds outward inside a replacement. */
export function toOriginalOffset(r: Redaction, p: number, end: boolean): number {
  let delta = 0;
  for (const s of r.segments) {
    if (p >= s.re) delta += s.oe - s.os - (s.re - s.rs);
    else if (p > s.rs && p < s.re) return end ? s.oe : s.os;
    else if (p === s.rs) return s.os;
  }
  return p + delta;
}

/** Put the name back into model text ("the child's" -> "Leo's"). */
export function restoreName(text: string, childName: string, placeholder: string = CHILD_PLACEHOLDER): string {
  const name = childName.trim();
  if (!name) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(placeholder)}(['’]s)?(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(re, (_m, poss: string | undefined) => name + (poss ? "'s" : ''));
}

/** Token used in place of the name when translating (survives into Spanish text unlike "the child"). */
export const TRANSLATE_PLACEHOLDER = '[CHILD]';

export function buildCardPrompt(story: string, childName: string): { system: string; user: string } {
  const system = [
    "You turn a parent's note about their child into a support card for a children's ministry volunteer.",
    'Return ONLY JSON of this exact shape, no prose, no code fence:',
    '{"items":[{"section":"...","text":"...","quotes":["..."]}],"tags":[{"tag":"...","item":0}]}',
    `section is one of: ${SECTIONS.join(', ')}.`,
    `tag is one of: ${TAGS.join(', ')}; "item" is the 0-based index in items.`,
    "Rules: every item needs 1-4 quotes copied character-for-character from the parent's text. Never add diagnoses or labels the parent did not use.",
    "Write each item text in the SAME language as the parent's text (English text gives English items, Spanish gives Spanish), short and concrete. Keep every not/never/only/no longer exactly as said.",
    'Safety = allergies, medical needs, medication, pickup/custody limits, wandering. Omit nothing safety-related; put each in section "safety".',
  ].join('\n');
  return { system, user: redactName(story, childName).text };
}

export function buildTranslatePrompt(items: CardItem[], childName = ''): { system: string; user: string } {
  const system = [
    'Translate each item text between English and Spanish (English becomes Spanish, Spanish becomes English).',
    'Return ONLY JSON: {"translations":[{"id":"...","text":"..."}]} with one entry per input id, same ids.',
    'Keep every negation and limiter (not, never, only, no longer, no, nunca, solo, ya no) unchanged in meaning. Keep the token [CHILD] exactly as written. Add nothing.',
  ].join('\n');
  return { system, user: JSON.stringify({ items: items.map((i) => ({ id: i.id, text: redactName(i.text, childName, TRANSLATE_PLACEHOLDER).text })) }) };
}
