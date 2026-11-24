// "Simulated check-in station" for sandboxes: stands in for Planning Center Check-Ins.
import { randomInt } from 'node:crypto';
import { closeSessionsAtCheckout } from '@/db/repo/access';
import { getOpenCheckin, insertCheckin, updateCheckin } from '@/db/repo/checkins';
import { bumpRetention } from '@/lib/access/retention';
import { CODE_ALPHABET, CODE_LENGTH, type StationAction } from './types';

export function newSecurityCode(): string {
  let out = '';
  for (let k = 0; k < CODE_LENGTH; k++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export type StationResult = { ok: true; securityCode: string | null; in: boolean } | { ok: false; error: 'already_in' | 'not_in' };

/** Callers have already scoped serviceId and childId to the viewer's church. */
export async function stationAction(churchId: string, serviceId: string, childId: string, action: StationAction, now: Date): Promise<StationResult> {
  const open = await getOpenCheckin(serviceId, childId);
  if (action === 'in') {
    if (open) return { ok: false, error: 'already_in' };
    const row = await insertCheckin({ serviceId, childId, source: 'demo_station', securityCode: newSecurityCode(), checkedInAt: now });
    await bumpRetention(churchId, childId, now);
    return { ok: true, securityCode: row.securityCode, in: true };
  }
  if (!open) return { ok: false, error: 'not_in' };
  await updateCheckin(open.id, { checkedOutAt: now });
  // The family's log reads "opened 9:02 – 10:14": the buddy's and the room's sessions end at checkout, not at the
  // next time a phone happens to ask.
  await closeSessionsAtCheckout(childId, serviceId, now);
  return { ok: true, securityCode: open.securityCode, in: false };
}
