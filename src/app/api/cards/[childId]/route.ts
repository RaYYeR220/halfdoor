import { NextResponse } from 'next/server';
import { deleteCardData, getCardForChild, insertCard, updateCard } from '@/db/repo/cards';
import { getChurch } from '@/db/repo/churches';
import { UUID, childInChurch, fail, isParentOf, readJson, requireViewer } from '@/lib/access/api';
import { openCard } from '@/lib/access/read';
import { parseCardBody } from '@/lib/card/validate';
import { sealJson } from '@/lib/crypto/atrest';
import { RETENTION_MS } from '@/lib/access/retention';
import { onCardApproved } from '@/lib/pco/hooks';

export async function GET(req: Request, ctx: RouteContext<'/api/cards/[childId]'>) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { childId } = await ctx.params;
  if (!UUID.test(childId)) return fail('not_found', 404);
  const url = new URL(req.url);
  const service = url.searchParams.get('service');
  if (service !== null && !UUID.test(service)) return fail('not_found', 404);
  const scope = url.searchParams.get('scope') === 'safety' ? 'safety' : 'full';

  const out = await openCard(viewer, childId, service, scope, new Date());
  switch (out.kind) {
    case 'not_found': return fail('not_found', 404);
    case 'forbidden': return fail('forbidden', 403);
    case 'locked': return NextResponse.json({ locked: true, reason: out.reason });
    case 'open': return NextResponse.json({ locked: false, card: out.card });
  }
}

export async function PUT(req: Request, ctx: RouteContext<'/api/cards/[childId]'>) {
  const viewer = await requireViewer(['parent']);
  if (viewer instanceof NextResponse) return viewer;
  const { childId } = await ctx.params;
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  if (!(await isParentOf(viewer, childId))) return fail('forbidden', 403);
  const body = parseCardBody(await readJson(req));
  if (!body) return fail('invalid_card', 400);
  const church = await getChurch(viewer.churchId);
  if (!church) return fail('not_found', 404);

  const now = new Date();
  const existing = await getCardForChild(viewer.churchId, childId);
  const base = { lang: body.lang, supportLevel: body.supportLevel, itemsEnc: sealJson(church.wrappedDek, body.items), tags: body.tags };
  // Any edit voids the director's acknowledgement: the content changed after they read it.
  const approval = body.approve
    ? { status: 'parent_approved' as const, parentApprovedAt: now, directorAckAt: null, returnedQuestionEnc: null, retainUntil: new Date(now.getTime() + RETENTION_MS) }
    : { status: 'draft' as const, directorAckAt: null, retainUntil: new Date(now.getTime() + RETENTION_MS) };
  let version: number;
  if (existing) {
    version = body.approve ? existing.version + 1 : existing.version;
    await updateCard(existing.id, { ...base, ...approval, version });
  } else {
    version = 1;
    await insertCard({ churchId: viewer.churchId, childId, ...base, ...approval, version });
  }
  if (body.approve && (church.mode === 'live' || church.mode === 'pco')) await onCardApproved(viewer.churchId, childId, now);
  return NextResponse.json({ ok: true, status: approval.status, version });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/cards/[childId]'>) {
  const viewer = await requireViewer(['parent']);
  if (viewer instanceof NextResponse) return viewer;
  const { childId } = await ctx.params;
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  if (!(await isParentOf(viewer, childId))) return fail('forbidden', 403);
  const card = await getCardForChild(viewer.churchId, childId);
  if (!card) return fail('not_found', 404);
  await deleteCardData(card, { personId: viewer.personId, role: viewer.role }, new Date());
  return NextResponse.json({ ok: true });
}
