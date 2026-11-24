import { NextResponse } from 'next/server';
import { listPeople } from '@/db/repo/people';
import { childInChurch, fail, isParentOf, requireViewer } from '@/lib/access/api';
import { readAccessLog } from '@/lib/access/log';
import { toAccessRows } from '@/lib/parent/server';

/**
 * Who opened a child's card and when. The child's parent or the director, scoped to the viewer's church.
 * readAccessLog closes buddy/leader sessions whose service window has ended before answering.
 */
export async function GET(req: Request) {
  const viewer = await requireViewer(['parent', 'director']);
  if (viewer instanceof NextResponse) return viewer;
  const childId = new URL(req.url).searchParams.get('child') ?? '';
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  if (viewer.role === 'parent' && !(await isParentOf(viewer, childId))) return fail('forbidden', 403);

  const entries = await readAccessLog(viewer.churchId, childId, new Date());
  if (!entries) return fail('not_found', 404);
  const rows = toAccessRows(entries, await listPeople(viewer.churchId), viewer.personId);
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}
