import { NextResponse } from 'next/server';
import { getCardForChild, updateCard } from '@/db/repo/cards';
import { getChurch } from '@/db/repo/churches';
import { childInChurch, fail, readJson, requireViewer } from '@/lib/access/api';
import { sealJson } from '@/lib/crypto/atrest';

const MAX_NOTE = 2000;

export async function PUT(req: Request, ctx: RouteContext<'/api/cards/[childId]/team-notes'>) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const { childId } = await ctx.params;
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const text = (await readJson(req))?.text;
  if (typeof text !== 'string' || text.length > MAX_NOTE) return fail('invalid_text', 400);
  const card = await getCardForChild(viewer.churchId, childId);
  const church = await getChurch(viewer.churchId);
  if (!card || !church) return fail('not_found', 404);
  // An empty note clears it.
  await updateCard(card.id, { teamNotesEnc: text.trim() ? sealJson(church.wrappedDek, text.trim()) : null });
  return NextResponse.json({ ok: true });
}
