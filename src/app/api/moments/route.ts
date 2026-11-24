import { NextResponse } from 'next/server';
import { getChurch } from '@/db/repo/churches';
import { listLessons } from '@/db/repo/lessons';
import { insertMoments, listMoments } from '@/db/repo/moments';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, childInChurch, fail, readJson, requireViewer } from '@/lib/access/api';
import { evaluateGate } from '@/lib/access/read';
import type { CardItem } from '@/lib/card/schema';
import { openJson, sealJson } from '@/lib/crypto/atrest';
import { MAX_MOMENT_NOTE_CHARS, MOMENT_KINDS, type MomentKind } from '@/lib/note/schema';
import { stepsFor } from '@/lib/note/server';

/**
 * Buddy: the moments they logged with this child at this service, under the same gate as the card (assigned,
 * checked in, inside the window). The phone lists them under the logger and drops them at checkout.
 */
export async function GET(req: Request) {
  const viewer = await requireViewer(['buddy']);
  if (viewer instanceof NextResponse) return viewer;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get('service') ?? '';
  const childId = url.searchParams.get('child') ?? '';
  if (!UUID.test(serviceId) || !UUID.test(childId)) return fail('not_found', 404);
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const ev = await evaluateGate(viewer, childId, serviceId, 'full', new Date());
  if (!ev) return fail('not_found', 404);
  if (!ev.result.allowed) return NextResponse.json({ error: 'forbidden', reason: ev.result.reason }, { status: 403 });
  const church = await getChurch(viewer.churchId);
  if (!church) return fail('not_found', 404);
  const rows = (await listMoments(serviceId)).filter((m) => m.childId === childId && m.buddyId === viewer.personId);
  return NextResponse.json({
    moments: rows.map((m) => ({
      id: m.id, stepKey: m.stepKey ?? 'other', kind: m.kind, helpedItemIds: m.helpedItemIds ?? [],
      note: m.noteEnc ? openJson<string>(church.wrappedDek, m.noteEnc) : null, at: m.at.toISOString(),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const viewer = await requireViewer(['buddy']);
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  if (!body) return fail('invalid_moment', 400);
  const { serviceId, childId, stepKey, kind, helpedItemIds, note } = body;
  if (typeof serviceId !== 'string' || !UUID.test(serviceId) || typeof childId !== 'string' || !UUID.test(childId)) return fail('invalid_moment', 400);
  if (typeof stepKey !== 'string' || !stepKey || stepKey.length > 64) return fail('invalid_moment', 400);
  if (typeof kind !== 'string' || !(MOMENT_KINDS as readonly string[]).includes(kind)) return fail('invalid_moment', 400);
  if (helpedItemIds !== undefined && (!Array.isArray(helpedItemIds) || helpedItemIds.some((x) => typeof x !== 'string'))) return fail('invalid_moment', 400);
  if (kind === 'note' && (typeof note !== 'string' || !note.trim())) return fail('note_required', 400);
  if (note !== undefined && (typeof note !== 'string' || note.length > MAX_MOMENT_NOTE_CHARS)) return fail('invalid_moment', 400);

  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const now = new Date();
  // Same rule as reading the card: assigned, checked in, inside the window.
  const ev = await evaluateGate(viewer, childId, serviceId, 'full', now);
  if (!ev) return fail('not_found', 404);
  if (!ev.result.allowed) return NextResponse.json({ error: 'forbidden', reason: ev.result.reason }, { status: 403 });
  const service = await getServiceInChurch(viewer.churchId, serviceId);
  const church = await getChurch(viewer.churchId);
  if (!service || !church) return fail('not_found', 404);

  if (stepKey !== 'other' && !stepsFor(await listLessons(viewer.churchId), service).some((s) => s.key === stepKey)) return fail('unknown_step', 400);
  const helped = [...new Set((helpedItemIds as string[] | undefined) ?? [])];
  if (helped.length > 0) {
    const ids = new Set(openJson<CardItem[]>(church.wrappedDek, ev.card.itemsEnc).map((i) => i.id));
    if (helped.some((x) => !ids.has(x))) return fail('unknown_item', 400);
  }
  const text = typeof note === 'string' ? note.trim() : '';
  const [row] = await insertMoments([{
    serviceId, childId, buddyId: viewer.personId, stepKey, kind: kind as MomentKind,
    helpedItemIds: helped, noteEnc: text ? sealJson(church.wrappedDek, text) : null, at: now,
  }]);
  return NextResponse.json({ id: row.id });
}
