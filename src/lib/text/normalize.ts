const ZERO_WIDTH = /[​-‍⁠﻿]/;
const SPACE = /\s/;

function foldChar(ch: string): string {
  switch (ch) {
    case '‘':
    case '’':
      return "'";
    case '“':
    case '”':
      return '"';
    case '–':
    case '—':
      return '-';
    default:
      return ch.toLowerCase();
  }
}

/** Lowercase, fold smart punctuation, collapse whitespace, strip zero-width. map[i] = original index of norm char i. */
export function normalizeForMatch(s: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ZERO_WIDTH.test(ch)) continue;
    if (SPACE.test(ch)) {
      if (pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      if (out.length > 0) {
        out.push(' ');
        map.push(pendingSpace);
      }
      pendingSpace = -1;
    }
    for (const c of foldChar(ch)) {
      out.push(c);
      map.push(i);
    }
  }
  return { norm: out.join(''), map };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Unicode-aware whole-word match on already-normalized text; multi-word tokens tolerate any whitespace. */
export function hasWord(normText: string, token: string): boolean {
  const body = escapeRegex(normalizeForMatch(token).norm).replace(/ /g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u').test(normText);
}
