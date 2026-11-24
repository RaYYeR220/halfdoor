// The access log in plain sentences: "Priya opened Sam's card · Sun 9:02 – 10:14 AM (while Sam was checked in)".
import { whenLabel, type WhenCtx } from './format';
import type { AccessRow } from './types';

export type AccessLine = {
  /** "Priya opened Sam's card" */
  action: string;
  /** "Sun 9:02 – 10:14 AM" (start only while open) */
  when: string;
  /** "while Sam was checked in" / "kids' team", or null */
  context: string | null;
  openNow: boolean;
  /** Everything in one line, for screen readers and tests. */
  sentence: string;
};

export type AccessCtx = WhenCtx & { childName: string };

/** The parent's own reads of their child's card are not listed; everything else is, deletions included. */
export const visibleAccessRows = (rows: readonly AccessRow[]) => rows.filter((r) => !(r.me && r.reason === 'parent'));

export function accessLine(row: AccessRow, ctx: AccessCtx): AccessLine {
  const { t, childName: name } = ctx;
  const who = row.who ?? t('parent.log.someone');
  const opened = new Date(row.openedAt);
  const closed = row.closedAt ? new Date(row.closedAt) : null;
  const session = row.reason === 'checked_in' || row.reason === 'room_safety';
  const openNow = session && !closed;

  let action: string;
  let context: string | null = null;
  switch (row.reason) {
    case 'deleted':
      action = row.me
        ? t('parent.log.deletedByYou', { name })
        : row.role === 'system' || !row.who
          ? t('parent.log.deletedAuto', { name })
          : t('parent.log.deletedBy', { who, name });
      break;
    case 'checked_in':
      action = t('parent.log.opened', { who, name });
      context = t(closed ? 'parent.log.whileIn' : 'parent.log.whileInNow', { name });
      break;
    case 'room_safety':
      action = t('parent.log.sawSafety', { who, name });
      context = t(closed ? 'parent.log.roomWhileIn' : 'parent.log.roomWhileInNow', { name });
      break;
    case 'director':
      action = t('parent.log.opened', { who, name });
      context = t('parent.log.asTeam');
      break;
    case 'parent':
    default:
      action = row.me ? t('parent.log.openedByYou', { name }) : t('parent.log.opened', { who, name });
      context = row.me ? null : t('parent.log.asParent');
  }

  const when = whenLabel(opened, session ? closed : null, ctx);
  const sentence = `${action} · ${when}${openNow ? ` · ${t('parent.log.openNow')}` : ''}${context ? ` (${context})` : ''}`;
  return { action, when, context, openNow, sentence };
}
