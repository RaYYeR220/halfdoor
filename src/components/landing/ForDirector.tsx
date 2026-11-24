const MATCHES: [kid: string, buddy: string, reason: string | null][] = [
  ['Leo, 7', 'Priya', 'Same buddy as the last 3 Sundays'],
  ['Ana, 5', 'Marco', 'Speaks Spanish'],
  ['Malik, 9', 'Grace', null],
  ['Theo, 4', 'Ruth', 'Medical'],
];

const PACK: [step: string, minutes: string, supports: string[]][] = [
  ['Arrive', '5 min', []],
  ['Worship', '15 min · loud', ['Leo: headphones']],
  ['Bible story', '15 min', []],
  ['Snack', '10 min', ['Leo: peanut check', 'Theo: snack check before snack']],
  ['Craft', '15 min', []],
  ['Pickup', '5 min', []],
];

/** 5 · For the kids' director: this Sunday's matches with their reasons and gaps, then the Sunday pack. */
export function ForDirector() {
  return (
    <section className="sec" id="director" aria-labelledby="director-h">
      <div className="wrap">
        <div className="sec-head rv">
          <h2 id="director-h">For the kids&apos; director</h2>
          <p className="lead">This Sunday&apos;s buddy matches with their reasons, and the gaps stated plainly. Then the lesson, as a picture schedule.</p>
        </div>
        <div className="frag rv">
          <div className="fh">
            <span><b>This Sunday</b> · Kids Room B</span>
            <span>Fernbrook Community Church (demo) · Sunday 29 Nov 2026</span>
          </div>
          <ul className="matches">
            {MATCHES.map(([kid, buddy, reason]) => (
              <li key={kid}>
                <span className="kid">{kid}</span>
                <span className="bud">{buddy}</span>
                <span>{reason && <span className="pill quiet">{reason}</span>}</span>
              </li>
            ))}
            <li className="gap">
              <span className="kid">Ivy, 10</span>
              <span className="msg">
                <span className="pill gap">Gap</span>Ivy needs a buddy with AAC experience at 11:00 — Dana&apos;s training expired 2 Oct.
              </span>
            </li>
            <li className="gap">
              <span className="kid">Sam, 6</span>
              <span className="msg none">New family this week, no card yet.</span>
            </li>
          </ul>
        </div>
        <div className="frag rv">
          <div className="fh">
            <span><b>Sunday pack</b> · “Waiting with hope” · Advent week 1</span>
            <span>Isaiah 9:6 (BSB)</span>
          </div>
          <ol className="pack-grid" aria-label="Picture schedule">
            {PACK.map(([step, minutes, supports]) => (
              <li className="stepbox" key={step}>
                <b>{step}</b>
                <span className="min">{minutes}</span>
                {supports.map((s) => (
                  <span className="sup" key={s}>{s}</span>
                ))}
              </li>
            ))}
          </ol>
          <div className="story">
            <span className="k">
              Social story
              <br />
              fixed sentences, never invented
            </span>
            <div>
              <p>“First, we sing songs together. It can be loud. I can wear my headphones.”</p>
              <p>“Then my grown-up picks me up.”</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
