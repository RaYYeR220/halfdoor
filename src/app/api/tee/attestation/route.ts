import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/viewer';
import { fetchAttestationWithRetry } from '@/lib/venice/request';
import { VENICE_BASE, modelId, nonceHex } from '@/lib/venice/teeProxy';

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const model = modelId.safeParse(sp.get('model'));
  const nonce = nonceHex.safeParse(sp.get('nonce'));
  if (!model.success || !nonce.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  try {
    // Venice 429 (attestation rate limit per key+model) is retried with backoff before giving up with 502.
    const res = await fetchAttestationWithRetry(`${VENICE_BASE}/tee/attestation?model=${model.data}&nonce=${nonce.data}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 });
    return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 });
  }
}
