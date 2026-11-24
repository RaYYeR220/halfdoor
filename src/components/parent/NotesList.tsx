'use client';
// Notes home from the kids' team, once the director has approved them. Newest first.
import { useId } from 'react';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { whenLabel } from '@/lib/parent/format';
import type { NoteView } from '@/lib/parent/types';

type Props = { notes: NoteView[]; tz: string; now: string; shiftMs: number; lang: Lang };

export function NotesList({ notes, tz, now, shiftMs, lang }: Props) {
  const t = useT();
  const id = useId();
  const ctx = { lang, tz, now: new Date(now), t, shiftMs };
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-20 font-medium tracking-[-0.02em] text-ink">
        {t('parent.notes.title')}
      </h2>
      {notes.length === 0 ? (
        <p className="mt-4 rounded-sharp border border-dashed border-hairline-strong px-4 py-4 text-15 text-ink-muted text-pretty">
          {t('parent.notes.empty')}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id}>
              <article className="rounded-sharp border border-hairline-strong bg-surface px-4 py-4 sm:px-5">
                <p className="text-13 font-medium text-ink-muted tabular">
                  {n.serviceStartsAt ? whenLabel(new Date(n.serviceStartsAt), null, ctx) : n.serviceLabel}
                </p>
                <div className="mt-2 flex flex-col gap-2 text-17 leading-[1.55] text-ink text-pretty">
                  {n.sentences.map((s, k) => (
                    <p key={k}>{s}</p>
                  ))}
                </div>
                <p className="mt-3 text-13 text-ink-muted">{t('parent.notes.from')}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
