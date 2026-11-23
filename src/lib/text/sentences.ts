import type { Span } from './locate';

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'sra', 'srta', 'st', 'vs', 'e.g', 'i.e']);
const TRAILING = /["')\]”’]/;

function isAbbreviation(source: string, dotIndex: number): boolean {
  let k = dotIndex;
  while (k > 0 && /[\p{L}.]/u.test(source[k - 1])) k--;
  return ABBREVIATIONS.has(source.slice(k, dotIndex).toLowerCase());
}

/** Split into sentences on . ! ? and newlines. Spans are end-exclusive and trimmed. */
export function sentences(source: string): Span[] {
  const out: Span[] = [];
  let start = -1;
  const close = (end: number) => {
    if (start >= 0) {
      let e = end;
      while (e > start && /\s/.test(source[e - 1])) e--;
      if (e > start) out.push({ start, end: e });
    }
    start = -1;
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\n') {
      close(i);
      continue;
    }
    if (start < 0) {
      if (/\s/.test(ch)) continue;
      start = i;
    }
    if (ch === '.' || ch === '!' || ch === '?') {
      let j = i + 1;
      while (j < source.length && (/[.!?]/.test(source[j]) || TRAILING.test(source[j]))) j++;
      const atBoundary = j >= source.length || /\s/.test(source[j]);
      if (atBoundary && !(ch === '.' && j === i + 1 && isAbbreviation(source, i))) {
        close(j);
        i = j - 1;
      }
    }
  }
  close(source.length);
  return out;
}

/** The sentence holding `span`; merged across sentences if the span crosses a boundary. */
export function sentenceContaining(source: string, span: Span): Span {
  const all = sentences(source);
  const first = all.find((s) => s.end > span.start);
  const last = [...all].reverse().find((s) => s.start < span.end);
  if (!first || !last || last.end < first.end) return span;
  return { start: first.start, end: last.end };
}
