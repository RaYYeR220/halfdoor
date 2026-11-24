// Markdown-aware normalization of a system output before scoring.
//
// The answer-key patterns are sentence-scoped (separators . ! ? ; • | and newline). Markdown breaks that:
// a heading, a table cell or a bullet under "Only these people may pick him up:" becomes a "sentence" of
// its own, so a correct summary loses its limiter facts and fires traps. This turns markdown structure into
// units the patterns can read, without joining plain prose sentences (so "Dad can pick him up. Grandma
// cannot." still scores as two sentences):
//   - code fences, **bold**, __bold__, *em*, _em_ and `code` markers are removed;
//   - a heading (#..., or a line that is bold and nothing else) becomes a prefix "Heading: " of the next unit;
//   - a table row becomes one unit, cells joined with ": "; separator rows are dropped;
//   - a list item is one unit; sentence breaks inside it become commas;
//   - a line ending in ":" followed by list items is a lead: each child item gets "Lead: " in front
//     (nested leads stack), and the lead is not emitted on its own;
//   - a few wordings the key lists do not cover are canonicalized (see VOCAB).
// Output: one unit per line.

type Vocab = [RegExp, string];

/** Wordings seen in the review (adjudication.json) that the key word lists miss; each keeps the meaning. */
export const VOCAB: Vocab[] = [
  // "Neither of his parents may collect him" (no "not"/"no" for the negation lists to find).
  [/\bneither\b/giu, 'not either'],
  // Spanish imperative/subjunctive of dar/poner after a negation or clitic: "NO le dé insulina".
  [/(?<![\p{L}])(no|le|les|se)\s+(?:dé|den|des)(?![\p{L}])/giu, '$1 dar'],
  [/(?<![\p{L}])(no|le|les|se)\s+(?:ponga|pongan|pongas)(?![\p{L}])/giu, '$1 poner'],
  // "No debe darse por hecho que 'nunca se escapa'" / "don't assume he never runs" = "it is not true that".
  [/(?<![\p{L}])no\s+(?:debe|deben|debes|hay que)\s+dar(?:se)?\s+por\s+hecho\s+que/giu, 'no es cierto que'],
  [/(?<![\p{L}])no\s+(?:asuma|asuman|asumas|suponga|supongan)\s+que/giu, 'no es cierto que'],
  [/\b(?:don['’]t|do not|never)\s+assume\s+(?:that\s+)?/giu, 'it is not true that '],
];

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/u;
const BOLD_LINE = /^\s*(?:\*\*|__)(?!.*(?:\*\*|__).*(?:\*\*|__))(.+?)(?:\*\*|__)\s*:?\s*$/u;
const TABLE_ROW = /^\s*\|.*\|\s*$/u;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/u;
const LIST_ITEM = /^(\s*)(?:[-*•+–—]|\d{1,2}[.)])\s+(.*)$/u;
const FENCE = /^\s*```/u;

/** Remove inline emphasis / code markers. */
export function stripInline(s: string): string {
  return s
    .replace(/(\*\*|__)(.+?)\1/gu, '$2')
    .replace(/(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}*])/gu, '$1')
    .replace(/(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}_])/gu, '$1')
    .replace(/`([^`\n]*)`/gu, '$1')
    .replace(/\*\*|__/gu, '')
    .trim();
}

/** Sentence breaks inside one unit become commas (decimals such as "2.5" are kept). */
function joinSentences(s: string): string {
  return s
    .replace(/[•|]/gu, ',')
    .replace(/([.!?;]+)["')\]”’]*\s+(?=\S)/gu, ', ')
    .trim();
}

function canon(s: string): string {
  let out = s;
  for (const [re, rep] of VOCAB) out = out.replace(re, rep);
  return out;
}

type Line = { kind: 'blank' | 'heading' | 'row' | 'sep' | 'item' | 'text'; indent: number; text: string };

function classify(raw: string): Line {
  if (!raw.trim()) return { kind: 'blank', indent: 0, text: '' };
  if (TABLE_SEP.test(raw) && raw.includes('-')) return { kind: 'sep', indent: 0, text: '' };
  if (TABLE_ROW.test(raw)) return { kind: 'row', indent: 0, text: raw };
  const h = HEADING.exec(raw);
  if (h) return { kind: 'heading', indent: 0, text: stripInline(h[1]) };
  const li = LIST_ITEM.exec(raw);
  if (li) return { kind: 'item', indent: li[1].replace(/\t/g, '    ').length, text: stripInline(li[2]) };
  // A bold-only line is a heading when it reads like one: short and not a full sentence.
  const b = BOLD_LINE.exec(raw);
  if (b && !/[.!?]\s*$/u.test(b[1]) && b[1].split(/\s+/u).length <= 10) return { kind: 'heading', indent: 0, text: stripInline(b[1]) };
  return { kind: 'text', indent: raw.length - raw.trimStart().length, text: stripInline(raw) };
}

const endsWithColon = (s: string) => /:\s*$/u.test(s);

/** One output unit and the kind of line it came from ('heading': a markdown heading or a bold-only heading line). */
export type Unit = { text: string; kind: 'heading' | 'row' | 'item' | 'text' };

/**
 * `carry` (default true): headings and leads are carried onto the next unit / list children and list items
 * become single units (for the sentence-scoped key patterns). `carry: false` keeps every heading, lead and
 * item as its own line with its own sentences (for counting sentences, e.g. the support metric).
 */
export function normalizeOutput(text: string, opts: { carry?: boolean } = {}): string {
  return normalizeUnits(text, opts)
    .map((u) => u.text)
    .join('\n');
}

/** normalizeOutput as a list of units, each tagged with the kind of line it came from (a carried unit takes its body's kind). */
export function normalizeUnits(text: string, opts: { carry?: boolean } = {}): Unit[] {
  const carry = opts.carry !== false;
  const lines = text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !FENCE.test(l))
    .map(classify);

  const units: Unit[] = [];
  let heading: string | null = null;
  /** Open leads: a list item (or text line, indent -1) ending in ":" that owns the deeper items after it. */
  const leads: { indent: number; text: string; childIndent?: number }[] = [];

  const emit = (u: string, kind: Unit['kind']) => {
    const body = u.trim();
    if (!body) return;
    if (!carry && heading) units.push({ text: canon(heading), kind: 'heading' });
    const withHeading = carry && heading ? `${heading.replace(/[:.]\s*$/u, '')}: ${body}` : body;
    heading = null;
    units.push({ text: canon(withHeading), kind });
  };
  const nextNonBlank = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j].kind !== 'blank') return lines[j];
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.kind === 'blank') continue;
    if (l.kind !== 'item') leads.length = 0;
    switch (l.kind) {
      case 'sep':
        break;
      case 'heading':
        if (heading) units.push({ text: canon(heading), kind: 'heading' }); // two headings in a row: the first stands alone
        heading = l.text;
        break;
      case 'row': {
        const cells = l.text
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => stripInline(c).replace(/[?:]+\s*$/u, '').trim())
          .filter(Boolean);
        emit(carry ? joinSentences(cells.join(': ')) : cells.join(': '), 'row');
        break;
      }
      case 'item': {
        while (leads.length && leads[leads.length - 1].indent >= l.indent) leads.pop();
        const next = nextNonBlank(i);
        if (carry && endsWithColon(l.text) && next?.kind === 'item' && next.indent > l.indent) {
          // A new lead at the level of a text lead's children replaces that text lead.
          while (leads.length && leads[leads.length - 1].indent < 0 && (leads[leads.length - 1].childIndent ?? 0) >= l.indent) leads.pop();
          leads.push({ indent: l.indent, text: joinSentences(l.text) });
          break;
        }
        if (!carry) {
          emit(l.text, 'item');
          break;
        }
        const prefix = leads.map((x) => x.text).join(' ');
        emit(joinSentences(prefix ? `${prefix} ${l.text}` : l.text), 'item');
        break;
      }
      case 'text': {
        const next = nextNonBlank(i);
        if (carry && endsWithColon(l.text) && next?.kind === 'item') {
          leads.push({ indent: -1, text: joinSentences(l.text), childIndent: next.indent });
          break;
        }
        emit(l.text, 'text');
        break;
      }
    }
  }
  if (heading) units.push({ text: canon(heading), kind: 'heading' });
  return units;
}
