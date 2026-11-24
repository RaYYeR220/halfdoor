import { NextResponse } from 'next/server';
import { getChurch } from '@/db/repo/churches';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, fail, requireViewer } from '@/lib/access/api';
import { loadBuddyToday } from '@/lib/buddy/server';

/**
 * Buddy: today's services where they have an approved match, with each child's first name, grade and whether the
 * card is ready (reviewed). Never card content: that comes from GET /api/cards/:id once the child is checked in.
 */
export async function GET(req: Request) {
  const viewer = await requireViewer(['buddy']);
  if (viewer instanceof NextResponse) return viewer;
  const service = new URL(req.url).searchParams.get('service');
  if (service !== null && (!UUID.test(service) || !(await getServiceInChurch(viewer.churchId, service)))) return fail('not_found', 404);
  const church = await getChurch(viewer.churchId);
  if (!church) return fail('not_found', 404);
  const { services } = await loadBuddyToday(church, viewer.personId, new Date(), service ?? undefined);
  return NextResponse.json({ services }, { headers: { 'Cache-Control': 'no-store' } });
}
