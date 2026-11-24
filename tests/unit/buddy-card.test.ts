import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { UnlockedCard } from '@/components/buddy/UnlockedCard';
import type { CardView } from '@/lib/card/view';
import { translator } from '@/lib/i18n';

const card = (status: CardView['status']): CardView => ({
  childId: 'kid',
  childFirstName: 'Leo',
  status,
  lang: 'en',
  supportLevel: 'parts',
  items: [{ id: 'i1', section: 'safety', text: 'His dad is NOT allowed to pick him up.', kind: 'verbatim', quotes: [], translation: null }],
  version: 2,
  parentApprovedAt: null,
  directorAckAt: null,
});
const text = (c: CardView) => renderToStaticMarkup(createElement(UnlockedCard, { card: c, lang: 'en', idBase: 'x' })).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'");

describe('buddy card while it is being updated', () => {
  test('safety lines stay, with a note that the full card is being updated', () => {
    for (const status of ['parent_approved', 'returned'] as const) {
      const t = text(card(status));
      expect(t).toContain('His dad is NOT allowed to pick him up.');
      expect(t).toContain(translator('en')('buddy.updating'));
    }
    expect(translator('en')('buddy.updating')).toMatch(/^Full card is being updated\./);
  });
  test('an acknowledged card shows no such note', () => {
    expect(text(card('acknowledged'))).not.toContain('Full card is being updated');
  });
});
