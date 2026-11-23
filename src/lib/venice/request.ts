// Isomorphic builders shared by the server proxy and the Node (eval) path, so requests cannot drift.
import { CAPS } from './prices';

export const VENICE_BASE = 'https://api.venice.ai/api/v1';

/** Exactly 130 hex chars starting with 04, or exactly 128 hex chars. */
export function isPubKeyHex(s: string): boolean {
  return /^[0-9a-f]+$/i.test(s) && ((s.length === 130 && s.startsWith('04')) || s.length === 128);
}

/** Normalised to the 130-char 04-prefixed form, lower case. */
export function normalizePubKey(s: string): string {
  const k = s.toLowerCase();
  return k.length === 128 ? `04${k}` : k;
}

export function buildUpstreamBody(model: string, messages: { role: 'system' | 'user'; content: string }[], maxTokens?: number) {
  return {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    max_tokens: Math.min(maxTokens ?? CAPS.maxTokens, CAPS.maxTokens),
    venice_parameters: { include_venice_system_prompt: false, disable_thinking: true },
  };
}

export function upstreamHeaders(apiKey: string, clientPubKey: string, modelPubKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Venice-TEE-Client-Pub-Key': clientPubKey,
    'X-Venice-TEE-Model-Pub-Key': modelPubKey,
    'X-Venice-TEE-Signing-Algo': 'ecdsa',
  };
}
