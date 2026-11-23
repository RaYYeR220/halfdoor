import { NextResponse } from 'next/server';
import { getCardForChild } from '@/db/repo/cards';
import { getChurch } from '@/db/repo/churches';
import { listLessons } from '@/db/repo/lessons';
import { listPeople } from '@/db/repo/people';
import { listMoments } from '@/db/repo/moments';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, childInChurch, fail, requireViewer } from '@/lib/access/api';
import { redactName } from '@/lib/card/prompts';
import type { CardItem } from '@/lib/card/schema';
import { openJson } from '@/lib/crypto/atrest';
import type { MomentView } from '@/lib/note/schema';
import { stepsFor } from '@/lib/note/server';

/** The director's browser drafts the note itself (enclave), so it needs the moments, decrypted. Nothing else of the card. */
export async function GET(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get('service') ?? '';
  const childId = url.searchParams.get('child') ?? '';
  if (!UUID.test(serviceId)) return fail('not_found', 404);
  const child = await childInChurch(viewer, childId);
  const service = child ? await getServiceInChurch(viewer.churchId, serviceId) : undefined;
  const church = await getChurch(viewer.churchId);
  if (!child || !service || !church) return fail('not_found', 404);

  const card = await getCardForChild(viewer.churchId, childId);
  const items = new Map((card ? openJson<CardItem[]>(church.wrappedDek, card.itemsEnc) : []).map((i) => [i.id, i.text]));
  const steps = new Map(stepsFor(await listLessons(viewer.churchId), service).map((s) => [s.key, s.label]));
  // A buddy's free text may name other children; they never reach the model.
  const others = (await listPeople(viewer.churchId)).filter((x) => x.role === 'child' && x.id !== childId).map((x) => x.firstName);
  const scrub = (t: string) => others.reduce((acc, n) => redactName(acc, n, 'another child').text, t);
  const moments: (MomentView & { at: string })[] = (await listMoments(serviceId))
    .filter((m) => m.childId === childId)
    .map((m) => ({
      id: m.id,
      step: (m.stepKey && steps.get(m.stepKey)) || (m.stepKey && m.stepKey !== 'other' ? m.stepKey : 'Other'),
      kind: m.kind,
      helped: (m.helpedItemIds ?? []).flatMap((id) => (items.has(id) ? [items.get(id)!] : [])),
      ...(m.noteEnc ? { note: scrub(openJson<string>(church.wrappedDek, m.noteEnc)) } : {}),
      at: m.at.toISOString(),
    }));
  return NextResponse.json({ childFirstName: child.firstName, lang: card?.lang === 'es' ? 'es' : 'en', moments });
}
