'use client';
// The card, section by section, in the landing card's shape: a label column and the lines. Every line is a
// button: hover or focus lights its words in the parent's text, a tap opens the quote it came from.
import { SECTIONS, type CardItem, type Section } from '@/lib/card/schema';
import { cx } from '@/lib/cx';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';

export const SECTION_LABEL: Record<Section, MessageKey> = {
  loves: 'card.section.loves',
  communicates: 'card.section.communicates',
  hard: 'card.section.hard',
  helps: 'card.section.helps',
  signs: 'card.section.signs',
  needs: 'card.section.needs',
  avoid: 'card.section.avoid',
  safety: 'card.section.safety',
};

type Props = {
  items: readonly CardItem[];
  /** 'en' | 'es' | 'other': marks the lines' language for screen readers. */
  cardLang: string;
  /** The line whose words are lit (hovered, focused or opened). */
  active: string | null;
  /** The line whose quote is open. */
  open: string | null;
  onPreview?: (id: string | null) => void;
  onToggle: (id: string) => void;
  /** Show each line's stored translation under it (the approved card). */
  translations?: boolean;
  /** Prefix for element ids, so the story text can scroll a line into view. */
  idPrefix: string;
  /** Nothing follows the lines inside their Card: a closing Safety band runs to the Card's bottom edge. */
  flush?: boolean;
};

export const lineDomId = (prefix: string, id: string) => `${prefix}-line-${id}`;

export function CardLines({ items, cardLang, active, open, onPreview, onToggle, translations, idPrefix, flush = true }: Props) {
  const t = useT();
  const groups = SECTIONS.map((s) => ({ section: s, lines: items.filter((i) => i.section === s) })).filter((g) => g.lines.length > 0);
  const lang = cardLang === 'en' || cardLang === 'es' ? cardLang : undefined;

  return (
    <div className="flex flex-col">
      {groups.map(({ section, lines }) => {
        const safety = section === 'safety';
        const headId = `${idPrefix}-sec-${section}`;
        return (
          <section
            key={section}
            aria-labelledby={headId}
            className={cx(
              'grid gap-x-6 gap-y-1 border-t py-2 first:border-t-0 first:pt-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]',
              safety ? '-mx-4 border-danger-line bg-danger-bg px-4 py-3 first:pt-3 sm:-mx-[22px] sm:px-[22px]' : 'border-hairline',
              safety && flush && 'last:-mb-5 last:pb-5',
            )}
          >
            <div className="flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-1 sm:flex-col sm:items-start sm:pt-2.5">
              <h3 id={headId} className={cx('flex items-center gap-1.5 text-15 font-medium', safety ? 'text-danger-ink' : 'text-ink-muted')}>
                {safety && <Icon name="alert" size={13} />}
                {t(SECTION_LABEL[section])}
              </h3>
              {safety && (
                <Pill tone="accent" size="sm" className="bg-surface">
                  {t('parent.review.exact')}
                </Pill>
              )}
            </div>
            <ul className="flex min-w-0 flex-col">
              {lines.map((item) => (
                <Line
                  key={item.id}
                  item={item}
                  lang={lang}
                  safety={safety}
                  active={active === item.id}
                  open={open === item.id}
                  onPreview={onPreview}
                  onToggle={onToggle}
                  translations={translations}
                  domId={lineDomId(idPrefix, item.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Line({
  item, lang, safety, active, open, onPreview, onToggle, translations, domId,
}: {
  item: CardItem;
  lang?: string;
  safety: boolean;
  active: boolean;
  open: boolean;
  onPreview?: (id: string | null) => void;
  onToggle: (id: string) => void;
  translations?: boolean;
  domId: string;
}) {
  const t = useT();
  const quoteId = `${domId}-quote`;
  const verbatim = item.kind === 'verbatim';
  const tr = item.translation;
  return (
    <li className="min-w-0">
      {/* The line and its opened quote share one tinted block with one bar, so they read as one thing. */}
      <div
        data-active={active || open || undefined}
        className={cx(
          'relative -mx-2.5 rounded-sharp transition-[background-color] duration-200 ease-out',
          "before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[2px] before:rounded-pill before:bg-transparent before:transition-colors before:duration-200 before:content-['']",
          safety
            ? 'has-[button:hover]:bg-surface/60 data-active:bg-surface/75 data-active:before:bg-danger-ink'
            : 'has-[button:hover]:bg-ground/70 data-active:bg-accent-tint/45 data-active:before:bg-accent',
        )}
      >
        <button
          id={domId}
          type="button"
          aria-expanded={open}
          aria-controls={quoteId}
          onPointerEnter={(e) => e.pointerType === 'mouse' && onPreview?.(item.id)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && onPreview?.(null)}
          onFocus={() => onPreview?.(item.id)}
          onBlur={() => onPreview?.(null)}
          onClick={() => onToggle(item.id)}
          className="group flex min-h-11 w-full items-start gap-3 rounded-sharp px-2.5 py-2.5 text-left"
        >
          <span lang={lang} className="min-w-0 flex-1 text-17 leading-[1.5] text-ink text-pretty">
            {item.text}
          </span>
          <Icon
            name="chevronDown"
            className={cx(
              'mt-[7px] shrink-0 text-ink-muted opacity-60 transition-[transform,opacity] duration-200 ease-out group-hover:opacity-100',
              open && 'rotate-180 opacity-100',
            )}
          />
        </button>
        {translations && tr && (
          <p lang={tr.lang} className="-mt-1.5 px-2.5 pb-2.5 text-15 text-ink-muted text-pretty">
            {tr.withheld ? t('parent.tr.withheld') : tr.text}
          </p>
        )}
        <div id={quoteId} hidden={!open} className="animate-rise px-2.5 pb-3">
          <p className="text-13 font-medium text-ink-muted">{verbatim ? t('parent.review.exactLine') : t('parent.review.from')}</p>
          {item.quotes.map((q, k) => (
            <p key={k} lang={lang} className="mt-1 text-15 text-ink-2 text-pretty">
              “{q.text.trim()}”
            </p>
          ))}
        </div>
      </div>
    </li>
  );
}
