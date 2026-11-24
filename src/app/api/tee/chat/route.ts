import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/viewer';
import { testFixtureMode } from '@/lib/testing/fixtureMode';
import { estimateUsd, reserveBudget } from '@/lib/venice/budget';
import { CAPS } from '@/lib/venice/prices';
import {
  ChatBody, VENICE_BASE, attestationForLedger, buildUpstreamBody, failReserved, relayAndRecord, upstreamHeaders,
} from '@/lib/venice/teeProxy';

const upstreamError = () => NextResponse.json({ error: 'upstream' }, { status: 502 });

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // The end-to-end test seam replays recorded outputs in the browser; while it is on, nothing reaches Venice.
  if (testFixtureMode()) return NextResponse.json({ error: 'test_fixture_mode' }, { status: 409 });

  const raw = await req.json().catch(() => null);
  const parsed = ChatBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const body = parsed.data;

  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  // Reserve worst-case spend under a lock BEFORE the upstream call (parallel or cancelled calls cannot beat the caps).
  const chars = body.messages.reduce((n, m) => n + m.content.length, 0);
  const { attestation, mismatch } = attestationForLedger(body);
  const res = await reserveBudget({
    churchId: viewer.churchId,
    purpose: body.purpose,
    model: body.model,
    estimateUsd: estimateUsd(body.model, chars, body.maxTokens ?? CAPS.maxTokens),
    attestation,
    attestationMismatch: mismatch,
  });
  if (!res.ok) return NextResponse.json({ reason: res.reason }, { status: 429 });
  const row = { id: res.id, model: body.model };

  let upstream: Response;
  try {
    upstream = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders(apiKey, body.clientPubKey, body.modelPubKey),
      body: JSON.stringify(buildUpstreamBody(body.model, body.messages, body.maxTokens)),
      signal: req.signal,
    });
  } catch {
    await failReserved(row, false); // aborted/timed out: the enclave may have run, keep the estimate
    return upstreamError();
  }
  if (upstream.status !== 200 || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    await failReserved(row, true); // real non-200: refused, not billed
    return upstreamError();
  }
  return new Response(relayAndRecord(upstream.body, row), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform' },
  });
}
