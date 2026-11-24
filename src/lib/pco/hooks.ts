// Planning Center hook points, called where the live connection would act. The live connection is not built yet
// (not part of the demo), so each is a safe no-op.

/** Called after a parent approves a card in a `live`/`pco` church (writes the PCO note). */
export async function onCardApproved(churchId: string, childId: string, approvedAt: Date): Promise<void> {
  void churchId; void childId; void approvedAt;
}

/** Called after a director approves an assignment in a `live`/`pco` church (schedules the buddy in PCO). */
export async function onAssignmentApproved(churchId: string, assignmentId: string): Promise<void> {
  void churchId; void assignmentId;
}

/** Pulls check-ins for the service from PCO into our table (heartbeat, throttled per church). */
export async function refreshFromPco(serviceId: string): Promise<void> {
  void serviceId;
}

/** True when the buddy is already scheduled elsewhere in PCO Services for an overlapping time (always false until the connection exists). */
export async function isBusyInPco(churchId: string, buddyPcoPersonId: string | null, startsAt: Date, endsAt: Date): Promise<boolean> {
  void churchId; void buddyPcoPersonId; void startsAt; void endsAt;
  return false;
}
