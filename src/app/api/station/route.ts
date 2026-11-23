import { NextResponse } from 'next/server';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, childInChurch, fail, readJson, requireViewer } from '@/lib/access/api';
import { stationAction } from '@/lib/checkins/station';

/** "Simulated check-in station": sandbox churches only; any persona may play the front desk. */
export async function POST(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.sandbox) return fail('forbidden', 403);
  const { serviceId, childId, action } = (await readJson(req)) ?? {};
  if (typeof serviceId !== 'string' || typeof childId !== 'string' || (action !== 'in' && action !== 'out')) return fail('bad_request', 400);
  if (!UUID.test(serviceId) || !(await getServiceInChurch(viewer.churchId, serviceId))) return fail('not_found', 404);
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const r = await stationAction(viewer.churchId, serviceId, childId, action, new Date());
  if (!r.ok) return fail(r.error, 409);
  return NextResponse.json({ ok: true, securityCode: r.securityCode, in: r.in });
}
