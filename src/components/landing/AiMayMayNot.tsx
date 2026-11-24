const MAY = [
  "Turn the parent's words into short card lines, each pointing to its source",
  'Translate between English and Spanish, with the original one tap away',
  "Turn a buddy's taps into a draft note for the director to read",
];

const MAY_NOT = [
  "Add a diagnosis or a label the parent didn't use",
  'Reword a safety line',
  'Send anything to anyone',
  'Rate or score a child',
  'Write teaching — Scripture appears word for word from the Berean Standard Bible',
];

/** 3 · What the AI may and may not do: two hairline lists side by side. */
export function AiMayMayNot() {
  return (
    <section className="sec" id="ai" aria-labelledby="ai-h">
      <div className="wrap">
        <div className="sec-head rv">
          <h2 id="ai-h">What the AI may and may not do</h2>
        </div>
        <div className="two rv">
          <div className="rule-col">
            <h3>May</h3>
            <ul className="rules">
              {MAY.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div className="rule-col">
            <h3>May not</h3>
            <ul className="rules">
              {MAY_NOT.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
