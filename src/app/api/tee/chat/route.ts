import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth/viewer';
import { checkBudget } from '@/lib/venice/budget';
import { ChatBody, VENICE_BASE, buildUpstreamBody, recordFailure, relayAndRecord, upstreamHeaders } from '@/lib/venice/teeProxy';

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = ChatBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const body = parsed.data;

  const budget = await checkBudget(viewer.churchId);
  if (!budget.ok) return NextResponse.json({ reason: budget.reason }, { status: 429 });

  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const base = { churchId: viewer.churchId, purpose: body.purpose, model: body.model, attestation: body.attestation ?? null };
  let upstream: Response;
  try {
    upstream = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders(apiKey, body),
      body: JSON.stringify(buildUpstreamBody(body)),
      signal: req.signal,
    });
  } catch {
    await recordFailure(base);
    return NextResponse.json({ error: 'upstream unavailable' }, { status: 502 });
  }
  if (upstream.status !== 200 || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    await recordFailure(base);
    return NextResponse.json({ error: 'upstream error' }, { status: upstream.status === 200 ? 502 : upstream.status });
  }
  return new Response(relayAndRecord(upstream.body, base), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform' },
  });
}
