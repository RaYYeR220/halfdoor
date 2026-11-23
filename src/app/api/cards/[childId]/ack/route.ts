import { NextResponse } from 'next/server';
import { getCardForChild, updateCard } from '@/db/repo/cards';
import { childInChurch, fail, requireViewer } from '@/lib/access/api';

export async function POST(_req: Request, ctx: RouteContext<'/api/cards/[childId]/ack'>) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const { childId } = await ctx.params;
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const card = await getCardForChild(viewer.churchId, childId);
  if (!card) return fail('not_found', 404);
  if (card.status !== 'parent_approved') return fail('conflict', 409);
  const now = new Date();
  await updateCard(card.id, { status: 'acknowledged', directorAckAt: now });
  return NextResponse.json({ ok: true, status: 'acknowledged', directorAckAt: now.toISOString() });
}
