import { NextResponse } from 'next/server';
import { listAssignments } from '@/db/repo/assignments';
import { listPeople } from '@/db/repo/people';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, fail, requireViewer } from '@/lib/access/api';

/** Director: the service's assignments (proposed and decided) with names. */
export async function GET(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const serviceId = new URL(req.url).searchParams.get('service') ?? '';
  if (!UUID.test(serviceId)) return fail('bad_request', 400);
  if (!(await getServiceInChurch(viewer.churchId, serviceId))) return fail('not_found', 404);
  const name = new Map((await listPeople(viewer.churchId)).map((p) => [p.id, p.firstName]));
  const rows = await listAssignments(serviceId);
  return NextResponse.json({
    assignments: rows.map((r) => ({
      id: r.id, childId: r.childId, childName: name.get(r.childId) ?? '', buddyId: r.buddyId,
      buddyName: name.get(r.buddyId) ?? '', status: r.status, reasons: r.reasons as string[],
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
