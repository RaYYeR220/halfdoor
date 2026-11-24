/**
 * One child's latest check-in at a service, as the heartbeat reports it. Times are ISO strings: the buddy phone and
 * the room view show "checked in 9:02" / "checked out 10:14" from them (with the demo clock's shift).
 */
export type CheckinStatus = {
  childId: string;
  securityCode: string | null;
  in: boolean;
  checkedInAt: string;
  checkedOutAt: string | null;
};

/**
 * GET /api/heartbeat's answer. `viewerId` is who the server answered as: a sandbox browser shares one persona cookie
 * across tabs, so a page opened as one person can tell when another tab switched it to someone else.
 */
export type Heartbeat = { now: string; viewerId: string; checkins: CheckinStatus[] };

export type StationAction = 'in' | 'out';

/** 4 chars, A-Z and 2-9 without the look-alikes O, I (and 0, 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
