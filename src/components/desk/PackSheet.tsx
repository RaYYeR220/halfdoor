'use client';
// One child's page of the Sunday pack: the morning in pictures with that child's supports under the right steps,
// their social story, the verse. Child-facing, so it speaks the page's own language (EN/ES), not the desk's.
// It is also what prints: one sheet per page, no app around it.
import { cx } from '@/lib/cx';
import { translator, type Lang } from '@/lib/i18n';

export type PackChip = { chip: string; label: string; pictogramUrl: string };
export type PackStep = { key: string; label: string; segment: string; minutes: number; pictogramUrl: string; chips: PackChip[] };
export type Pack = { steps: PackStep[]; socialStory: string[]; verse: { ref: string; text: string; attribution: string } | null; lang: Lang };

type Props = {
  childName: string;
  pack: Pack;
  /** "9:00", the lesson's title, the big idea (the church's own sentence). */
  service: string;
  title: string | null;
  bigIdea: string | null;
  churchName: string;
  className?: string;
};

export function PackSheet({ childName, pack, service, title, bigIdea, churchName, className }: Props) {
  const t = translator(pack.lang);
  return (
    <article
      lang={pack.lang}
      aria-label={t('pack.sheet.title', { name: childName })}
      className={cx(
        'rounded-sharp border border-hairline-strong bg-surface px-6 pt-7 pb-6 sm:px-10 sm:pt-9',
        'print:break-inside-avoid print:rounded-none print:border-0 print:p-0',
        className,
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-hairline pb-5 print:pb-3">
        <div className="min-w-0">
          <p className="text-15 text-ink-muted">{[t('pack.sheet.when', { service }), title].filter(Boolean).join(' · ')}</p>
          <h3 className="mt-1 text-32 font-medium text-balance text-ink print:text-24">{t('pack.sheet.title', { name: childName })}</h3>
        </div>
        <p className="text-13 text-ink-muted">{churchName}</p>
      </header>

      {bigIdea && (
        <p className="mt-5 text-17 text-ink-2 text-pretty print:mt-3 print:text-15">
          <span className="font-medium text-ink">{t('pack.sheet.bigIdea')}</span> {bigIdea}
        </p>
      )}

      {/* On paper the six steps sit in one row, so a whole child fits on one page. */}
      <ol className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 print:mt-4 print:grid-cols-6 print:gap-x-2">
        {pack.steps.map((s, i) => (
          <li key={s.key} className="flex min-w-0 flex-col">
            <div className="relative flex aspect-[4/3] items-center justify-center rounded-sharp border border-hairline bg-surface-2 print:aspect-square print:bg-surface">
              <span className="absolute top-2 left-2.5 text-13 text-ink-muted tabular">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms through our proxy */}
              <img src={s.pictogramUrl} alt="" width={88} height={88} className="size-[88px] object-contain print:size-16" />
            </div>
            <p className="mt-2 text-17 leading-6 font-medium text-ink print:mt-1.5 print:text-13 print:leading-4">{s.label}</p>
            <p className="text-13 text-ink-muted tabular">{t('pack.sheet.minutes', { n: s.minutes })}</p>
            {s.chips.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 print:mt-1 print:gap-1">
                {s.chips.map((c) => (
                  <li key={c.chip} className="flex items-center gap-2 rounded-sharp border border-accent-line bg-accent-tint/50 px-2 py-1.5 text-13 leading-[17px] text-accent-ink print:gap-1 print:px-1 print:py-0.5 print:text-[10px] print:leading-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms */}
                    <img src={c.pictogramUrl} alt="" width={22} height={22} className="size-[22px] shrink-0 rounded-sharp bg-surface object-contain print:size-3.5" />
                    <span className="min-w-0">{c.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <section className="mt-8 border-t border-hairline pt-5 print:mt-4 print:pt-3">
        <h4 className="text-15 font-medium text-ink-muted">{t('pack.sheet.story')}</h4>
        <ol className="mt-2 flex flex-col gap-1.5">
          {pack.socialStory.map((line, i) => (
            <li key={i} className="text-20 leading-[30px] text-ink text-pretty print:text-15 print:leading-[21px]">
              {line}
            </li>
          ))}
        </ol>
      </section>

      {pack.verse && (
        <section className="mt-7 border-t border-hairline pt-5 print:mt-4 print:pt-3">
          <h4 className="text-15 font-medium text-ink-muted">{t('pack.sheet.verse', { ref: pack.verse.ref })}</h4>
          <blockquote lang="en" className="mt-2 text-17 leading-[1.6] whitespace-pre-line text-ink-2 print:mt-1 print:text-13 print:leading-[18px]">
            {pack.verse.text}
          </blockquote>
          <p className="mt-2 text-13 text-ink-muted">{pack.verse.attribution}</p>
        </section>
      )}

      <footer className="mt-7 border-t border-hairline pt-3 text-13 text-ink-muted text-pretty print:mt-4 print:pt-2 print:text-[10px] print:leading-[14px]">{t('pack.sheet.arasaac')}</footer>
    </article>
  );
}
