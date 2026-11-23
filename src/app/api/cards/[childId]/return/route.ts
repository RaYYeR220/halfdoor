import { NextResponse } from 'next/server';
import { getCardForChild, updateCard } from '@/db/repo/cards';
import { getChurch } from '@/db/repo/churches';
import { childInChurch, fail, readJson, requireViewer } from '@/lib/access/api';
import { sealJson } from '@/lib/crypto/atrest';

export async function POST(req: Request, ctx: RouteContext<'/api/cards/[childId]/return'>) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const { childId } = await ctx.params;
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const question = (await readJson(req))?.question;
  if (typeof question !== 'string' || question.trim().length === 0 || question.length > 500) return fail('invalid_question', 400);
  const card = await getCardForChild(viewer.churchId, childId);
  const church = await getChurch(viewer.churchId);
  if (!card || !church) return fail('not_found', 404);
  if (card.status !== 'parent_approved' && card.status !== 'acknowledged') return fail('conflict', 409);
  // Sealed: the question often quotes card content.
  await updateCard(card.id, { status: 'returned', returnedQuestionEnc: sealJson(church.wrappedDek, question.trim()), directorAckAt: null });
  return NextResponse.json({ ok: true, status: 'returned' });
}
