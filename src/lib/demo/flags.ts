// The demo guide's step flags: plain data shared by the server (state.ts) and the guide in the browser.

export type DemoFlags = {
  samCardApproved: boolean;
  samCardAcknowledged: boolean;
  samAssignedApproved: boolean;
  samCheckedIn: boolean;
  samCardOpenedByBuddy: boolean;
  samCheckedOut: boolean;
  samNoteApproved: boolean;
};

export type DemoState = DemoFlags & {
  /** The buddy approved for Sam today (the guide's step 5 switches to them); null until step 3. */
  samBuddyId: string | null;
  samBuddyName: string | null;
  /** The service the station and buddy steps open on: where Sam is matched (and checked in). null until step 3. */
  samServiceId: string | null;
};

export const DEMO_STEP_FLAGS: readonly (keyof DemoFlags)[] = [
  'samCardApproved', 'samCardAcknowledged', 'samAssignedApproved', 'samCheckedIn',
  'samCardOpenedByBuddy', 'samCheckedOut', 'samNoteApproved',
];

export const EMPTY_DEMO_STATE: DemoState = {
  samCardApproved: false, samCardAcknowledged: false, samAssignedApproved: false, samCheckedIn: false,
  samCardOpenedByBuddy: false, samCheckedOut: false, samNoteApproved: false, samBuddyId: null, samBuddyName: null, samServiceId: null,
};
