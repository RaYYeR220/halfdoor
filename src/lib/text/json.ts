/** The JSON object in a model's answer: code fences and any text around the outermost braces are dropped. Throws when it is not JSON. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
}
