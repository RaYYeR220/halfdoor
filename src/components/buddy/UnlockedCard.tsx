'use client';
// The open card on a buddy's phone: safety first in the parent's exact words, then what to talk about, how the
// child communicates, what's hard, what helps, the signs, what to avoid, what they need; then the kids' team's
// notes. When the card is in the other language and has a translation, the translation reads first and "Show
// original" brings back the parent's words; a withheld line stays in the parent's words.
import { useId, useState } from 'react';
import type { CardItem, Section } from '@/lib/card/schema';
import type { CardView } from '@/lib/card/view';
import { cx } from '@/lib/cx';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { Icon } from '@/components/ui/Icon';
import { SECTION_LABEL } from '@/components/parent/CardLines';
import { SafetyBanner } from './SafetyBanner';

const ORDER: readonly Exclude<Section, 'safety'>[] = ['loves', 'communicates', 'hard', 'helps', 'signs', 'avoid', 'needs'];

/** The translation a line shows in `lang`, or null (none, withheld, or another language). */
export function usableTranslation(item: CardItem, lang: Lang): { text: string; lang: Lang } | null {
  const tr = item.translation;
  return tr && tr.lang === lang && !tr.withheld && tr.text.trim() ? { text: tr.text, lang: tr.lang } : null;
}

type Props = { card: CardView; lang: Lang; idBase: string };

export function UnlockedCard({ card, lang, idBase }: Props) {
  const t = useT();
  const uid = useId();
  const [original, setOriginal] = useState(false);
  const foreign = card.lang !== lang && (card.lang === 'en' || card.lang === 'es');
  const translated = foreign && card.items.some((i) => usableTranslation(i, lang));
  const showTr = translated && !original;
  const cardLang = card.lang === 'en' || card.lang === 'es' ? card.lang : undefined;

  const safety = card.items.filter((i) => i.section === 'safety');
  const groups = ORDER.map((s) => ({ section: s, lines: card.items.filter((i) => i.section === s) })).filter((g) => g.lines.length > 0);

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-5 sm:px-5">
      {foreign && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-sharp border border-hairline bg-surface-2 py-1 pr-1 pl-3">
          <p className="py-2 text-13 text-ink-muted">
            {translated
              ? original
                ? t('buddy.tr.original')
                : t(card.lang === 'es' ? 'buddy.tr.fromEs' : 'buddy.tr.fromEn')
              : t(card.lang === 'es' ? 'buddy.tr.noneEs' : 'buddy.tr.noneEn')}
          </p>
          {translated && (
            <button
              type="button"
              aria-pressed={original}
              onClick={() => setOriginal((v) => !v)}
              className="inline-flex min-h-11 items-center rounded-pill px-3 text-15 font-medium text-rose transition-colors duration-200 ease-out hover:bg-ground-edge"
            >
              {original ? t('buddy.tr.showTranslation') : t('buddy.tr.showOriginal')}
            </button>
          )}
        </div>
      )}

      {safety.length > 0 && (
        <SafetyBanner
          headingId={`${idBase}-safety`}
          title={t('buddy.safety.title')}
          note={t('buddy.safety.exact')}
          lines={safety.map((i) => {
            const tr = foreign && !original ? usableTranslation(i, lang) : null;
            return { id: i.id, text: i.text, lang: cardLang, translation: tr };
          })}
        />
      )}

      {groups.length > 0 && (
        <div className="flex flex-col">
          {groups.map(({ section, lines }) => {
            const headId = `${uid}-${section}`;
            return (
              <section
                key={section}
                aria-labelledby={headId}
                className="grid gap-x-5 gap-y-1 border-t border-hairline py-3.5 first:border-t-0 first:pt-1 sm:grid-cols-[8.5rem_minmax(0,1fr)]"
              >
                <div className="sm:pt-0.5">
                  <h3 id={headId} className="text-15 font-medium text-ink-muted">
                    {t(SECTION_LABEL[section])}
                  </h3>
                  {section === 'loves' && <p className="text-13 text-ink-muted-2">{t('buddy.loves.hint')}</p>}
                </div>
                <ul className="flex min-w-0 flex-col gap-1.5">
                  {lines.map((item) => {
                    const tr = showTr ? usableTranslation(item, lang) : null;
                    const kept = showTr && !tr && item.translation?.withheld;
                    return (
                      <li key={item.id} className="min-w-0">
                        <p lang={tr ? tr.lang : cardLang} className="text-17 leading-[1.5] text-ink text-pretty">
                          {tr ? tr.text : item.text}
                        </p>
                        {kept && (
                          <p className="mt-0.5 flex items-start gap-1.5 text-13 text-accent-ink">
                            <Icon name="lock" size={12} className="mt-[3px] shrink-0" />
                            {t('buddy.tr.withheld')}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {card.teamNotes && card.teamNotes.trim() && (
        <section aria-labelledby={`${uid}-team`} className="rounded-sharp border border-hairline bg-surface-2 px-4 py-3.5">
          <h3 id={`${uid}-team`} className="text-15 font-medium text-ink-muted">
            {t('buddy.team')}
          </h3>
          <p className={cx('mt-1 text-17 leading-[1.5] whitespace-pre-line text-ink-2 text-pretty')}>{card.teamNotes}</p>
        </section>
      )}
    </div>
  );
}
