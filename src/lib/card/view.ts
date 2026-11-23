// SERVER-ONLY. What a role is allowed to see of a card, opened from its sealed columns.
// The raw parent story is never stored, so it can never be returned.
import { openJson } from '@/lib/crypto/atrest';
import type { Role } from '@/lib/auth/tokens';
import type { CardRow } from '@/db/repo/cards';
import type { CardItem } from './schema';

export type CardView = {
  childId: string;
  childFirstName: string;
  status: CardRow['status'];
  lang: string;
  supportLevel: CardRow['supportLevel'];
  items: CardItem[];
  /** Attributed "From the kids' team" in the UI. Director, buddy and parent only; never the room leader. */
  teamNotes?: string;
  returnedQuestion?: string;
  version: number;
  parentApprovedAt: string | null;
  directorAckAt: string | null;
};

export function buildCardView(
  card: CardRow, childFirstName: string, wrappedDek: string, role: Role, scope: 'full' | 'safety',
): CardView {
  const all = openJson<CardItem[]>(wrappedDek, card.itemsEnc);
  const view: CardView = {
    childId: card.childId,
    childFirstName,
    status: card.status,
    lang: card.lang,
    supportLevel: card.supportLevel,
    items: scope === 'safety' ? all.filter((i) => i.section === 'safety') : all,
    version: card.version,
    parentApprovedAt: card.parentApprovedAt?.toISOString() ?? null,
    directorAckAt: card.directorAckAt?.toISOString() ?? null,
  };
  if (scope === 'full' && role !== 'leader' && card.teamNotesEnc) view.teamNotes = openJson<string>(wrappedDek, card.teamNotesEnc);
  if ((role === 'parent' || role === 'director') && card.returnedQuestionEnc) {
    view.returnedQuestion = openJson<string>(wrappedDek, card.returnedQuestionEnc);
  }
  return view;
}
