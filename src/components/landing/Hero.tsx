'use client';

import { useEffect, useRef, useState } from 'react';
import { en } from '@/lib/i18n/en';
import { CARD_VALUES, startHeroField, type HeroHandle } from './heroField';
import { ArrowRight, PauseMark, PlayMark } from './icons';
import { Nav } from './Nav';

const LABELS: [string, boolean][] = [
  ['Loves', false],
  ['Hard', false],
  ['Helps', false],
  ['Signs', false],
  ['Safety', true],
  ['Safety', true],
  ['Context', true],
];

/**
 * The first screen. All of its text is server-rendered and readable before the glyph field starts (the field waits
 * for the font and the entrance); the canvases are decoration on top of real DOM text.
 */
export function Hero({ repoUrl }: { repoUrl: string | null }) {
  const stage = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLCanvasElement>(null);
  const fly = useRef<HTMLCanvasElement>(null);
  const nav = useRef<HTMLElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  const sub = useRef<HTMLParagraphElement>(null);
  const ctas = useRef<HTMLDivElement>(null);
  const proof = useRef<HTMLParagraphElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const card = useRef<HTMLElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const live = useRef<HTMLParagraphElement>(null);
  const handle = useRef<HeroHandle | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const els = {
      stage: stage.current, field: field.current, fly: fly.current, nav: nav.current, h1: h1.current, sub: sub.current,
      ctas: ctas.current, proof: proof.current, hint: hint.current, card: card.current, chip: chip.current, live: live.current,
    };
    if (Object.values(els).some((e) => !e)) return;
    const h = startHeroField(els as { [K in keyof typeof els]: NonNullable<(typeof els)[K]> }, setPaused);
    handle.current = h;
    return () => {
      handle.current = null;
      h.stop();
    };
  }, []);

  return (
    <div className="stage" ref={stage}>
      <canvas className="hf-field" ref={field} aria-hidden="true" />
      <Nav repoUrl={repoUrl} ref={nav} />

      <main className="hero wrap">
        <h1 className="rise d1" ref={h1}>
          The volunteer knows Leo before Leo walks in.
        </h1>
        <p className="sub rise d2" ref={sub}>
          Parents write about their child in their own words. Every line on the buddy&apos;s card points back to the words it
          came from; safety lines are copied word for word.<span className="m-hide"> Parents see who opened it and when.</span>
        </p>
        <div className="ctas rise d3" ref={ctas}>
          <a className="btn btn-cta" href="/demo" rel="nofollow">
            Try the demo church <ArrowRight />
          </a>
          <a className="btn btn-line" href="#how">
            How it works
          </a>
        </div>
        <p className="proof rise d3" ref={proof}>
          Card unlocks at check-in, locks at checkout
        </p>

        <div className="zone rise d4">
          <article className="card" ref={card} aria-label="Leo's card on Priya's phone, assembled from Maria's words">
            <div className="card-head">
              <div className="who">
                <b>Leo, 7</b> · <span className="pri">Priya</span> · Kids Room B
              </div>
              <button className="chip" ref={chip} type="button">
                <span className="t">Enclave check ✓</span>
              </button>
            </div>
            <p className="src">
              <span>Made from Maria&apos;s words · Leo&apos;s mom</span>
              <span>Priya&apos;s phone</span>
            </p>
            <ol className="lines">
              {CARD_VALUES.map((value, k) => (
                <li key={k}>
                  <span className="lab">
                    {LABELS[k][0]}
                    {LABELS[k][1] && <small>word for word</small>}
                  </span>
                  <span className="val">{value}</span>
                </li>
              ))}
            </ol>
          </article>
          <p className="hint" ref={hint}>
            Click the status to check Leo in or out.
          </p>
        </div>
      </main>
      <canvas className="hf-fly" ref={fly} aria-hidden="true" />
      <button
        className="motion-toggle"
        type="button"
        aria-pressed={paused}
        aria-label={en['landing.motion.toggle']}
        title={en['landing.motion.toggle']}
        onClick={() => handle.current?.setPaused(!paused)}
      >
        {paused ? <PlayMark /> : <PauseMark />}
      </button>
      <p className="sr" ref={live} aria-live="polite" />
    </div>
  );
}
