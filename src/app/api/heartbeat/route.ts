import { NextResponse } from 'next/server';
import { UUID, fail, requireViewer } from '@/lib/access/api';
import { heartbeat } from '@/lib/checkins/heartbeat';

export async function GET(req: Request) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const service = new URL(req.url).searchParams.get('service');
  if (!service || !UUID.test(service)) return fail('bad_request', 400);
  const out = await heartbeat(viewer, service, new Date());
  if (!out) return fail('not_found', 404);
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
