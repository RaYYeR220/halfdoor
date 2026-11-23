import { NextResponse } from 'next/server';
import { listAssignmentsForChild } from '@/db/repo/assignments';
import { listLessons } from '@/db/repo/lessons';
import { listMomentsForChild } from '@/db/repo/moments';
import { listServices } from '@/db/repo/services';
import { childInChurch, fail, requireViewer } from '@/lib/access/api';
import { stepsFor } from '@/lib/note/server';
import { patterns } from '@/lib/patterns';

/** Plain counts over the child's finished services. Director only. */
export async function GET(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const childId = new URL(req.url).searchParams.get('child') ?? '';
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);

  const now = Date.now();
  const moments = await listMomentsForChild(childId);
  const attended = new Set([
    ...moments.map((m) => m.serviceId),
    ...(await listAssignmentsForChild(childId)).filter((a) => a.status !== 'proposed').map((a) => a.serviceId),
  ]);
  const lessons = await listLessons(viewer.churchId);
  // Tenant scope: only this church's services, and only ones already over.
  const steps: Record<string, ReturnType<typeof stepsFor>> = {};
  for (const s of await listServices(viewer.churchId)) {
    if (attended.has(s.id) && s.endsAt.getTime() <= now) steps[s.id] = stepsFor(lessons, s);
  }
  const rows = moments.filter((m) => m.stepKey && steps[m.serviceId]).map((m) => ({ id: m.id, stepKey: m.stepKey!, serviceId: m.serviceId, kind: m.kind }));
  return NextResponse.json({ patterns: patterns(rows, steps) });
}
