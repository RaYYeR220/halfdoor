import { fail } from '@/lib/access/api';
import { isPinnedPictogram, upstreamPictogramUrl } from '@/lib/schedule/arasaac';

/**
 * Proxies one pinned ARASAAC pictogram (300 px PNG). Only ids in the pinned allowlist are served.
 * Pictograms: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC BY-NC-SA. Owner: Government of Aragon (Spain).
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/pictogram/[id]'>) {
  const { id: raw } = await ctx.params;
  const id = /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(id) || !isPinnedPictogram(id)) return fail('not_found', 404);
  const up = await fetch(upstreamPictogramUrl(id), { signal: AbortSignal.timeout(5000), redirect: 'error' }).catch(() => null);
  if (!up || !up.ok || !(up.headers.get('content-type') ?? '').startsWith('image/png')) return fail('upstream', 502);
  return new Response(up.body, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
