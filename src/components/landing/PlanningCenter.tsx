/** 6 · Works with Planning Center: three plain rows, no logo, no UI imitation. */
export function PlanningCenter() {
  return (
    <section className="sec" id="pco" aria-labelledby="pco-h">
      <div className="wrap split rv">
        <h2 id="pco-h">Works with Planning&nbsp;Center</h2>
        <ul className="pco">
          <li><b>Check-Ins</b><span>Check-ins from Planning Center Check-Ins open and close the card.</span></li>
          <li><b>Services</b><span>Buddies can be scheduled into Planning Center Services.</span></li>
          <li><b>People</b><span>A note goes on the child&apos;s People record saying a card is on file — never what it says.</span></li>
        </ul>
      </div>
    </section>
  );
}
