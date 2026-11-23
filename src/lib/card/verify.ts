import { detectLang, type Lang } from '@/lib/text/lang';
import { unsaidLabels } from '@/lib/text/labels';
import { locateQuote, type Span } from '@/lib/text/locate';
import { polarityConsistent } from '@/lib/text/polarity';
import { sentenceContaining } from '@/lib/text/sentences';
import { findSafetyPrompts } from './safetyNet';
import type { CardItem, DraftCard, DroppedItem, Tag, VerifiedCard } from './schema';

export { SAFETY_LEXICON } from './safetyNet';

/** Union of the sentences holding each span, in source order, joined by a single space. */
function sentenceText(source: string, spans: Span[]): string {
  const uniq = new Map<number, Span>();
  for (const s of spans) {
    const sent = sentenceContaining(source, s);
    uniq.set(sent.start, sent);
  }
  return [...uniq.values()]
    .sort((a, b) => a.start - b.start)
    .map((s) => source.slice(s.start, s.end))
    .join(' ');
}

function sentenceSpan(source: string, item: CardItem): Span {
  const spans = item.quotes.map((q) => sentenceContaining(source, q.span));
  return { start: Math.min(...spans.map((s) => s.start)), end: Math.max(...spans.map((s) => s.end)) };
}

export function verifyCard(source: string, draft: DraftCard): VerifiedCard {
  const lang: Lang = detectLang(source);
  const items: CardItem[] = [];
  const dropped: DroppedItem[] = [];
  const survived = new Set<number>();

  draft.items.forEach((d, idx) => {
    const quotes: { text: string; span: Span }[] = [];
    for (const q of d.quotes) {
      const span = locateQuote(source, q);
      if (span) quotes.push({ text: source.slice(span.start, span.end), span });
    }
    if (quotes.length === 0) {
      dropped.push({ section: d.section, text: d.text, reason: 'quote_not_found' });
      return;
    }
    const verbatimText = sentenceText(source, quotes.map((q) => q.span));
    let text = verbatimText;
    let kind: CardItem['kind'] = 'verbatim';

    if (d.section !== 'safety' && lang !== 'other') {
      if (unsaidLabels(d.text, source).length > 0) {
        dropped.push({ section: d.section, text: d.text, reason: 'unsaid_label' });
        return;
      }
      // Polarity is judged against the quoted sentences, not the whole story.
      if (polarityConsistent(verbatimText, d.text, lang)) {
        text = d.text;
        kind = 'paraphrase';
      } else {
        text = sentenceText(source, [quotes[0].span]);
      }
    }

    survived.add(idx);
    items.push({ id: `i${items.length}`, section: d.section, text, kind, quotes, translation: null });
  });

  const tags: Tag[] = [];
  for (const t of draft.tags) {
    if (survived.has(t.item) && !tags.includes(t.tag)) tags.push(t.tag);
  }

  const covered = items.filter((i) => i.section === 'safety').map((i) => sentenceSpan(source, i));
  return { lang, items, dropped, safetyPrompts: findSafetyPrompts(source, lang, covered), tags };
}

/** Promote a safety-net prompt into a verbatim `safety` item (id `i<n>` = next position). */
export function acceptSafetyPrompt(card: VerifiedCard, source: string, promptId: string): VerifiedCard {
  const prompt = card.safetyPrompts.find((p) => p.id === promptId);
  if (!prompt) return card;
  const sentence = source.slice(prompt.span.start, prompt.span.end);
  const item: CardItem = {
    id: `i${card.items.length}`,
    section: 'safety',
    text: sentence,
    kind: 'verbatim',
    quotes: [{ text: sentence, span: prompt.span }],
    translation: null,
  };
  return { ...card, items: [...card.items, item], safetyPrompts: card.safetyPrompts.filter((p) => p.id !== promptId) };
}
