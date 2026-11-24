'use client';
// The card in the volunteers' other language, side by side with the parent's words. A Spanish card always gets
// an English copy; an English card can add a Spanish one. A translation that might drop a "not" or an "only"
// is withheld: that line is shown in the parent's words only.
import { SECTIONS, type CardItem } from '@/lib/card/schema';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { SECTION_LABEL } from './CardLines';

export type TranslationState = { status: 'idle' | 'running' | 'done' | 'failed'; byId: Record<string, CardItem['translation']> | null };

type Props = {
  cardLang: string;
  items: readonly CardItem[];
  translation: TranslationState;
  /** English cards only: the "Add a Spanish copy" switch. */
  spanishCopy: boolean;
  onSpanishCopy: (on: boolean) => void;
  onRetry: () => void;
  headingId: string;
};

export function TranslationPanel({ cardLang, items, translation, spanishCopy, onSpanishCopy, onRetry, headingId }: Props) {
  const t = useT();
  if (cardLang !== 'en' && cardLang !== 'es') return null;
  const toEnglish = cardLang === 'es';
  const target = toEnglish ? 'en' : 'es';
  const shown = toEnglish || spanishCopy;
  const ordered = SECTIONS.flatMap((s) => items.filter((i) => i.section === s));

  return (
    <section aria-labelledby={headingId} className="rounded-sharp border border-hairline-strong bg-surface px-4 py-4 sm:px-[22px]">
      {toEnglish ? (
        <>
          <h2 id={headingId} className="text-17 font-medium text-ink">
            {t('parent.tr.titleEn')}
          </h2>
          <p className="mt-1 text-15 text-ink-muted text-pretty">{t('parent.tr.ledeEn')}</p>
        </>
      ) : (
        <div id={headingId}>
          <Toggle checked={spanishCopy} onChange={onSpanishCopy} label={t('parent.tr.toggleEs')} description={t('parent.tr.toggleEsHint')} />
        </div>
      )}

      {shown && (
        <div className="mt-3 border-t border-hairline pt-3" aria-live="polite" aria-busy={translation.status === 'running'}>
          {translation.status === 'running' && (
            <p className="flex min-h-11 items-center gap-2.5 text-15 text-ink-muted">
              <Spinner size={14} />
              {t('parent.tr.running')}
            </p>
          )}
          {translation.status === 'failed' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-start gap-2 text-15 text-danger-ink text-pretty">
                <Icon name="alert" className="mt-1 shrink-0" />
                {t('parent.tr.failed')}
              </p>
              <Button size="sm" variant="secondary" onClick={onRetry}>
                {t('parent.tr.retry')}
              </Button>
            </div>
          )}
          {translation.status === 'done' && translation.byId && (
            <>
              <div className="hidden grid-cols-2 gap-6 pb-1 text-13 font-medium text-ink-muted sm:grid">
                <p>{t('parent.tr.yourWords')}</p>
                <p>{t(toEnglish ? 'parent.tr.colEn' : 'parent.tr.colEs')}</p>
              </div>
              <ul className="flex flex-col">
                {ordered.map((item) => {
                  const tr = translation.byId?.[item.id] ?? null;
                  return (
                    <li key={item.id} className="grid gap-x-6 gap-y-1 border-t border-hairline py-3 first:border-t-0 sm:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-13 font-medium text-ink-muted">{t(SECTION_LABEL[item.section])}</p>
                        <p lang={cardLang} className="mt-0.5 text-15 text-ink-2 text-pretty">
                          {item.text}
                        </p>
                      </div>
                      <div className="min-w-0 sm:pt-[18px]">
                        {tr && !tr.withheld ? (
                          <p lang={target} className="text-15 text-ink text-pretty">
                            {tr.text}
                          </p>
                        ) : (
                          <p className={cx('inline-flex items-center gap-1.5 text-15', tr?.withheld ? 'text-accent-ink' : 'text-ink-muted')}>
                            <Icon name="lock" size={13} />
                            {t('parent.tr.withheld')}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
