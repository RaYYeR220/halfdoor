import { NextResponse } from 'next/server';
import { listPeople } from '@/db/repo/people';
import { createSandbox, purgeExpiredSandboxes } from '@/db/sandbox';
import { signValue } from '@/lib/auth/tokens';
import { COOKIE_AS, COOKIE_SANDBOX, SANDBOX_COOKIE_MAX_AGE, cookieOptions } from '@/lib/auth/viewer';

export async function GET(req: Request) {
  await purgeExpiredSandboxes();
  const { churchId, slug } = await createSandbox();
  const hannah = (await listPeople(churchId)).find((p) => p.role === 'director');
  if (!hannah) return new NextResponse('Sandbox is missing its director.', { status: 500 });
  const res = NextResponse.redirect(new URL(`/c/${slug}/desk`, req.url), 303);
  res.cookies.set(COOKIE_SANDBOX, signValue(churchId), cookieOptions(SANDBOX_COOKIE_MAX_AGE));
  res.cookies.set(COOKIE_AS, hannah.id, cookieOptions(SANDBOX_COOKIE_MAX_AGE));
  return res;
}
