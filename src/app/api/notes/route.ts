import { NextResponse } from 'next/server';
import { getCardForChild } from '@/db/repo/cards';
import { getChurch } from '@/db/repo/churches';
import { listMoments } from '@/db/repo/moments';
import { listNotesForChild, upsertNote } from '@/db/repo/notes';
import { getServiceInChurch } from '@/db/repo/services';
import { UUID, childInChurch, fail, isParentOf, readJson, requireViewer } from '@/lib/access/api';
import { openJson, sealJson } from '@/lib/crypto/atrest';
import { NoteDraft } from '@/lib/note/schema';
import { verifyNote } from '@/lib/note/verify';

type Sentences = { text: string; evidence: string[] }[];

/** Director: save a draft or approve it. Evidence is re-checked here against this child's moments at this service. */
export async function POST(req: Request) {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  if (!body) return fail('invalid_note', 400);
  const { serviceId, childId, sentences, approve, acknowledgeFlags } = body;
  if (typeof serviceId !== 'string' || !UUID.test(serviceId) || typeof childId !== 'string') return fail('invalid_note', 400);
  if (typeof approve !== 'boolean') return fail('invalid_note', 400);
  const parsed = NoteDraft.safeParse({ sentences });
  if (!parsed.success) return fail('invalid_note', 400);

  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  const service = await getServiceInChurch(viewer.churchId, serviceId);
  const church = await getChurch(viewer.churchId);
  if (!service || !church) return fail('not_found', 404);

  const ids = new Set((await listMoments(serviceId)).filter((m) => m.childId === childId).map((m) => m.id));
  if (parsed.data.sentences.some((s) => s.evidence.some((id) => !ids.has(id)))) return fail('bad_evidence', 400);
  const card = await getCardForChild(viewer.churchId, childId);
  const lang = card?.lang === 'es' ? 'es' : 'en';
  const verified = verifyNote(parsed.data, ids, lang);

  // Flags first: nothing is written when an approval still needs the director's eyes on them.
  const flags = verified.sentences.map((s) => s.flags);
  if (approve && flags.some((f) => f.length > 0) && acknowledgeFlags !== true) {
    return NextResponse.json({ error: 'flags_need_review', flags }, { status: 409 });
  }

  const values = {
    lang,
    draftEnc: sealJson(church.wrappedDek, parsed.data.sentences),
    evidence: [...new Set(parsed.data.sentences.flatMap((s) => s.evidence))],
    status: approve ? ('approved' as const) : ('draft' as const),
    approvedAt: approve ? new Date() : null,
  };
  const { id } = await upsertNote({ serviceId, childId, ...values });
  // Judgment words are shown to the director, never silently removed.
  return NextResponse.json({ id, status: values.status, flags });
}

/** Parent of the child: approved notes only. Director: drafts and approved. Decrypted. */
export async function GET(req: Request) {
  const viewer = await requireViewer(['parent', 'director']);
  if (viewer instanceof NextResponse) return viewer;
  const childId = new URL(req.url).searchParams.get('child') ?? '';
  if (!(await childInChurch(viewer, childId))) return fail('not_found', 404);
  if (viewer.role === 'parent' && !(await isParentOf(viewer, childId))) return fail('forbidden', 403);
  const church = await getChurch(viewer.churchId);
  if (!church) return fail('not_found', 404);

  const rows = (await listNotesForChild(childId)).filter((n) => viewer.role === 'director' || n.status === 'approved');
  return NextResponse.json({
    notes: rows.map((n) => ({
      id: n.id,
      serviceId: n.serviceId,
      lang: n.lang,
      status: n.status,
      approvedAt: n.approvedAt?.toISOString() ?? null,
      sentences: openJson<Sentences>(church.wrappedDek, n.draftEnc).map((s) => (viewer.role === 'director' ? s : { text: s.text })),
    })),
  });
}
