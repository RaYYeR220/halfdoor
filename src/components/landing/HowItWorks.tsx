import { MARIA } from './heroField';
import { LockMark } from './icons';

/** 1 · How a Sunday works: four verbs in order, each with a quiet product fragment from Leo's Sunday. */
export function HowItWorks() {
  return (
    <section className="sec" id="how" aria-labelledby="how-h">
      <div className="wrap">
        <div className="sec-head rv">
          <h2 id="how-h">How a Sunday works</h2>
          <p className="lead">Four steps, in order. Leo&apos;s card, from Maria&apos;s words to Priya&apos;s phone and back.</p>
        </div>
        <ol className="steps rv">
          <li className="step">
            <span className="step-n">1</span>
            <div className="step-t">
              <h3>Tell.</h3>
              <p>A parent writes about their child in their own words, in any language. No forms to fight with.</p>
            </div>
            <div className="frag">
              <div className="fh">
                <span><b>Maria</b> · Leo&apos;s mom</span>
                <span>English</span>
              </div>
              <p className="q">“{MARIA}”</p>
              <div className="q-split">
                <div className="fh">
                  <span><b>Lucía</b> · Ana&apos;s mom</span>
                  <span>Español</span>
                </div>
                <p className="q" lang="es">
                  “A Ana le encanta cantar. No le gustan los lugares con mucha gente. Solo yo o su abuela pueden recogerla.”
                </p>
              </div>
            </div>
          </li>
          <li className="step">
            <span className="step-n">2</span>
            <div className="step-t">
              <h3>Check.</h3>
              <p>
                Every line on the card points back to the words it came from. Safety lines — allergies, medical, who may pick
                up — are copied word for word. Anything that can&apos;t be pointed to is left out, and the parent sees what was
                left out. Nothing is visible to anyone until the parent approves.
              </p>
            </div>
            <div className="frag">
              <div className="fh">
                <span><b>Leo&apos;s card</b> · every line points to Maria&apos;s words</span>
                <span className="pill quiet">Approved by Maria</span>
              </div>
              <div className="tr">
                <span className="k">Helps</span>
                <div>
                  <div className="v">Blue headphones during worship</div>
                  <div className="from">from “he wears his blue headphones during worship”</div>
                </div>
              </div>
              <div className="tr">
                <span className="k">Signs</span>
                <div>
                  <div className="v">Humming loudly + covering his face → he needs a quiet break</div>
                  <div className="from">from “When he starts humming loudly and covering his face he needs a quiet break.”</div>
                </div>
              </div>
              <div className="tr">
                <span className="k">Safety<small>word for word</small></span>
                <div>
                  <div className="v">He IS allergic to peanuts - he has an EpiPen in his backpack.</div>
                  <div className="from">Maria&apos;s sentence, all 61 characters, unchanged</div>
                </div>
              </div>
              <div className="tr">
                <span className="k">Context<small>word for word</small></span>
                <div>
                  <div className="v">He used to be allergic to eggs but he outgrew it last year.</div>
                  <div className="from">Kept as context, in her words</div>
                </div>
              </div>
            </div>
          </li>
          <li className="step">
            <span className="step-n">3</span>
            <div className="step-t">
              <h3>Match.</h3>
              <p>The kids&apos; director pairs a trained buddy: training current, background check valid, the same buddy as last time when possible.</p>
            </div>
            <div className="frag">
              <div className="fh">
                <span><b>Sunday 29 Nov 2026</b> · 9:00 · Kids Room B</span>
                <span>Buddy match</span>
              </div>
              <div className="pair">
                <span>Leo, 7</span>
                <span className="wire" aria-hidden="true" />
                <span>Priya</span>
              </div>
              <ul className="checks">
                <li className="pill"><span className="tick" aria-hidden="true">✓</span> Training current</li>
                <li className="pill"><span className="tick" aria-hidden="true">✓</span> Background check valid</li>
                <li className="pill"><span className="tick" aria-hidden="true">✓</span> Same buddy as the last 3 Sundays</li>
              </ul>
            </div>
          </li>
          <li className="step">
            <span className="step-n">4</span>
            <div className="step-t">
              <h3>Open, then close.</h3>
              <p>The card is locked on the buddy&apos;s phone until the child is checked in, and locks again at checkout. The parent sees who opened it and when.</p>
            </div>
            <div className="frag">
              <div className="fh">
                <span><b>Check-in</b> · Leo · <span className="code">K7RD</span></span>
                <span>Priya&apos;s phone</span>
              </div>
              <ol className="gate">
                <li>
                  <span className="pill"><LockMark />Locked until Leo is checked in</span>
                  <span>Before check-in</span>
                </li>
                <li>
                  <span className="pill open"><span className="dot" aria-hidden="true" />Unlocked · checked in 8:52</span>
                  <span>Check-in <span className="code">K7RD</span></span>
                </li>
                <li>
                  <span className="pill"><LockMark />Locked · checked out 10:14</span>
                  <span>Open 82 minutes, then closed</span>
                </li>
              </ol>
              <div className="log">
                <span className="k">Maria sees</span>
                <span>Priya opened Leo&apos;s card · Sun 8:52–10:14 (while Leo was checked in)</span>
              </div>
            </div>
          </li>
        </ol>
        <p className="after rv">
          <b>After the service</b>
          <span>The buddy&apos;s one-tap moments become a short note home, in the parent&apos;s language, sent only after the director reads it.</span>
        </p>
      </div>
    </section>
  );
}
