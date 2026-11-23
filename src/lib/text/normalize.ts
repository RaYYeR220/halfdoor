const ZERO_WIDTH = /[​-‍⁠﻿­]/;
const SPACE = /\s/;
const MARK = /\p{M}/u;

function foldChar(ch: string): string {
  switch (ch) {
    case '‘':
    case '’':
    case '´':
    case '`':
    case 'ʼ':
      return "'";
    case '“':
    case '”':
    case '«':
    case '»':
    case '‚':
    case '„':
      return '"';
    case '–':
    case '—':
    case '‑':
    case '−':
      return '-';
    default:
      return ch.toLowerCase();
  }
}

/** Lowercase, NFC-compose, fold smart punctuation, collapse whitespace, strip zero-width. map[i] = original index of norm char i. */
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
    // Compose base + combining marks so decomposed accents match; map points at the cluster start.
    let j = i + 1;
    while (j < s.length && MARK.test(s[j])) j++;
    for (const c of s.slice(i, j).normalize('NFC')) {
      for (const f of foldChar(c)) {
        out.push(f);
        map.push(i);
      }
    }
    i = j - 1;
  }
  return { norm: out.join(''), map };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordRegex(token: string): RegExp {
  const body = escapeRegex(token).replace(/ /g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u');
}

/** Unicode-aware whole-word match on already-normalized text; multi-word tokens tolerate any whitespace. */
export function hasWord(normText: string, token: string): boolean {
  return wordRegex(normalizeForMatch(token).norm).test(normText);
}

/** Case-sensitive whole-word match on raw text (for all-caps acronyms). */
export function hasWordExact(text: string, token: string): boolean {
  return wordRegex(token).test(text.normalize('NFC'));
}
