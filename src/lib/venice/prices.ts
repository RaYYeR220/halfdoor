/** USD per 1M tokens (input / output), from Venice /models. */
export const PRICES: Record<string, { in: number; out: number }> = {
  'e2ee-deepseek-v4-flash': { in: 0.182, out: 0.373 },
  'e2ee-qwen3-6-35b-a3b': { in: 0.182, out: 1.18 },
  'e2ee-gpt-oss-120b-p': { in: 0.13, out: 0.65 },
  'e2ee-glm-5-3-flash': { in: 0.16, out: 0.54 },
  'e2ee-kimi-k3-1-pro-p': { in: 2.5, out: 12.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
};

/** Default enclave model, chosen by the model sweep (eval/results/summary.md). */
export const E2EE_MODEL = 'e2ee-deepseek-v4-flash';

/** Models the browser routes accept. The Node eval path may use any priced e2ee model. */
export const ALLOWED_BROWSER_MODELS: readonly string[] = [E2EE_MODEL];

export const CAPS = { perSandboxCalls: 15, dailyUsd: 3, maxTokens: 1500 } as const;

export type Usage = { prompt_tokens: number; completion_tokens: number };

export function costUsd(model: string, usage: Usage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`unknown model price: ${model}`);
  return (usage.prompt_tokens * p.in + usage.completion_tokens * p.out) / 1e6;
}
