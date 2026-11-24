import { modelDisplayName } from '@/lib/landing/eval';
import { LESSON_MODEL } from '@/lib/venice/claude';
import { E2EE_MODEL } from '@/lib/venice/prices';

const QA: [string, string][] = [
  ['Is this a diagnosis tool?', 'No. The card only says what the parent said. It never adds a label.'],
  [
    'What if the AI gets something wrong?',
    "Every line shows the words it came from. Safety lines are the parent's own sentences. The parent approves the card before anyone sees it, and can change it any time.",
  ],
  [
    "Who can see my child's card?",
    "The kids' director, and the buddy assigned to your child — only while your child is checked in. Room leaders see safety lines only.",
  ],
  ['Does Halfdoor message families?', "No. Notes are drafted for the director, who shares them through the church's own channels."],
  [
    'Which AI models does Halfdoor use?',
    `Children's words go only to an open-weight model running inside an attested enclave on Venice (currently ${E2EE_MODEL}). The Sunday lesson — no child data — is restructured by ${modelDisplayName(LESSON_MODEL)} on Venice. Every call is listed in the church's AI ledger.`,
  ],
  ['Is the demo real?', 'The app is real and the code is open source. The demo church and every child in it are fictional.'],
];

/** 8 · Questions: a two-column hairline list. The model names are the app's own constants. */
export function Faq() {
  return (
    <section className="sec" id="faq" aria-labelledby="faq-h">
      <div className="wrap">
        <div className="sec-head rv">
          <h2 id="faq-h">Questions</h2>
        </div>
        <dl className="qa rv">
          {QA.map(([q, a]) => (
            <div key={q}>
              <dt>{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
