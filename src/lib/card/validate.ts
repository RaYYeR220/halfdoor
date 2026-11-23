// Server-side structural check of a parent-edited card. Never echoes card text in its result.
import { z } from 'zod';
import { MAX_DRAFT_ITEMS, SECTIONS, TAGS, type CardItem, type Tag } from './schema';

const Span = z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).refine((s) => s.end > s.start);

const Item = z.object({
  id: z.string().min(1).max(40),
  section: z.enum(SECTIONS),
  text: z.string().min(1).max(400),
  kind: z.enum(['paraphrase', 'verbatim']),
  quotes: z.array(z.object({ text: z.string().min(1), span: Span })).min(1).max(4),
  translation: z.object({ lang: z.enum(['en', 'es']), text: z.string().max(400), withheld: z.boolean() }).nullable(),
}).refine((i) => i.section !== 'safety' || i.kind === 'verbatim');

export const CardBody = z.object({
  items: z.array(Item).max(MAX_DRAFT_ITEMS),
  tags: z.array(z.enum(TAGS)).max(TAGS.length),
  supportLevel: z.enum(['all_morning', 'parts', 'none']),
  lang: z.enum(['en', 'es']),
  approve: z.boolean(),
});

export type ParsedCard = { items: CardItem[]; tags: Tag[]; supportLevel: 'all_morning' | 'parts' | 'none'; lang: 'en' | 'es'; approve: boolean };

export function parseCardBody(body: unknown): ParsedCard | null {
  const r = CardBody.safeParse(body);
  if (!r.success) return null;
  const ids = new Set(r.data.items.map((i) => i.id));
  if (ids.size !== r.data.items.length) return null;
  return { ...r.data, tags: [...new Set(r.data.tags)] };
}
