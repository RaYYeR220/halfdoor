import { ENCLAVE_COPY, HONEST_LIMITS } from '@/lib/crypto/attestation';

/** Like the PCCS note: the page's font comes from a third-party CDN that sees the visitor's IP address. */
export const FONT_NOTE = "The page's font loads from Fontshare's CDN, which sees your IP address. No child data is sent to it.";

/**
 * 2 · Private by design. The enclave sentences are the app's own ENCLAVE_COPY / HONEST_LIMITS, so the landing never
 * claims more than the parent page does: "checks", never "proven" or "no one can read".
 */
export function Privacy() {
  return (
    <section className="sec" id="privacy" aria-labelledby="privacy-h">
      <div className="wrap split rv">
        <div>
          <h2 id="privacy-h">Private by design</h2>
          <ul className="facts">
            <li>
              The parent&apos;s story is encrypted in their browser and sent only to a hardware-sealed enclave. {ENCLAVE_COPY.short}
            </li>
            <li>Halfdoor&apos;s server never stores the raw story — only the card the parent approved, encrypted at rest.</li>
            <li>Nothing is ever sent automatically.</li>
            <li>Every opening of a card is logged, and the parent can see the log.</li>
            <li>Cards are deleted 12 months after the child&apos;s last Sunday, or any time the parent asks.</li>
          </ul>
          <p className="limits">{HONEST_LIMITS}</p>
          <p className="limits">{ENCLAVE_COPY.pccsNote}</p>
          <p className="limits">{FONT_NOTE}</p>
        </div>
        <div>
          <div className="frag">
            <div className="fh">
              <span><b>Before Maria&apos;s story is sent</b></span>
              <span className="pill">Enclave check ✓</span>
            </div>
            <ul className="rows">
              <li><span>The enclave&apos;s attestation</span><span>checked</span></li>
              <li><span>The key it encrypts to is bound to the enclave</span><span>checked</span></li>
              <li><span>Maria&apos;s story</span><span>encrypted in her browser</span></li>
            </ul>
          </div>
          <div className="frag">
            <div className="fh">
              <span><b>Who opened Leo&apos;s card</b></span>
              <span>Maria&apos;s view</span>
            </div>
            <ul className="rows log-rows">
              <li>Priya opened Leo&apos;s card · Sun 8:52–10:14 (while Leo was checked in)</li>
              <li className="dim">Hannah (kids&apos; director) reviewed it · Sat 4:10 pm</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
