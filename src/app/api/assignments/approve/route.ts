import { NextResponse } from 'next/server';
import { approveProposed, getAssignmentsInChurch } from '@/db/repo/assignments';
import { UUID, fail, readJson, requireViewer } from '@/lib/access/api';
import { onAssignmentApproved } from '@/lib/pco/hooks';

const MAX_IDS = 200;

/** Director: proposed -> approved. Any id outside the viewer's church fails the whole call with 404. */
export async function POST(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const ids = body?.assignmentIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((i) => typeof i === 'string' && UUID.test(i))) {
    return fail('bad_request', 400);
  }
  const unique = [...new Set(ids as string[])];
  if ((await getAssignmentsInChurch(viewer.churchId, unique)).length !== unique.length) return fail('not_found', 404);
  const flipped = await approveProposed(unique);
  for (const a of flipped) await onAssignmentApproved(viewer.churchId, a.id);
  return NextResponse.json({ approved: flipped.map((a) => a.id) });
}
