import { SECTIONS, type VerifiedCard } from './schema';

/** `SECTION:` header (uppercase), then `- <text>` per item; SECTIONS order, empty sections omitted, blank line between. */
export function renderCardText(card: VerifiedCard): string {
  return SECTIONS.flatMap((section) => {
    const lines = card.items.filter((i) => i.section === section).map((i) => `- ${i.text}`);
    return lines.length ? [`${section.toUpperCase()}:\n${lines.join('\n')}`] : [];
  }).join('\n\n');
}
