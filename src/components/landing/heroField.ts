// The hero's glyph field. Maria's paragraph is the field; her letters assemble Leo's card, the card is locked until
// check-in, opens at 8:52, locks at 10:14 and the letters go home. Every flight is routed: up/down a free gutter
// beside the text, then along the card row's own lane, so a letter never crosses the type and never lands on another
// letter. Ported from the approved prototype; startHeroField() returns a stop function that undoes everything.

export type HeroElements = {
  stage: HTMLElement;
  field: HTMLCanvasElement;
  fly: HTMLCanvasElement;
  nav: HTMLElement;
  h1: HTMLElement;
  sub: HTMLElement;
  ctas: HTMLElement;
  proof: HTMLElement;
  hint: HTMLElement;
  card: HTMLElement;
  chip: HTMLButtonElement;
  live: HTMLElement;
};

/** Maria's paragraph, exactly as she wrote it. The card's DOM text must match LINES (checked at start). */
export const MARIA =
  'Leo is 7. He loves trains and the color yellow. Loud music hurts his ears so he wears his blue headphones during worship. When he starts humming loudly and covering his face he needs a quiet break. He used to be allergic to eggs but he outgrew it last year. He IS allergic to peanuts - he has an EpiPen in his backpack. His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.';

/** Card lines in card order: [her quote, card value] (null value = copied word for word). */
export const LINES: readonly [string, string | null][] = [
  ['He loves trains and the color yellow.', 'Trains and the color yellow'],
  ['Loud music hurts his ears', 'Loud music hurts his ears'],
  ['he wears his blue headphones during worship', 'Blue headphones during worship'],
  ['When he starts humming loudly and covering his face he needs a quiet break.', 'Humming loudly + covering his face → he needs a quiet break'],
  ['He IS allergic to peanuts - he has an EpiPen in his backpack.', null],
  ['His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.', null],
  ['He used to be allergic to eggs but he outgrew it last year.', null],
];

/** What the card shows on each line. */
export const CARD_VALUES = LINES.map(([src, dst]) => dst ?? src);

type Box = { l: number; t: number; r: number; b: number };
type Span = [number, number];
type Flight = {
  dir: 'in' | 'out';
  kind: 'route' | 'row' | 'fade';
  t0: number;
  dur: number;
  S?: { x: number; y: number };
  R?: number;
  ox?: number;
  oy?: number;
  cx?: number;
  cy?: number;
  sF?: number;
  sQ?: number;
};
type Piece = {
  k: number;
  kind: 'q' | 'c' | 'a';
  lines: Span[];
  color: string;
  alpha: number;
  fs: number;
  sc: number;
  tr: number;
  lh: number;
  gl: { i: number; lx: number; ly: number }[];
  lw: number[];
  w: number;
  hb: number;
  x: number;
  y: number;
  amp: number;
  R: number;
  box: Box | null;
  sw: Box[] | null;
  rest: Box | null;
  cx: number;
  cy: number;
  hidden: boolean;
  w1: number;
  w2: number;
  ph: number;
};
type Glyph = {
  ch: string;
  i: number;
  line: number;
  di: number;
  tch: string;
  pc: Piece | null;
  lx: number;
  ly: number;
  hx: number;
  hy: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  cl: number;
  qx: number;
  qy: number;
  f: Flight | null;
  inCard: boolean;
  land: number;
  lit: number;
  backAt: number;
  backKind: string;
  st: string;
};
type Ghost = { k: number; di: number; ch: string; a: number; x: number; y: number; on: number };
type Item = { g?: Glyph; k: number; x: number; y: number; s: number; ch: string; a: number; c: string; fly: boolean; away?: number; echo?: boolean };
type RowQuote = { s: number; echoes: { i: number; x: number; y: number }[]; t0: number; dur: number };
type Snap = Pick<Piece, 'x' | 'y' | 'fs' | 'amp' | 'R' | 'box' | 'sw' | 'rest' | 'cx' | 'cy' | 'hidden'>;

declare global {
  interface Window {
    __viol?: unknown[];
    __vcount?: number;
    __ff?: number;
    __fg?: number;
    __hd?: { mode: string; chip: () => string; rows: () => string[]; W: number; H: number };
  }
}

export function startHeroField(el: HeroElements): () => void {
  const { stage, field: fieldC, fly: flyC, card, chip, live } = el;
  const fx = fieldC.getContext('2d');
  const gx = flyC.getContext('2d');
  const mctx = document.createElement('canvas').getContext('2d');
  if (!fx || !gx || !mctx) return () => {};
  const lis = [...card.querySelectorAll<HTMLElement>('.lines li')];
  const vals = lis.map((li) => li.querySelector<HTMLElement>('.val')!);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEBUG = /[?&]debug\b/.test(location.search);

  // ---------- teardown bookkeeping: every timer, frame and listener is undone by stop()
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timers.delete(id); if (!stopped) fn(); }, ms);
    timers.add(id);
    return id;
  };
  let raf = 0;
  let io: IntersectionObserver | null = null;

  // canvas colours come from the tokens: ink for the field and the card, accent-deep for her letters while they
  // are lit or in flight (6.0:1 on the ground, 6.6:1 on the card), accent for the faint marks where they left
  const TOK = getComputedStyle(stage);
  const tok = (n: string, d: string) => (TOK.getPropertyValue(n).trim() || d).slice(0, 7);
  const INK = tok('--ink', '#1a1816'), YEL = tok('--accent-deep', '#a3335f'), MUTE = tok('--ink-muted', '#6a655e'), MARK = tok('--accent', '#c2457a');
  const FACE = '"General Sans", system-ui, sans-serif';
  const BASE = 14.5, ASC = 0.74, DSC = 0.24; // card size; glyph ink box in em
  const LIFT = 220, STAG_IN = 800, STAG_OUT = 600;

  // Maria's paragraph, then her attribution
  const FIELD = '“' + MARIA + '” — Maria, Leo’s mom';
  // the paragraph as field pieces, in her order; k = the card line the piece feeds (-1 / -2: stays in the field)
  const SEGS: [string, number][] = [
    ['“Leo is 7.', -1],
    ['He loves trains and the color yellow.', 0],
    ['Loud music hurts his ears', 1],
    ['so he wears his blue headphones during worship.', 2],
    ['When he starts humming loudly and covering his face he needs a quiet break.', 3],
    ['He used to be allergic to eggs but he outgrew it last year.', 6],
    ['He IS allergic to peanuts - he has an EpiPen in his backpack.', 4],
    ['His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.”', 5],
    ['— Maria, Leo’s mom', -2],
  ];

  // ---------- utils
  const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const easeIO = (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
  const sstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const cI = hex(INK), cY = hex(YEL);
  const col = (t: number) => { t = clamp(t); return `rgb(${cY.map((c, i) => Math.round(mix(c, cI[i], t))).join(',')})`; };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = (a: Box, b: Box, p = 0) => a.l < b.r + p && b.l < a.r + p && a.t < b.b + p && b.t < a.b + p;
  const hitsXY = (a: Box, b: Box, px: number, py: number) => a.l < b.r + px && b.l < a.r + px && a.t < b.b + py && b.t < a.b + py;
  const rel = (r: DOMRect, sr: DOMRect): Box => ({ l: r.left - sr.left, t: r.top - sr.top, r: r.right - sr.left, b: r.bottom - sr.top });
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ADV: Record<400 | 500, Map<string, number>> = { 400: new Map(), 500: new Map() };
  const adv = (ch: string, w: 400 | 500 = 400) => {
    const m = ADV[w];
    let v = m.get(ch);
    if (v == null) { mctx.font = `${w} ${BASE}px ${FACE}`; v = mctx.measureText(ch).width; m.set(ch, v); }
    return v;
  };

  // ---------- glyphs: one per character of FIELD, nothing repeated, nothing added
  const G: Glyph[] = [...FIELD].map((ch, i) => ({
    ch, i, line: -1, di: -1, tch: ch, pc: null, lx: 0, ly: 0, hx: 0, hy: 0, px: 0, py: 0, tx: 0, ty: 0, cl: 0, qx: 0, qy: 0,
    f: null, inCard: false, land: 0, lit: 0, backAt: 0, backKind: '', st: 'home',
  }));
  const segs: { s: number; e: number; k: number; text: string }[] = [];
  { let c = 0; SEGS.forEach(([t, k]) => { const s = FIELD.indexOf(t, c); segs.push({ s, e: s + t.length, k, text: t }); c = s + t.length; }); }
  const segOfLine: number[] = [];
  segs.forEach((sg, j) => { if (sg.k >= 0) segOfLine[sg.k] = j; });

  // map each card-value char to a char of her quote, word by word, in order; -1 = not her words (+, →)
  function mapLine(src: string, dst: string) {
    const s = src.toLowerCase(), out: number[] = new Array(dst.length).fill(-2);
    let cur = 0, m: RegExpExecArray | null;
    const re = /\S+/g;
    while ((m = re.exec(dst))) {
      const tk = m[0].toLowerCase();
      const r = new RegExp('(^|[^a-z])(' + esc(tk) + ')(?![a-z])', 'g');
      r.lastIndex = Math.max(0, cur - 1);
      const f = r.exec(s);
      if (f) { const st = f.index + f[1].length; for (let q = 0; q < tk.length; q++) out[m.index + q] = st + q; cur = st + tk.length; }
      else for (let q = 0; q < tk.length; q++) out[m.index + q] = -1;
    }
    return out;
  }
  const byLine: Glyph[][] = LINES.map(() => []);
  const ghosts: Ghost[] = [];
  LINES.forEach(([src, dst], k) => {
    const start = FIELD.indexOf(src, segs[segOfLine[k]].s);
    const D = dst == null ? src : dst;
    const map = dst == null ? [...D].map((_, i) => i) : mapLine(src, D);
    map.forEach((si, di) => {
      if (D[di] === ' ') return;
      if (si >= 0) { const g = G[start + si]; g.line = k; g.di = di; g.tch = D[di]; byLine[k].push(g); }
      else ghosts.push({ k, di, ch: D[di], a: 0, x: 0, y: 0, on: 0 });
    });
    byLine[k].sort((a, b) => a.di - b.di);
    if (vals[k].textContent !== D) console.warn('card line mismatch', k);
  });
  const USED = byLine.flat();

  // ---------- state
  let W = 0, H = 0, VH = 0, DPR = 1, mode: 'route' | 'inrow' = 'route', ready = false, visible = true;
  let chrome: Box[] = [], cardR: Box = { l: 0, t: 0, r: 0, b: 0 };
  const laneR: Box[] = [], labR: Box[] = [], E: { x: number; y: number }[] = [], lineYs: number[][] = [];
  let pieces: Piece[] = [], rowQ: RowQuote[] = [];
  const rowState: string[] = LINES.map(() => 'empty'); // empty | in | card | out
  const phA = LINES.map(() => 1); // placeholder bar alpha
  const mouse = { x: -9999, y: -9999 };

  const mkPiece = (k: number, kind: Piece['kind'], lines: Span[], color: string, alpha = 0): Piece => ({
    k, kind, lines, color, alpha, fs: 0, sc: 1, tr: 0, lh: 0, gl: [], lw: [], w: 0, hb: 0, x: 0, y: 0, amp: 0, R: 0,
    box: null, sw: null, rest: null, cx: 0, cy: 0, hidden: false, w1: 0, w2: 0, ph: 0,
  });

  // ---------- measuring the page
  function textRects(node: Element) { const rg = document.createRange(); rg.selectNodeContents(node); return [...rg.getClientRects()]; }
  function measure() {
    const sr = stage.getBoundingClientRect();
    chrome = [];
    const push = (r: DOMRect) => { if (r.width > 0 && r.height > 0) chrome.push(rel(r, sr)); };
    el.nav.querySelectorAll('a').forEach((a) => push(a.getBoundingClientRect()));
    [el.h1, el.sub, el.proof, el.hint].forEach((n) => textRects(n).forEach(push));
    el.ctas.querySelectorAll('a').forEach((a) => push(a.getBoundingClientRect()));
    cardR = rel(card.getBoundingClientRect(), sr);
    mctx!.font = `400 ${BASE}px ${FACE}`;
    const fasc = mctx!.measureText('Hg').fontBoundingBoxAscent || BASE * 0.95;
    const rg = document.createRange();
    vals.forEach((v, k) => {
      const node = v.firstChild!;
      const pos = (di: number) => { rg.setStart(node, di); rg.setEnd(node, di + 1); const r = rg.getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top + fasc }; };
      const p0 = pos(0);
      E[k] = { x: p0.x, y: p0.y };
      byLine[k].forEach((g) => { const p = pos(g.di); g.tx = p.x; g.ty = p.y; });
      ghosts.forEach((h) => { if (h.k === k) { const p = pos(h.di); h.x = p.x; h.y = p.y; } });
      const ys = [...new Set(byLine[k].map((g) => Math.round(g.ty)))].sort((a, b) => a - b);
      byLine[k].forEach((g) => { g.cl = ys.indexOf(Math.round(g.ty)); });
      lineYs[k] = ys;
      laneR[k] = rel(lis[k].getBoundingClientRect(), sr);
      labR[k] = rel(lis[k].querySelector('.lab')!.getBoundingClientRect(), sr);
    });
  }

  // ---------- field pieces
  const trim = (a: number, b: number): Span => { while (a < b && FIELD[a] === ' ') a++; while (b > a && FIELD[b - 1] === ' ') b--; return [a, b]; };
  // a quote piece breaks its lines exactly where the card breaks the line it feeds, so every
  // letter keeps its line and its order on the way: the run can never fold over itself
  function quoteLines(k: number) {
    const sg = segs[segOfLine[k]], lines: Span[] = [];
    let a = sg.s;
    for (let li = 1; li < lineYs[k].length; li++) { const g = byLine[k].find((g) => g.cl === li); if (g) { lines.push(trim(a, g.i)); a = g.i; } }
    lines.push(trim(a, sg.e));
    return lines;
  }
  function measurePiece(pc: Piece, fs: number) {
    pc.fs = fs; pc.sc = fs / BASE; pc.tr = fs * 0.02; pc.lh = Math.round(fs * 1.6);
    pc.gl = []; pc.lw = [];
    pc.lines.forEach(([a, b], li) => { let ox = 0; for (let i = a; i < b; i++) { pc.gl.push({ i, lx: ox, ly: li * pc.lh }); ox += adv(FIELD[i], 500) * pc.sc + pc.tr; } pc.lw.push(ox - pc.tr); });
    pc.w = Math.max(...pc.lw); pc.hb = (pc.lines.length - 1) * pc.lh;
  }
  const pBox = (pc: Piece, x: number, y: number, px = 0, py = 0): Box => ({ l: x - px, t: y - pc.fs * 0.8 - py, r: x + pc.w + px, b: y + pc.hb + pc.fs * 0.28 + py });
  function commit(pc: Piece) {
    pc.gl.forEach((o) => { const g = G[o.i]; g.pc = pc; g.lx = o.lx; g.ly = o.ly; g.hx = pc.x + o.lx; g.hy = pc.y + o.ly; });
    pc.w1 = 0.17 + rnd() * 0.1; pc.w2 = 0.12 + rnd() * 0.08; pc.ph = rnd() * 6.283;
  }
  function sway(pc: Piece, t: number): [number, number] {
    if (reduced) return [0, 0];
    const T = t / 1000;
    return [Math.sin(T * pc.w1 + pc.ph) * pc.amp, Math.sin(T * pc.w2 + pc.ph * 1.7) * pc.amp * 0.22];
  }
  const origin = (pc: Piece, t: number) => { const s = sway(pc, t); return { x: pc.x + s[0], y: pc.y + s[1] }; };
  function home(g: Glyph, t: number, withPart = true): [number, number] {
    const pc = g.pc!;
    const s = sway(pc, t);
    const wv = reduced ? 0 : Math.sin(g.hx / 150 + t / 2000 + pc.ph) * 1.1;
    return [g.hx + s[0] + (withPart ? g.px : 0), g.hy + s[1] + wv + (withPart ? g.py : 0)];
  }

  // ---------- the route: vertical in the gutter, a rounded corner, then along the card row's lane
  function routeAt(S: { x: number; y: number }, Ek: { x: number; y: number }, u: number, inbound: boolean, R: number) {
    const dx = Ek.x - S.x, dy = Ek.y - S.y, sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
    const r = Math.max(0, Math.min(R, Math.abs(dy), Math.abs(dx) / 2));
    const L1 = Math.abs(dy) - r, A = (Math.PI / 2) * r, L2 = Math.abs(dx) - r, L = L1 + A + L2;
    const s = (inbound ? u : 1 - u) * L;
    let x: number, y: number;
    if (s <= L1) { x = S.x; y = S.y + sy * s; }
    else if (s <= L1 + A) { const th = (s - L1) / (r || 1), cx = S.x + sx * r, cy = Ek.y - sy * r; x = cx - sx * r * Math.cos(th); y = cy + sy * r * Math.sin(th); }
    else { x = S.x + sx * (r + (s - L1 - A)); y = Ek.y; }
    return { x, y, m: easeIO((s - L1) / (A + L2 || 1)), L };
  }
  // every box a run occupies along its route (vertical leg as one union box, then samples)
  function sweep(pc: Piece, x: number, y: number, R: number) {
    const k = pc.k, Ek = E[k], lo = new Map(pc.gl.map((o) => [o.i, o])), out: Box[] = [];
    const box = (ax: number, ay: number, m: number): Box => {
      const s = mix(pc.sc, 1, m);
      let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
      for (const g of byLine[k]) {
        const o = lo.get(g.i)!, X = ax + mix(o.lx, g.tx - Ek.x, m), Y = ay + mix(o.ly, g.ty - Ek.y, m);
        l = Math.min(l, X); r = Math.max(r, X + adv(g.tch, 400) * s); t = Math.min(t, Y - ASC * BASE * s - 1.5); b = Math.max(b, Y + DSC * BASE * s + 1.5);
      }
      return { l, t, r, b };
    };
    const st0 = routeAt({ x, y }, Ek, 0, true, R);
    const dy = Ek.y - y, r = Math.max(0, Math.min(R, Math.abs(dy), Math.abs(Ek.x - x) / 2));
    const yv = Ek.y - (Math.sign(dy) || 1) * r;
    const a = box(x, y, 0), b = box(x, yv, 0);
    out.push({ l: Math.min(a.l, b.l) - pc.amp, r: Math.max(a.r, b.r) + pc.amp, t: Math.min(a.t, b.t) - 3, b: Math.max(a.b, b.b) + 3 });
    const L1 = Math.abs(dy) - r;
    for (let n = 0; n <= 44; n++) {
      const u = (L1 + ((st0.L - L1) * n) / 44) / (st0.L || 1);
      const st = routeAt({ x, y }, Ek, u, true, R);
      out.push(box(st.x, st.y, st.m));
    }
    return out;
  }
  // a box in flight may not touch the type, and inside the card it must stay in its own row's lane
  function boxOK(b: Box, k: number) {
    if (b.l < 4 || b.r > W - 4 || b.t < 72) return false;
    for (const c of chrome) if (hits(b, c, 8)) return false;
    if (hits(b, cardR)) { const ln = laneR[k]; if (b.t < ln.t || b.b > ln.b) return false; }
    return true;
  }

  // depth: smaller = nearer and brighter; size choices depend on how long the sentence is
  // on the light ground: 2.1 → 1.6:1, quiet, warm, never read as body text (the card and her lit letters carry the reading)
  const ALPHA = (fs: number) => (fs <= 12.5 ? 0.34 : fs <= 13.5 ? 0.3 : fs <= 15 ? 0.26 : 0.22);
  function sizesFor(pc: Piece) {
    const n = Math.max(...pc.lines.map(([a, b]) => b - a));
    return n <= 30 ? [13.5, 15, 17] : n <= 46 ? [12, 12.5, 13.5] : W < 1400 ? [10.5, 11, 11.5] : [11.5, 12];
  }
  // the words a quote leaves behind in the field (e.g. "He loves", "so he wears his") stay put: later routes avoid them
  function restBox(pc: Piece, x: number, y: number): Box | null {
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
    pc.gl.forEach((o) => {
      if (FIELD[o.i] === ' ' || G[o.i].line === pc.k) return;
      const X = x + o.lx, Y = y + o.ly;
      l = Math.min(l, X); r = Math.max(r, X + adv(FIELD[o.i], 500) * pc.sc); t = Math.min(t, Y - pc.fs * 0.8); b = Math.max(b, Y + pc.fs * 0.28);
    });
    return l > r ? null : { l: l - pc.amp - 2, r: r + pc.amp + 2, t: t - 3, b: b + 3 };
  }
  const snapOf = (pc: Piece): Snap => ({ x: pc.x, y: pc.y, fs: pc.fs, amp: pc.amp, R: pc.R, box: pc.box, sw: pc.sw, rest: pc.rest, cx: pc.cx, cy: pc.cy, hidden: pc.hidden });
  function placeRoute() {
    const M = W > 1700 ? 64 : 36, top = 96, bot = VH - 16;
    const qps = LINES.map((_, k) => mkPiece(k, 'q', quoteLines(k), INK));
    const conns = segs.filter((s) => s.k < 0).map((s) => mkPiece(s.k, 'c', [trim(s.s, s.e)], s.k === -2 ? MUTE : INK));
    const sols: { score: number; snap: Snap[] }[] = [];
    for (let pass = 0; pass < 2 && !sols.length; pass++) {
      const strict = pass === 0;
      for (let att = 0; att < 80 && sols.length < 5; att++) {
        seed = 7 + att * 7919 + Math.round(W) * 13 + Math.round(VH);
        const flip = att % 2, placed: Piece[] = [];
        let ok = true;
        for (const pc of qps) {
          const side = (pc.k + flip) % 2 ? 'R' : 'L', sizes = sizesFor(pc);
          let best: (Snap & { score: number }) | null = null;
          for (let c = 0, found = 0; c < 160 && found < 12; c++) {
            measurePiece(pc, sizes[Math.floor(rnd() * sizes.length)]);
            pc.amp = pc.fs > 13 ? 12 : 8;
            const xlo = side === 'L' ? M : cardR.r + 30, xhi = side === 'L' ? cardR.l - 30 - pc.w : W - M - pc.w;
            if (xhi < xlo) continue;
            const x = mix(xlo, xhi, rnd()), y = mix(top + pc.fs, bot - pc.hb - 4, rnd());
            const bx = pBox(pc, x, y, pc.amp + 4, 4);
            if (bx.t < top - 8 || bx.b > bot) continue;
            if (chrome.some((c) => hits(bx, c, 12)) || hits(bx, cardR, 16)) continue;
            if (placed.some((o) => hits(bx, o.box!, 20))) continue;
            if (strict && placed.some((o) => o.sw!.some((s) => hits(bx, s, 6)))) continue;
            const R = side === 'L' ? Math.min(40, cardR.l - 12 - (x + pc.w + pc.amp)) : Math.min(40, x - pc.amp - cardR.r - 12);
            if (R < 0) continue;
            const sw = sweep(pc, x, y, R);
            if (!sw.every((b) => boxOK(b, pc.k))) continue;
            if (strict && placed.some((o) => o.rest && sw.some((s) => hits(s, o.rest!, 4)))) continue;
            found++;
            const cx = x + pc.w / 2, cy = y + pc.hb / 2;
            const spread = placed.length ? Math.min(...placed.map((o) => Math.hypot(o.cx - cx, (o.cy - cy) * 1.3))) : 300;
            const score = Math.min(spread, 360) + rnd() * 70;
            if (!best || score > best.score) best = { x, y, fs: pc.fs, amp: pc.amp, R, box: bx, sw, rest: null, cx, cy, hidden: pc.hidden, score };
          }
          if (!best) { ok = false; break; }
          measurePiece(pc, best.fs);
          Object.assign(pc, { x: best.x, y: best.y, fs: best.fs, amp: best.amp, R: best.R, box: best.box, sw: best.sw, cx: best.cx, cy: best.cy });
          pc.rest = restBox(pc, pc.x, pc.y);
          placed.push(pc);
        }
        if (!ok) continue;
        // the opening "Leo is 7." and her signature stay in the field, clear of every route
        for (const cp of conns) {
          let best: { x: number; y: number; fs: number; amp: number; box: Box; score: number; cx: number; cy: number } | null = null;
          cp.hidden = false;
          for (let c = 0; c < 400; c++) {
            measurePiece(cp, cp.k === -2 ? 13.5 : rnd() < 0.5 ? 15 : 19);
            cp.amp = 8;
            const x = mix(M, W - M - cp.w, rnd()), y = mix(top + cp.fs, bot - 4, rnd());
            const bx = pBox(cp, x, y, cp.amp + 4, 4);
            if (bx.t < top - 8 || bx.b > bot) continue;
            if (chrome.some((c) => hits(bx, c, 14)) || hits(bx, cardR, 18)) continue;
            if (placed.some((o) => hits(bx, o.box!, 20) || (o.sw && o.sw.some((s) => hits(bx, s, 8))))) continue;
            const target = cp.k === -2 ? placed.find((o) => o.k === 5) : null;
            const score = target ? -Math.hypot(target.x - x, target.y + target.hb + 34 - y) : -y - x * 0.2;
            if (!best || score > best.score) best = { x, y, fs: cp.fs, amp: cp.amp, box: bx, score, cx: x + cp.w / 2, cy: y };
          }
          if (best) {
            measurePiece(cp, best.fs);
            Object.assign(cp, { x: best.x, y: best.y, fs: best.fs, amp: best.amp, box: best.box, cx: best.cx, cy: best.cy });
            placed.push(cp);
          } else cp.hidden = true;
        }
        // composition score: cover the gutters top to bottom, keep pieces apart
        const cells = new Set(placed.map((o) => (o.cx < W / 2 ? 'L' : 'R') + Math.min(2, Math.floor(o.cy / (VH / 3)))));
        const spread = placed.reduce((s, o) => s + Math.min(360, Math.min(...placed.filter((p) => p !== o).map((p) => Math.hypot(p.cx - o.cx, (p.cy - o.cy) * 1.3)))), 0);
        sols.push({ score: cells.size * 160 + spread / 6 + (conns[1].hidden ? -400 : 0), snap: [...qps, ...conns].map(snapOf) });
      }
    }
    if (!sols.length) return false;
    const best = sols.sort((a, b) => b.score - a.score)[0];
    pieces = [...qps, ...conns];
    pieces.forEach((pc, j) => {
      Object.assign(pc, best.snap[j]);
      measurePiece(pc, pc.fs || 11.5);
      pc.alpha = pc.k === -2 ? 0.85 : ALPHA(pc.fs);
      if (pc.hidden) { pc.x = -999; pc.y = -999; pc.amp = 0; }
      seed = 3 + j * 101;
      commit(pc);
    });
    return true;
  }

  // narrow screens: the field fills whatever free space the type leaves; card lines are written in place
  function placeAmbient() {
    const mobile = W < 600, M = mobile ? 10 : 28, top = mobile ? 70 : 92, bot = VH - 10;
    const words = FIELD.match(/\S+\s*/g) ?? [];
    const lo = mobile ? 10 : 16, hi = mobile ? 20 : 28;
    const phr: Piece[] = [];
    let cur = '', st = 0;
    const flush = () => { if (cur) { const a = st, b = st + cur.length; phr.push(mkPiece(-3, 'a', [trim(a, b)], INK, 0.3)); st = b; cur = ''; } };
    words.forEach((w) => { if (cur.length >= lo && cur.length + w.trimEnd().length > hi) flush(); cur += w; if (/[.”]\s*$/.test(w) && cur.length >= lo) flush(); });
    flush();
    seed = 11 + Math.round(W);
    const placed: Piece[] = [];
    phr.forEach((pc) => {
      measurePiece(pc, mobile ? 11 : 12.5);
      pc.amp = 5;
      let best: { x: number; y: number; box: Box; score: number } | null = null;
      for (let c = 0; c < 260; c++) {
        const x = mix(M, W - M - pc.w, rnd()), y = mix(top, bot, rnd());
        const bx = pBox(pc, x, y, pc.amp + 2, 2);
        if (bx.l < 0 || bx.r > W || bx.b > bot) continue;
        if (chrome.some((c) => hitsXY(bx, c, 22, 8)) || hitsXY(bx, cardR, 14, 10) || placed.some((o) => hits(bx, o.box!, 12))) continue;
        const score = placed.length ? Math.min(...placed.map((o) => Math.hypot(o.x - x, (o.y - y) * 2))) : 0;
        if (!best || score > best.score) best = { x, y, box: bx, score };
      }
      if (best) { pc.x = best.x; pc.y = best.y; pc.box = best.box; placed.push(pc); }
      else { pc.hidden = true; pc.x = -999; pc.y = -999; pc.amp = 0; }
      commit(pc);
    });
    pieces = phr;
    // each card line's quote, laid out in its own row at the card's line breaks, small enough to fit
    rowQ = LINES.map((_, k) => {
      const lines = quoteLines(k), colW = vals[k].getBoundingClientRect().width;
      const widths = lines.map(([a, b]) => { let w = 0; for (let i = a; i < b; i++) w += adv(FIELD[i], 400); return w; });
      const s = Math.min(0.86, (colW - 2) / Math.max(...widths));
      const items: { i: number; x: number; y: number }[] = [];
      lines.forEach(([a, b], li) => {
        let ox = 0;
        for (let i = a; i < b; i++) { if (FIELD[i] !== ' ') items.push({ i, x: E[k].x + ox, y: lineYs[k][li] ?? E[k].y }); ox += adv(FIELD[i], 400) * s; }
      });
      items.forEach((it) => { const g = G[it.i]; if (g.line === k) { g.qx = it.x; g.qy = it.y; } });
      return { s, echoes: items.filter((it) => G[it.i].line !== k), t0: -1e9, dur: 1150 };
    });
  }

  function layout() {
    ADV[400].clear(); ADV[500].clear();
    W = stage.clientWidth; H = stage.clientHeight; VH = Math.min(H, innerHeight); DPR = Math.min(2, devicePixelRatio || 1);
    for (const c of [fieldC, flyC]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); c.style.width = W + 'px'; c.style.height = H + 'px'; }
    measure();
    pieces.forEach((pc) => { pc.hidden = false; });
    mode = 'route';
    if (!(W >= 1100 && placeRoute())) { mode = 'inrow'; placeAmbient(); }
    if (mode === 'route') rowQ = [];
  }

  // ---------- flights
  const now = () => performance.now();
  let gen = 0;
  const at = (t: number, fn: () => void, g = gen) => later(() => { if (g === gen) fn(); }, Math.max(0, t - now()));
  function landRow(k: number) { rowState[k] = 'card'; lis[k].classList.add('on'); if (k === 3) ghosts.forEach((h) => { h.on = 1; }); }

  function launchIn(k: number, t: number) {
    rowState[k] = 'in';
    const Ek = E[k];
    if (mode === 'route') {
      const pc = byLine[k][0].pc!, tl = t + LIFT, S = origin(pc, tl);
      const dur = clamp(650 + routeAt(S, Ek, 0, true, pc.R).L * 0.42, 800, 1350);
      byLine[k].forEach((g) => { const h = home(g, tl, false); g.lit = t; g.f = { dir: 'in', kind: 'route', t0: tl, dur, S, R: pc.R, ox: h[0] - S.x, oy: h[1] - S.y, cx: g.tx - Ek.x, cy: g.ty - Ek.y, sF: pc.sc }; });
      at(tl + dur - 40, () => landRow(k));
      return tl + dur;
    }
    const q = rowQ[k];
    q.t0 = t;
    byLine[k].forEach((g) => { g.lit = t; g.f = { dir: 'in', kind: 'row', t0: t, dur: q.dur, sQ: q.s }; });
    at(t + q.dur - 40, () => landRow(k));
    return t + q.dur;
  }
  function launchOut(k: number, t: number) {
    rowState[k] = 'out';
    lis[k].classList.remove('on');
    if (k === 3) ghosts.forEach((h) => { h.on = 0; });
    const Ek = E[k];
    if (mode === 'route') {
      const pc = byLine[k][0].pc!;
      const dur = clamp(550 + routeAt(origin(pc, t + 900), Ek, 0, false, pc.R).L * 0.38, 700, 1150);
      const S = origin(pc, t + dur);
      byLine[k].forEach((g) => { g.px = g.py = 0; const h = home(g, t + dur, false); g.f = { dir: 'out', kind: 'route', t0: t, dur, S, R: pc.R, ox: h[0] - S.x, oy: h[1] - S.y, cx: g.tx - Ek.x, cy: g.ty - Ek.y, sF: pc.sc }; });
      at(t + dur + 10, () => { rowState[k] = 'empty'; });
      return t + dur;
    }
    byLine[k].forEach((g) => { g.f = { dir: 'out', kind: 'fade', t0: t, dur: 650 }; });
    at(t + 660, () => { rowState[k] = 'empty'; });
    return t + 650;
  }
  function gstate(g: Glyph, t: number): string {
    const f = g.f;
    if (!f) return g.inCard ? 'card' : 'home';
    if (t < f.t0) return f.dir === 'in' ? 'home' : 'card';
    if (t >= f.t0 + f.dur) {
      g.f = null;
      if (f.dir === 'in') { g.inCard = true; g.land = f.t0 + f.dur; g.lit = 0; }
      else { g.inCard = false; g.backAt = f.t0 + f.dur; g.backKind = f.kind; }
      return gstate(g, t);
    }
    return 'fly';
  }

  // ---------- drawing
  const V: unknown[] = (window.__viol = []);
  window.__vcount = 0;
  function draw(t: number) {
    fx!.setTransform(1, 0, 0, 1, 0, 0); fx!.clearRect(0, 0, fieldC.width, fieldC.height);
    gx!.setTransform(1, 0, 0, 1, 0, 0); gx!.clearRect(0, 0, flyC.width, flyC.height);
    const items: Item[] = [];
    for (const g of USED) {
      const st = (g.st = gstate(g, t));
      if (st === 'home') continue;
      const k = g.line;
      if (st === 'card') { items.push({ g, k, x: g.tx, y: g.ty, s: 1, ch: g.tch, a: 1, c: col((t - g.land) / 500), fly: false }); continue; }
      const f = g.f!, p = (t - f.t0) / f.dur;
      if (f.kind === 'route') {
        const r = routeAt(f.S!, E[k], easeIO(p), f.dir === 'in', f.R!);
        const X = r.x + mix(f.ox!, f.cx!, r.m), Y = r.y + mix(f.oy!, f.cy!, r.m);
        items.push({ g, k, x: X, y: Y, s: mix(f.sF!, 1, r.m), ch: r.m > 0.92 ? g.tch : g.ch, a: 1, c: YEL, fly: true, away: Math.hypot(X - f.S!.x - f.ox!, Y - f.S!.y - f.oy!) });
      } else if (f.kind === 'row') {
        if (p < 0.48) items.push({ g, k, x: g.qx, y: g.qy, s: f.sQ!, ch: g.ch, a: sstep(0, 0.26, p), c: YEL, fly: true });
        else { const m = easeIO((p - 0.48) / 0.52); items.push({ g, k, x: mix(g.qx, g.tx, m), y: mix(g.qy, g.ty, m), s: mix(f.sQ!, 1, m), ch: m > 0.92 ? g.tch : g.ch, a: 1, c: YEL, fly: true }); }
      } else {
        items.push({ g, k, x: g.tx, y: g.ty, s: 1, ch: g.tch, a: 1 - easeOut(p), c: col(1 - p), fly: false });
      }
    }
    // in-place writing (narrow screens): her other words of the sentence show, then step aside
    rowQ.forEach((q, k) => {
      const p = (t - q.t0) / q.dur;
      if (p < 0 || p > 0.5) return;
      const a = sstep(0, 0.26, p) * (1 - sstep(0.26, 0.46, p)) * 0.9;
      q.echoes.forEach((e) => items.push({ k, x: e.x, y: e.y, s: q.s, ch: FIELD[e.i], a, c: YEL, fly: false, echo: true }));
    });
    ghosts.forEach((h) => { h.a += ((h.on ? 1 : 0) - h.a) * 0.08; if (h.a > 0.01) items.push({ k: h.k, x: h.x, y: h.y, s: 1, ch: h.ch, a: h.a, c: INK, fly: false }); });

    // field
    const flyPts = items.filter((i) => i.fly && (i.away ?? 0) > 12); // a run still on its own line does not push its neighbours
    fx!.font = `500 ${BASE}px ${FACE}`;
    for (const g of G) {
      if (g.ch === ' ' || !g.pc || g.pc.hidden) continue;
      if (g.line >= 0 && g.st !== 'home') {
        const [x, y] = home(g, t, false); // where her letter left, kept as a faint mark
        fx!.globalAlpha = 0.34; fx!.fillStyle = MARK; fx!.setTransform(DPR, 0, 0, DPR, DPR * x, DPR * y);
        fx!.fillRect(g.pc.fs * 0.2, -g.pc.fs * 0.28, 1.4, 1.4);
        continue;
      }
      if (!reduced) { // the cursor parts the field
        const [hx, hy] = home(g, t, false), dx = hx - mouse.x, dy = hy - mouse.y, d = Math.hypot(dx, dy);
        const push = !g.lit && d < 90 && d > 0.1 ? ((90 - d) * 0.55) / d : 0;
        g.px += (dx * push - g.px) * 0.12; g.py += (dy * push - g.py) * 0.12;
      }
      const [x, y] = home(g, t);
      const base = g.pc.alpha;
      let a = base, c = g.pc.color;
      if (g.lit && t >= g.lit) { a = mix(base, 1, clamp((t - g.lit) / LIFT)); c = YEL; }
      if (g.backAt) {
        const b = clamp((t - g.backAt) / 700);
        if (g.backKind === 'route') { a = mix(1, base, b); c = col(b); } else a = base * b;
        if (b >= 1) g.backAt = 0;
      }
      if (flyPts.length && !g.lit) { // the field makes way for letters in flight
        let q = 1e9;
        for (const it of flyPts) { const e = Math.max(Math.abs(it.x - x) / 10, Math.abs(it.y - y) / 13); if (e < q) q = e; }
        a *= sstep(0.75, 1.5, q);
      }
      if (a < 0.005) continue;
      fx!.globalAlpha = a; fx!.fillStyle = c;
      fx!.setTransform(DPR * g.pc.sc, 0, 0, DPR * g.pc.sc, DPR * x, DPR * y);
      fx!.fillText(g.ch, 0, 0);
    }

    // card: placeholder rules for rows not yet written, then the letters
    gx!.font = `400 ${BASE}px ${FACE}`;
    LINES.forEach((_, k) => {
      phA[k] += ((rowState[k] === 'card' || (rowState[k] === 'in' && byLine[k].some((g) => g.st === 'card')) ? 0 : 1) - phA[k]) * 0.1;
      if (phA[k] < 0.01) return;
      gx!.globalAlpha = 0.1 * phA[k]; gx!.fillStyle = INK; gx!.setTransform(1, 0, 0, 1, 0, 0);
      lineYs[k].forEach((_, li) => {
        const row = byLine[k].filter((g) => g.cl === li);
        if (!row.length) return;
        const x0 = Math.min(...row.map((g) => g.tx)), last = row[row.length - 1], x1 = last.tx + adv(last.tch);
        gx!.fillRect(DPR * x0, DPR * (row[0].ty + 4), DPR * (x1 - x0), DPR);
      });
    });
    for (const it of items) {
      if (it.a < 0.005) continue;
      gx!.globalAlpha = it.a; gx!.fillStyle = it.c;
      gx!.setTransform(DPR * it.s, 0, 0, DPR * it.s, DPR * it.x, DPR * it.y);
      gx!.fillText(it.ch, 0, 0);
    }
    gx!.globalAlpha = fx!.globalAlpha = 1;
    if (DEBUG) check(items, t);
  }

  // debug: every frame, no letter in flight may touch the type, leave its lane inside the card, or overlap another letter
  function check(items: Item[], t: number) {
    const fl = items.filter((i) => i.fly && i.a > 0.05);
    if (!fl.length) return;
    window.__ff = (window.__ff || 0) + 1; window.__fg = (window.__fg || 0) + fl.length;
    if (/selftest/.test(location.search)) chrome.push({ ...laneR[fl[0].k], l: laneR[fl[0].k].l + 300 });
    const bx = (i: Item): Box => ({ l: i.x + 0.5, r: i.x + adv(i.ch) * i.s - 0.5, t: i.y - ASC * BASE * i.s, b: i.y + DSC * BASE * i.s });
    const all = items.filter((i) => i.a > 0.05 && !i.echo).map((i) => ({ i, b: bx(i) }));
    const rec = (type: string, i: Item, extra?: unknown) => {
      window.__vcount = (window.__vcount || 0) + 1;
      if (V.length < 300) V.push({ type, t: Math.round(t), k: i.k, ch: i.ch, x: Math.round(i.x), y: Math.round(i.y), extra });
    };
    for (const { i, b } of all) {
      if (!i.fly) continue;
      for (const c of chrome) if (hits(b, c)) { rec('chrome', i, c); break; }
      if (hits(b, cardR)) { const ln = laneR[i.k]; if (b.t < ln.t - 0.5 || b.b > ln.b + 0.5) rec('lane', i); }
      labR.forEach((lr, k2) => { if (lis[k2].classList.contains('on') && hits(b, lr)) rec('label', i, k2); });
      for (const o of all) {
        if (o.i === i) continue;
        const ox = Math.min(b.r, o.b.r) - Math.max(b.l, o.b.l), oy = Math.min(b.b, o.b.b) - Math.max(b.t, o.b.t);
        if (ox > 1.5 && oy > 1.5) { rec('overlap', i, o.i.ch + '@' + Math.round(o.i.x) + ',' + Math.round(o.i.y)); break; }
      }
    }
  }

  // ---------- the mechanism
  const LOCK = '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="2.4" y="5.4" width="7.2" height="5" rx="1" stroke="currentColor" stroke-width="1.25"/><path d="M4.1 5.4V4a1.9 1.9 0 0 1 3.8 0v1.4" stroke="currentColor" stroke-width="1.25"/></svg>';
  const CHIP: Record<string, [string, string]> = {
    enclave: ['', 'Enclave check ✓'],
    locked: [LOCK, 'Locked until Leo is checked in'],
    open: ['<span class="dot" aria-hidden="true"></span>', 'Unlocked · checked in 8:52'],
    out: [LOCK, 'Locked · checked out 10:14'],
  };
  let state = 'enclave', want: string | null = null, manualUntil = 0;
  function setChip(kind: string) {
    const C = CHIP[kind];
    chip.innerHTML = C[0] + '<span class="t">' + C[1] + '</span>';
    chip.classList.toggle('open', kind === 'open');
    chip.setAttribute('aria-label', C[1] + (kind === 'open' ? '. Activate to check Leo out.' : '. Activate to check Leo in.'));
    // announce only what the visitor asked for; the idle loop stays quiet for screen readers
    if (now() < manualUntil) live.textContent = "Leo's card: " + C[1];
    state = kind;
  }
  const lock = () => { flyC.classList.add('locked'); card.classList.remove('legible'); };
  const open = () => { flyC.classList.remove('locked'); flyC.classList.add('hide'); card.classList.add('legible'); };
  const sleep = (ms: number, g: number) => new Promise<void>((res, rej) => { later(() => (g === gen ? res() : rej(0)), ms); });
  async function hold(ms: number, g: number, key: string) {
    const end = now() + (now() < manualUntil ? Math.max(ms, 9000) : ms);
    while (now() < end) { if (want === key) { want = null; return; } await sleep(50, g); }
  }
  async function assemble(g: number) {
    setChip('enclave');
    const t0 = now() + 150;
    let end = t0, j = 0;
    for (let k = 0; k < LINES.length; k++) if (rowState[k] === 'empty') { end = Math.max(end, launchIn(k, t0 + j * (mode === 'route' ? STAG_IN : 750))); j++; }
    await sleep(end - now() + 250, g);
  }
  async function disperse(g: number) {
    setChip('out');
    flyC.classList.remove('hide'); card.classList.remove('legible'); flyC.classList.add('locked');
    await sleep(750, g);
    flyC.classList.remove('locked');
    const t0 = now() + 120;
    let end = t0;
    [6, 5, 4, 3, 2, 1, 0].forEach((k, j) => { end = Math.max(end, launchOut(k, t0 + j * STAG_OUT)); });
    await sleep(end - now() + 160, g);
  }
  async function cycle(g: number) {
    if (rowState.some((s) => s !== 'card')) await assemble(g);
    if (want !== 'open') { setChip('locked'); lock(); await hold(2200, g, 'open'); }
    want = null; setChip('open'); open();
    await hold(3800, g, 'out');
    want = null; await disperse(g);
    await hold(900, g, 'open');
  }
  async function loop(g: number) { try { for (;;) await cycle(g); } catch { /* a newer generation took over */ } }

  const onChip = () => {
    if (reduced) { // static key frame: the chip still flips the state, without motion
      manualUntil = now() + 1000;
      if (state === 'open') { setChip('out'); card.classList.remove('legible'); flyC.classList.remove('hide'); flyC.classList.add('locked'); draw(now()); }
      else { setChip('open'); open(); }
      return;
    }
    manualUntil = now() + 12000;
    want = state === 'open' ? 'out' : 'open';
  };
  chip.addEventListener('click', onChip);
  if (matchMedia('(hover: none)').matches) el.hint.textContent = 'Tap the status to check Leo in or out.';
  const onMove = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
  const onLeave = () => { mouse.x = mouse.y = -9999; };
  addEventListener('pointermove', onMove, { passive: true });
  stage.addEventListener('pointerleave', onLeave);

  function reset() {
    gen++;
    USED.forEach((g) => { g.f = null; g.inCard = false; g.lit = 0; g.backAt = 0; g.px = g.py = 0; });
    rowState.fill('empty'); phA.fill(1); lis.forEach((li) => li.classList.remove('on')); ghosts.forEach((h) => { h.on = 0; h.a = 0; });
    card.classList.remove('legible'); flyC.classList.remove('locked', 'hide'); want = null;
  }
  function staticFrame() { // reduced motion: card assembled and unlocked, field still
    USED.forEach((g) => { g.inCard = true; g.land = -1e9; });
    rowState.fill('card'); phA.fill(0); lis.forEach((li) => li.classList.add('on')); ghosts.forEach((h) => { h.on = 1; h.a = 1; });
    setChip('open'); open(); draw(now());
  }
  function start() {
    reset(); layout();
    window.__hd = { mode, chip: () => state, rows: () => rowState.slice(), W, H };
    if (reduced) { staticFrame(); return; }
    const g = gen;
    setChip('enclave');
    later(() => { if (g === gen) loop(g); }, 700);
  }
  function frame(t: number) { if (stopped) return; if (visible && ready && !reduced) draw(t); raf = requestAnimationFrame(frame); }

  let lastW = innerWidth;
  let rt: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    if (innerWidth === lastW) return; // height-only changes (mobile URL bar, full-page capture) keep the layout
    lastW = innerWidth;
    if (rt) { clearTimeout(rt); timers.delete(rt); }
    rt = later(start, 200);
  };
  const fontsReady = Promise.all([document.fonts.load(`500 ${BASE}px "General Sans"`), document.fonts.load(`400 ${BASE}px "General Sans"`), document.fonts.ready]).catch(() => {});
  fontsReady.then(() => {
    if (stopped) return;
    // lay out once the entrance has settled (targets are read from the real DOM text)
    later(() => {
      start(); ready = true; fieldC.classList.add('on'); raf = requestAnimationFrame(frame);
      lastW = innerWidth;
      addEventListener('resize', onResize);
      io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; });
      io.observe(stage);
    }, reduced ? 0 : 1150);
  });

  return function stop() {
    stopped = true;
    gen++;
    timers.forEach(clearTimeout); timers.clear();
    cancelAnimationFrame(raf);
    io?.disconnect();
    chip.removeEventListener('click', onChip);
    removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerleave', onLeave);
    removeEventListener('resize', onResize);
  };
}
