import { NextResponse } from 'next/server';
import { fail, requireViewer } from '@/lib/access/api';
import { readDemoState } from '@/lib/demo/state';

/** The demo guide's step flags. Sandbox personas only; scoped to the viewer's own church. */
export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.sandbox) return fail('forbidden', 403);
  const state = await readDemoState(viewer.churchId);
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
}
