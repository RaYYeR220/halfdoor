import { NextResponse } from 'next/server';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, fail, readJson, requireViewer } from '@/lib/access/api';
import { solveService } from '@/lib/solver/inputs';

/** Director: replace this service's proposed buddy matches. Approved/scheduled rows are never touched. */
export async function POST(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const serviceId = typeof body?.serviceId === 'string' ? body.serviceId : '';
  if (!UUID.test(serviceId)) return fail('bad_request', 400);
  const service = await getServiceInChurch(viewer.churchId, serviceId);
  if (!service) return fail('not_found', 404);
  return NextResponse.json(await solveService(viewer.churchId, service));
}
