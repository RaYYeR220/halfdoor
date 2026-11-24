// Splits the parent's own text into plain runs and marked runs, so every card line can light up the words it
// came from. Pure: offsets in, segments out.
import type { CardItem, SafetyPrompt } from '@/lib/card/schema';

export type MarkTone = 'line' | 'safety' | 'prompt';

/** Something that points at parts of the text: a card line (id `i<n>`) or a safety question (id `p:<prompt id>`). */
export type MarkSource = { id: string; tone: MarkTone; spans: { start: number; end: number }[] };

/** A run of the text. `ids` lists every source covering the whole run; `tone` is the strongest of them. */
export type Segment = { start: number; end: number; ids: string[]; tone: MarkTone | null };

const RANK: Record<MarkTone, number> = { safety: 3, line: 2, prompt: 1 };

export const promptMarkId = (promptId: string) => `p:${promptId}`;

export function markSources(items: readonly CardItem[], prompts: readonly SafetyPrompt[] = []): MarkSource[] {
  return [
    ...items.map((i) => ({ id: i.id, tone: (i.section === 'safety' ? 'safety' : 'line') as MarkTone, spans: i.quotes.map((q) => q.span) })),
    ...prompts.map((p) => ({ id: promptMarkId(p.id), tone: 'prompt' as const, spans: [p.span] })),
  ];
}

/**
 * Cuts [0, length) at every span edge, then labels each run with the sources covering it. Overlapping quotes
 * share a run (both ids); spans outside the text are clipped; adjacent runs with the same sources are merged.
 */
export function buildSegments(length: number, sources: readonly MarkSource[]): Segment[] {
  if (length <= 0) return [];
  const clipped = sources.map((s) => ({
    ...s,
    spans: s.spans
      .map((x) => ({ start: Math.max(0, Math.min(length, x.start)), end: Math.max(0, Math.min(length, x.end)) }))
      .filter((x) => x.end > x.start),
  }));
  const cuts = new Set<number>([0, length]);
  for (const s of clipped) for (const x of s.spans) cuts.add(x.start).add(x.end);
  const edges = [...cuts].sort((a, b) => a - b);

  const out: Segment[] = [];
  for (let k = 0; k < edges.length - 1; k++) {
    const start = edges[k];
    const end = edges[k + 1];
    const covering = clipped.filter((s) => s.spans.some((x) => x.start <= start && x.end >= end));
    const ids = covering.map((s) => s.id);
    const tone = covering.reduce<MarkTone | null>((best, s) => (!best || RANK[s.tone] > RANK[best] ? s.tone : best), null);
    const prev = out.at(-1);
    if (prev && prev.end === start && prev.ids.join(' ') === ids.join(' ')) prev.end = end;
    else out.push({ start, end, ids, tone });
  }
  return out;
}

/** The ids of the card lines (not prompts) that quote this run, for "tap the words, find the line". */
export const lineIdsOf = (segment: Segment) => segment.ids.filter((id) => !id.startsWith('p:'));
