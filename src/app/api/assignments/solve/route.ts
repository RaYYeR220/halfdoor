import { NextResponse } from 'next/server';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, fail, readJson, requireViewer } from '@/lib/access/api';
import { solveService } from '@/lib/solver/inputs';

/**
 * Director: replace this service's proposed buddy matches. Approved/scheduled rows are never touched.
 * `includeChildIds` adds children who are not expected at this service (no recent check-in here) by hand.
 */
export async function POST(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const serviceId = typeof body?.serviceId === 'string' ? body.serviceId : '';
  if (!UUID.test(serviceId)) return fail('bad_request', 400);
  const include = body?.includeChildIds;
  if (include !== undefined && !(Array.isArray(include) && include.length <= 200 && include.every((i) => typeof i === 'string' && UUID.test(i)))) {
    return fail('bad_request', 400);
  }
  const service = await getServiceInChurch(viewer.churchId, serviceId);
  if (!service) return fail('not_found', 404);
  return NextResponse.json(await solveService(viewer.churchId, service, (include as string[] | undefined) ?? []));
}
