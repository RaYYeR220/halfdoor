import { NextResponse } from 'next/server';
import { clientIp } from '@/lib/auth/clientIp';
import { getViewer } from '@/lib/auth/viewer';
import { testFixtureMode } from '@/lib/testing/fixtureMode';
import { attestationKeys, attestationLimiter } from '@/lib/venice/attestRate';
import { fetchAttestationWithRetry } from '@/lib/venice/request';
import { VENICE_BASE, modelId, nonceHex } from '@/lib/venice/teeProxy';

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // The end-to-end test seam replays recorded outputs in the browser; while it is on, nothing reaches Venice.
  if (testFixtureMode()) return NextResponse.json({ error: 'test_fixture_mode' }, { status: 409 });

  const sp = new URL(req.url).searchParams;
  const model = modelId.safeParse(sp.get('model'));
  const nonce = nonceHex.safeParse(sp.get('nonce'));
  if (!model.success || !nonce.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  // A soft limit per person and per client (and a higher one per church), so one tab or one script can't spend the
  // key's attestation budget, and one member can't spend the church's.
  const rate = attestationLimiter.take(attestationKeys(viewer, clientIp(req)), Date.now());
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'rate_limited', reason: 'attestation_rate' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))), 'Cache-Control': 'no-store' } },
    );
  }

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
