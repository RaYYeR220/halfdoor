// SERVER-ONLY. Resolves who is looking at the page: a signed link (real parents/buddies)
// or a sandbox persona (hd_sbx = signed church id, hd_as = person id chosen in the role bar).
import { cookies } from 'next/headers';
import { getChurch } from '@/db/repo/churches';
import { getPersonInChurch } from '@/db/repo/people';
import { verifyLink, verifyValue, type Role } from './tokens';

export type Viewer = { churchId: string; personId: string; role: Role; sandbox: boolean };

export const COOKIE_SANDBOX = 'hd_sbx';
export const COOKIE_AS = 'hd_as';
export const COOKIE_LINK = 'hd_link';
export const SANDBOX_COOKIE_MAX_AGE = 24 * 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Person roles a viewer role may be played by. Children are never viewers. */
const PLAYED_BY: Record<Role, readonly string[]> = {
  parent: ['parent'],
  director: ['director'],
  buddy: ['buddy'],
  leader: ['leader', 'buddy'],
};

export type ViewerInput = { sbx?: string | null; as?: string | null; link?: string | null; now?: number };

/** hd_as is `personId` or `personId:leader` (room-leader persona played by a buddy). */
export function parseAs(raw: string): { personId: string; role: 'leader' | null } | null {
  const [personId, flag, ...rest] = raw.split(':');
  if (rest.length > 0 || !UUID.test(personId)) return null;
  if (flag === undefined) return { personId, role: null };
  return flag === 'leader' ? { personId, role: 'leader' } : null;
}

async function resolveIn(churchId: string, personId: string, role: Role | null): Promise<Viewer | null> {
  const church = await getChurch(churchId);
  if (!church) return null;
  const person = await getPersonInChurch(churchId, personId);
  if (!person) return null;
  const effective = role ?? (person.role === 'child' ? null : (person.role as Role));
  if (!effective || !PLAYED_BY[effective].includes(person.role)) return null;
  return { churchId, personId, role: effective, sandbox: church.mode === 'sandbox' };
}

export async function resolveViewer(input: ViewerInput): Promise<Viewer | null> {
  if (input.link) {
    const claims = verifyLink(input.link, input.now);
    if (!claims || !UUID.test(claims.c) || !UUID.test(claims.p)) return null;
    return resolveIn(claims.c, claims.p, claims.r);
  }
  if (input.sbx && input.as) {
    const churchId = verifyValue(input.sbx);
    const as = parseAs(input.as);
    if (!churchId || !UUID.test(churchId) || !as) return null;
    const viewer = await resolveIn(churchId, as.personId, as.role);
    return viewer?.sandbox ? viewer : null;
  }
  return null;
}

export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  return resolveViewer({
    link: jar.get(COOKIE_LINK)?.value,
    sbx: jar.get(COOKIE_SANDBOX)?.value,
    as: jar.get(COOKIE_AS)?.value,
  });
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge };
}
