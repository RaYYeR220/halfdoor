import { NextResponse } from 'next/server';
import { getChurch } from '@/db/repo/churches';
import { fail, requireViewer } from '@/lib/access/api';
import { loadLedger } from '@/lib/desk/server';

/**
 * Director: every AI call this church made (purpose, model, end-to-end or plain, the attestation record the browser
 * reported, tokens, cost), newest first, with totals. Rows never hold prompts or answers, so none are returned.
 */
export async function GET() {
  const viewer = await requireViewer(['director']);
  if (viewer instanceof NextResponse) return viewer;
  const church = await getChurch(viewer.churchId);
  if (!church) return fail('not_found', 404);
  return NextResponse.json(await loadLedger(church), { headers: { 'Cache-Control': 'no-store' } });
}
