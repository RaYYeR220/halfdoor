// Browser-side card pipeline: redact -> enclave -> parse -> verify -> restore the name for display.
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { enclaveChat, type EnclaveChat, type NodeAccess } from '@/lib/venice/enclaveClient';
import { detectLang } from '@/lib/text/lang';
import { limiterTokens } from '@/lib/text/polarity';
import { sentenceContaining, stripListMarker } from '@/lib/text/sentences';
import { TRANSLATE_PLACEHOLDER, buildCardPrompt, buildTranslatePrompt, redactName, restoreName, toOriginalOffset } from './prompts';
import { findSafetyPrompts } from './safetyNet';
import { DraftItem, DraftTag, MAX_DRAFT_ITEMS, MAX_DRAFT_TAGS, SECTIONS, type CardItem, type DraftCard, type DroppedItem, type Section, type VerifiedCard } from './schema';
import { verifyCard } from './verify';

export const STORY_MIN = 40;
export const STORY_MAX = 6000;

export class StoryLengthError extends Error {
  constructor(readonly length: number) {
    super(`story must be ${STORY_MIN}-${STORY_MAX} characters`);
    this.name = 'StoryLengthError';
  }
}

export type PipelineOpts = {
  model: string;
  onAttestation?: (a: AttestationSummary) => void;
  signal?: AbortSignal;
  /** Injectable for tests; production default is enclaveChat. */
  chat?: EnclaveChat;
  node?: NodeAccess;
};

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
}

type ParsedDraft = { draft: DraftCard; invalid: DroppedItem[] };

const asSection = (v: unknown): Section | null => ((SECTIONS as readonly unknown[]).includes(v) ? (v as Section) : null);

/**
 * Tolerant draft parsing: null only when the text is not JSON or has no `items` array (the caller retries).
 * Items are validated one by one; a bad item is dropped as `invalid_shape`, a bad tag is dropped, the rest is kept.
 * Tag `item` indexes are remapped onto the kept items.
 */
export function parseDraft(text: string): ParsedDraft | null {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { items?: unknown }).items)) return null;
  const r = raw as { items: unknown[]; tags?: unknown };
  const items: DraftCard['items'] = [];
  const invalid: DroppedItem[] = [];
  const keptIndex = new Map<number, number>();
  r.items.forEach((x, i) => {
    const o = (x && typeof x === 'object' ? x : {}) as { section?: unknown; text?: unknown; quotes?: unknown };
    const quotes = Array.isArray(o.quotes) ? o.quotes.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 4) : o.quotes;
    const p = DraftItem.safeParse({ section: o.section, text: o.text, quotes });
    if (p.success && items.length < MAX_DRAFT_ITEMS) {
      keptIndex.set(i, items.length);
      items.push(p.data);
    } else {
      invalid.push({ section: asSection(o.section), text: typeof o.text === 'string' ? o.text.slice(0, 400) : '', reason: 'invalid_shape' });
    }
  });
  const tags: DraftCard['tags'] = [];
  for (const t of Array.isArray(r.tags) ? r.tags : []) {
    const p = DraftTag.safeParse(t);
    const item = p.success ? keptIndex.get(p.data.item) : undefined;
    if (p.success && item !== undefined && tags.length < MAX_DRAFT_TAGS) tags.push({ tag: p.data.tag, item });
  }
  return { draft: { items, tags }, invalid };
}

export async function draftCard(
  story: string,
  childName: string,
  opts: PipelineOpts,
): Promise<{ card: VerifiedCard; attestation: AttestationSummary }> {
  if (story.length < STORY_MIN || story.length > STORY_MAX) throw new StoryLengthError(story.length);
  const chat = opts.chat ?? enclaveChat;
  const { system, user } = buildCardPrompt(story, childName);
  const call = (u: string) =>
    chat({ model: opts.model, purpose: 'card', system, user: u, signal: opts.signal, onAttestation: opts.onAttestation, node: opts.node });

  let res = await call(user);
  let parsed = parseDraft(res.text);
  if (!parsed) {
    res = await call(`${user}\n\nReturn only JSON of the shape {"items":[{"section","text","quotes"}],"tags":[{"tag","item"}]} and nothing else.`);
    parsed = parseDraft(res.text);
  }
  if (!parsed) throw new Error('the model did not return a usable card');
  const { draft } = parsed;

  // The model saw the redacted story, so quotes are located there; then everything maps back.
  const red = redactName(story, childName);
  const v = verifyCard(red.text, draft);
  const back = (s: { start: number; end: number }) => ({
    start: toOriginalOffset(red, s.start, false),
    end: toOriginalOffset(red, s.end, true),
  });

  const items: CardItem[] = v.items.map((it) => {
    const quotes = it.quotes.map((q) => {
      const span = back(q.span);
      return { text: story.slice(span.start, span.end), span };
    });
    let text = restoreName(it.text, childName);
    if (it.kind === 'verbatim') {
      // Rebuild from the original story's sentences; never run verbatim text through name restoration.
      const sents = it.quotes.map((q) => sentenceContaining(red.text, q.span));
      const used = sents.filter((s) => it.text.includes(stripListMarker(red.text.slice(s.start, s.end))));
      const uniq = new Map<number, { start: number; end: number }>();
      for (const s of used.length > 0 ? used : sents) {
        const o = back(s);
        uniq.set(o.start, o);
      }
      text = [...uniq.values()]
        .sort((x, y) => x.start - y.start)
        .map((o) => stripListMarker(story.slice(o.start, o.end)))
        .join(' ');
    }
    return { ...it, text, quotes };
  });

  const lang = detectLang(story);
  const covered = items.filter((i) => i.section === 'safety').flatMap((i) => i.quotes.map((q) => sentenceContaining(story, q.span)));
  const card: VerifiedCard = {
    lang,
    items,
    tags: v.tags,
    dropped: [...parsed.invalid, ...v.dropped].map((d) => ({ ...d, text: restoreName(d.text, childName) })),
    safetyPrompts: findSafetyPrompts(story, lang, covered),
  };
  return { card, attestation: res.attestation };
}

/** `childName` is required so a caller cannot forget redaction. */
export async function translateCard(card: VerifiedCard, opts: PipelineOpts & { childName: string }): Promise<VerifiedCard> {
  if (card.lang === 'other' || card.items.length === 0) return card;
  const target = card.lang === 'en' ? 'es' : 'en';
  const chat = opts.chat ?? enclaveChat;
  const { system, user } = buildTranslatePrompt(card.items, opts.childName);
  const res = await chat({
    model: opts.model, purpose: 'translate', system, user, signal: opts.signal, onAttestation: opts.onAttestation, node: opts.node,
  });

  let byId: Map<string, string>;
  try {
    const j = extractJson(res.text) as { translations?: { id?: unknown; text?: unknown }[] };
    byId = new Map(
      (j.translations ?? []).flatMap((t) => (typeof t.id === 'string' && typeof t.text === 'string' && t.text.trim() ? [[t.id, restoreName(t.text, opts.childName, TRANSLATE_PLACEHOLDER)] as const] : [])),
    );
  } catch {
    throw new Error('the model did not return usable translations');
  }

  return {
    ...card,
    items: card.items.map((it) => {
      const text = byId.get(it.id);
      if (text === undefined) return it;
      const withheld = limiterTokens(it.text, card.lang).length > 0 && limiterTokens(text, target).length === 0;
      return { ...it, translation: { lang: target, text, withheld } };
    }),
  };
}
