import { NextResponse } from 'next/server';
import { requireViewer } from '@/lib/access/api';
import { sortChildren } from '@/lib/desk/helpers';
import { loadChildren } from '@/lib/desk/server';

/** Director: every child of the church with the card's status, support level and last update. No card content. */
export async function GET() {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const children = sortChildren(await loadChildren(viewer.churchId));
  return NextResponse.json({ children }, { headers: { 'Cache-Control': 'no-store' } });
}
