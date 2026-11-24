import { NextResponse } from 'next/server';
import { childInChurch, fail, requireViewer } from '@/lib/access/api';
import { patternInputs } from '@/lib/desk/patterns';

/** Plain counts over the child's finished services. Director only. */
export async function GET(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const childId = new URL(req.url).searchParams.get('child') ?? '';
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const { patterns } = await patternInputs(viewer.churchId, childId, Date.now());
  return NextResponse.json({ patterns });
}
