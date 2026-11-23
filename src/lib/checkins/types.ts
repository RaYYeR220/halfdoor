export type CheckinStatus = { childId: string; securityCode: string | null; in: boolean };
export type StationAction = 'in' | 'out';

/** 4 chars, A-Z and 2-9 without the look-alikes O, I (and 0, 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
