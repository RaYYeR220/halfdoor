import { NextResponse } from 'next/server';
import { getChurch } from '@/db/repo/churches';
import { verifyLink } from '@/lib/auth/tokens';
import { COOKIE_LINK, cookieOptions, resolveViewer } from '@/lib/auth/viewer';

const EXPIRED = "This link has expired. Ask your kids' director for a new one.";

export async function GET(req: Request, ctx: RouteContext<'/p/[token]'>) {
  const { token } = await ctx.params;
  const claims = verifyLink(token);
  const viewer = claims && claims.r === 'parent' ? await resolveViewer({ link: token }) : null;
  const church = viewer && (await getChurch(viewer.churchId));
  if (!claims || !viewer || !church) return new NextResponse(EXPIRED, { status: 403 });
  const res = NextResponse.redirect(new URL(`/c/${church.slug}/parent/${viewer.personId}`, req.url), 303);
  res.cookies.set(COOKIE_LINK, token, cookieOptions(Math.max(1, claims.exp - Math.floor(Date.now() / 1000))));
  return res;
}
