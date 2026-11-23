// Stubs: Task 16 fills these with the real Planning Center calls. Safe no-ops until then.

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

/** True when the buddy is already scheduled elsewhere in PCO Services for an overlapping time (Task 16). */
export async function isBusyInPco(churchId: string, buddyPcoPersonId: string | null, startsAt: Date, endsAt: Date): Promise<boolean> {
  void churchId; void buddyPcoPersonId; void startsAt; void endsAt;
  return false;
}
