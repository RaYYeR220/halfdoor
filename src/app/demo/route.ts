import { NextResponse } from 'next/server';
import { listPeople } from '@/db/repo/people';
import { createSandboxReserved, purgeExpiredSandboxes } from '@/db/sandbox';
import { purgeExpiredCards } from '@/lib/access/purge';
import { clientIp } from '@/lib/auth/clientIp';
import { hashClient, signValue } from '@/lib/auth/tokens';
import { isBot } from '@/lib/demo/bots';
import { COOKIE_AS, COOKIE_SANDBOX, SANDBOX_COOKIE_MAX_AGE, cookieOptions } from '@/lib/auth/viewer';


/** Link unfurlers and HEAD probes must not create a sandbox. */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: Request) {
  if (isBot(req.headers.get('user-agent'))) {
    return new NextResponse('<!doctype html><title>Halfdoor</title><p>Open in a browser to try the demo church</p>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Best effort, logged by error name only: a failed purge must never keep a visitor out of the demo.
  await purgeExpiredSandboxes().catch((err) => console.error('sandbox purge failed:', err instanceof Error ? err.name : 'unknown'));
  await purgeExpiredCards().catch((err) => console.error('card purge failed:', err instanceof Error ? err.name : 'unknown'));
  const made = await createSandboxReserved(hashClient(clientIp(req)));
  if (!made) return new NextResponse('Too many demo churches from this connection. Try again in an hour.', { status: 429 });
  const { churchId, slug } = made;
  const hannah = (await listPeople(churchId)).find((p) => p.role === 'director');
  if (!hannah) return new NextResponse('Sandbox is missing its director.', { status: 500 });
  const res = NextResponse.redirect(new URL(`/c/${slug}/desk`, req.url), 303);
  res.cookies.set(COOKIE_SANDBOX, signValue(churchId), cookieOptions(SANDBOX_COOKIE_MAX_AGE));
  res.cookies.set(COOKIE_AS, hannah.id, cookieOptions(SANDBOX_COOKIE_MAX_AGE));
  return res;
}
