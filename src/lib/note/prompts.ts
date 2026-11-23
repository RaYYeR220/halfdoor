import { redactName, restoreName } from '@/lib/card/prompts';
import type { MomentView } from './schema';

export { restoreName };

/** `childName` is removed from every moment string before it goes into the prompt. */
export function buildNotePrompt(moments: MomentView[], lang: 'en' | 'es', childName = ''): { system: string; user: string } {
  const language = lang === 'es' ? 'Spanish' : 'English';
  const system = [
    "You help a children's ministry director write a short, warm note to a parent about their child's morning, using ONLY the logged moments below.",
    'Return ONLY JSON of this exact shape, no prose, no code fence:',
    '{"sentences":[{"text":"...","evidence":["<moment id>"]}]}',
    `Write in ${language}. 2 to 5 short sentences, each under 300 characters. Refer to the child as "the child".`,
    'Every sentence must cite at least one moment id in "evidence", and must say only what those moments show. Never invent events, causes, diagnoses or advice.',
    'Describe what happened and what helped, kindly and concretely. No judgments about behavior or character. Mention a hard moment only together with what helped, if a moment shows it.',
  ].join('\n');
  const r = (s: string) => redactName(s, childName).text;
  const view = moments.map((m) => ({
    id: m.id,
    step: r(m.step),
    kind: m.kind,
    helped: m.helped.map(r),
    ...(m.note ? { note: r(m.note) } : {}),
  }));
  return { system, user: JSON.stringify({ moments: view }) };
}
