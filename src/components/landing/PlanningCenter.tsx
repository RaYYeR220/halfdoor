/**
 * 6 · Built for Planning Center: three plain rows, no logo, no UI imitation. Says plainly that the live connection is
 * not part of the demo (the shapes and hook points are in the code; the demo uses a labelled simulated station).
 */
export function PlanningCenter() {
  return (
    <section className="sec" id="pco" aria-labelledby="pco-h">
      <div className="wrap split rv">
        <div>
          <h2 id="pco-h">Built for Planning&nbsp;Center</h2>
          <p className="pco-note">
            The Check-Ins, Services and People shapes and the hook points are in the code. The live connection is not part
            of this demo: a clearly labelled simulated check-in station stands in for Check-Ins.
          </p>
        </div>
        <ul className="pco">
          <li><b>Check-Ins</b><span>Designed so a check-in opens the card and a checkout closes it.</span></li>
          <li><b>Services</b><span>Designed to schedule an approved buddy onto the plan&apos;s team.</span></li>
          <li><b>People</b><span>Designed to note on the child&apos;s People record that a card is on file — never what it says.</span></li>
        </ul>
      </div>
    </section>
  );
}
