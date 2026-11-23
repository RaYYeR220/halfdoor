// SERVER-ONLY. Plain (non-enclave) Venice chat completion with a strict JSON schema, for Claude.
// Only for text that carries no child data (the church's own lesson). Child data never comes through here.
import { CAPS, type Usage } from './prices';
import { VENICE_BASE } from './request';

export const LESSON_MODEL = 'claude-sonnet-5-5';

export type ClaudeJsonArgs = {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export type ClaudeJsonResult =
  | { ok: true; content: string; usage: Usage | null }
  | { ok: false; status: number; usage: null };

/** One non-streaming call. `ok: false` carries only the HTTP status (never a body). */
export async function claudeJson(a: ClaudeJsonArgs): Promise<ClaudeJsonResult> {
  const f = a.fetchImpl ?? fetch;
  const res = await f(`${VENICE_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.apiKey}`, 'Content-Type': 'application/json' },
    signal: a.signal,
    body: JSON.stringify({
      model: a.model ?? LESSON_MODEL,
      messages: [{ role: 'system', content: a.system }, { role: 'user', content: a.user }],
      max_tokens: Math.min(a.maxTokens, CAPS.maxTokens),
      response_format: { type: 'json_schema', json_schema: { name: a.schemaName, strict: true, schema: a.schema } },
      venice_parameters: { include_venice_system_prompt: false },
    }),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, status: res.status, usage: null };
  }
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const content = json?.choices?.[0]?.message?.content;
  const u = json?.usage;
  const usage = u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number'
    ? { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens }
    : null;
  return { ok: true, content: typeof content === 'string' ? content : '', usage };
}
