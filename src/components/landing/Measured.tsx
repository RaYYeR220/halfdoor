import { LANDING_EVAL as E, ofText, type Fraction } from '@/lib/landing/eval';

const pct = (x: Fraction) => `${((100 * x.n) / x.of).toFixed(1)}%`;

/** One labelled hairline bar: the share of scored cards that added something the parent never said. */
function Bar({ label, note, value, ours }: { label: string; note?: string; value: Fraction; ours?: boolean }) {
  return (
    <li className={ours ? 'ours' : undefined}>
      <span className="bl">
        {label}
        {note && (
          <small>
            <span className="sep"> · </span>
            {note}
          </small>
        )}
      </span>
      <span className="bv">{ofText(value)}</span>
      <span className="track">
        <span className="fill" style={{ width: pct(value) }} />
      </span>
    </li>
  );
}

/**
 * 4 · Measured. Every number comes from eval/results/final.json through src/lib/landing/eval.ts. The honest negative
 * goes first: on safety facts a plain AI summary does as well as Halfdoor.
 */
export function Measured({ repoUrl }: { repoUrl: string | null }) {
  const { safety, added } = E;
  const evalHref = repoUrl ? `${repoUrl.replace(/\/+$/, '')}/tree/main/eval` : null;
  return (
    <section className="sec" id="measured" aria-labelledby="measured-h">
      <div className="wrap">
        <div className="sec-head rv">
          <h2 id="measured-h">Measured on {E.stories} parent stories.</h2>
          <p className="lead">
            {E.english} in English, {E.spanish} in Spanish, each with a hidden answer key — allergies a child outgrew, who is
            NOT allowed to pick up, a medicine that was stopped.
          </p>
        </div>
        <div className="meas rv">
          <article className="frag" aria-labelledby="meas-safety">
            <div className="fh">
              <span><b id="meas-safety">Safety facts kept</b></span>
            </div>
            <div className="meas-pair" aria-hidden="true">
              <div>
                <p className="meas-n">{safety.halfdoor.n}<small> of {safety.halfdoor.of}</small></p>
                <p className="meas-k">Halfdoor</p>
              </div>
              <div>
                <p className="meas-n">{safety.plainSummary.n}<small> of {safety.plainSummary.of}</small></p>
                <p className="meas-k">Plain AI summary</p>
              </div>
            </div>
            <p className="meas-t">
              Halfdoor <b>{ofText(safety.halfdoor)}</b> (after the parent confirms the safety prompts). A plain AI summary kept
              them too: <b>{ofText(safety.plainSummary)}</b>.
            </p>
          </article>
          <article className="frag" aria-labelledby="meas-added">
            <div className="fh">
              <span><b id="meas-added">Cards that added something the parent never said</b></span>
            </div>
            <ul className="bars" aria-hidden="true">
              <Bar label="Prompted short card" note={E.claudeName} value={added.claudeShort} />
              <Bar label="Prompted short card" note="same model as Halfdoor" value={added.sameShort} />
              <Bar label="Halfdoor" value={added.halfdoor} ours />
            </ul>
            <p className="meas-t">
              A prompted short card: <b>{ofText(added.claudeShort)}</b> ({E.claudeName}) and <b>{ofText(added.sameShort)}</b> (same
              model as Halfdoor). Halfdoor: <b>{ofText(added.halfdoor)}</b>, and every line shows the words it came from.
            </p>
          </article>
        </div>
        <p className="meas-foot rv">
          Checked by a word-overlap rule on every sentence; a card&apos;s title doesn&apos;t count. By hand, on a random sample of
          {E.check.shortCards ? ' short-card' : ''} sentences: {ofText(E.check.flagged)} the rule flagged really added something,
          and {ofText(E.check.passed)} it passed really came from the parent. It errs both ways, so the counts are approximate.
          Halfdoor&apos;s low count is by design — it drops any line it can&apos;t point to. Full method and every output:{' '}
          {evalHref ? <a href={evalHref}>eval/</a> : 'eval/'} in the source.
        </p>
      </div>
    </section>
  );
}
