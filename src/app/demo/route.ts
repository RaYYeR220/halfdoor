import { NextResponse } from 'next/server';
import { countSandboxesSince } from '@/db/repo/churches';
import { listPeople } from '@/db/repo/people';
import { createSandbox, purgeExpiredSandboxes } from '@/db/sandbox';
import { hashClient, signValue } from '@/lib/auth/tokens';
import { COOKIE_AS, COOKIE_SANDBOX, SANDBOX_COOKIE_MAX_AGE, cookieOptions } from '@/lib/auth/viewer';

const PER_IP_PER_HOUR = 5;
const PER_DAY = 300;
const BOT_UA = /slackbot|facebookexternalhit|twitterbot|discordbot|linkedinbot|whatsapp|telegrambot|googlebot|bingbot/i;

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || req.headers.get('x-real-ip') || 'unknown';
}

/** Link unfurlers and HEAD probes must not create a sandbox. */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: Request) {
  if (BOT_UA.test(req.headers.get('user-agent') ?? '')) {
    return new NextResponse('<!doctype html><title>Halfdoor</title><p>Open in a browser to try the demo church</p>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const now = new Date();
  const creatorHash = hashClient(clientIp(req));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [mine, today] = await Promise.all([
    countSandboxesSince(new Date(now.getTime() - 3600_000), creatorHash),
    countSandboxesSince(dayStart),
  ]);
  if (mine >= PER_IP_PER_HOUR || today >= PER_DAY) {
    return new NextResponse('Too many demo churches from this connection. Try again in an hour.', { status: 429 });
  }

  await purgeExpiredSandboxes();
  const { churchId, slug } = await createSandbox({ creatorHash });
  const hannah = (await listPeople(churchId)).find((p) => p.role === 'director');
  if (!hannah) return new NextResponse('Sandbox is missing its director.', { status: 500 });
  const res = NextResponse.redirect(new URL(`/c/${slug}/desk`, req.url), 303);
  res.cookies.set(COOKIE_SANDBOX, signValue(churchId), cookieOptions(SANDBOX_COOKIE_MAX_AGE));
  res.cookies.set(COOKIE_AS, hannah.id, cookieOptions(SANDBOX_COOKIE_MAX_AGE));
  return res;
}
