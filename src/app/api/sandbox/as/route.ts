import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  COOKIE_AS, COOKIE_SANDBOX, SANDBOX_COOKIE_MAX_AGE, cookieOptions, resolveViewer,
} from '@/lib/auth/viewer';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { personId?: unknown } | null;
  const personId = typeof body?.personId === 'string' ? body.personId : null;
  const sbx = (await cookies()).get(COOKIE_SANDBOX)?.value;
  if (!personId || !sbx) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  // Only a person of the church named by the signed sandbox cookie is accepted.
  const viewer = await resolveViewer({ sbx, as: personId });
  if (!viewer) return NextResponse.json({ error: 'not a person of this sandbox' }, { status: 400 });
  const res = NextResponse.json({ ok: true, role: viewer.role });
  res.cookies.set(COOKIE_AS, personId, cookieOptions(SANDBOX_COOKIE_MAX_AGE));
  return res;
}
