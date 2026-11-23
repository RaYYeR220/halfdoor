import { normalizeForMatch } from './normalize';

export type Span = { start: number; end: number };

function toSpan(source: string, map: number[], from: number, len: number): Span {
  let end = map[from + len - 1] + 1;
  while (end < source.length && /\p{M}/u.test(source[end])) end++;
  return { start: map[from], end };
}

/** Drop everything except letters, digits and single spaces; keep a map back to the input indices. */
function stripPunctuation(norm: string, map: number[]): { text: string; map: number[] } {
  const out: string[] = [];
  const outMap: number[] = [];
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    if (/[\p{L}\p{N}]/u.test(ch)) {
      out.push(ch);
      outMap.push(map[i]);
    } else if (ch === ' ' && out.length > 0 && out[out.length - 1] !== ' ') {
      out.push(' ');
      outMap.push(map[i]);
    }
  }
  while (out[out.length - 1] === ' ') {
    out.pop();
    outMap.pop();
  }
  return { text: out.join(''), map: outMap };
}

/** Find `quote` in `source`; returns end-exclusive offsets into the ORIGINAL source. */
export function locateQuote(source: string, quote: string): Span | null {
  const src = normalizeForMatch(source);
  const q = normalizeForMatch(quote).norm;
  if (!q) return null;
  const idx = src.norm.indexOf(q);
  if (idx >= 0) return toSpan(source, src.map, idx, q.length);

  const ls = stripPunctuation(src.norm, src.map);
  const lq = stripPunctuation(q, Array.from(q, (_, i) => i)).text;
  if (!lq) return null;
  const j = ls.text.indexOf(lq);
  return j >= 0 ? toSpan(source, ls.map, j, lq.length) : null;
}
