'use client';
// The child's social story, read aloud from the phone: one fixed sentence at a time in big type. The sentences come
// from the Sunday pack (fixed tables, no model prose). Swipe, arrow keys or the buttons; "Done" goes back.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSwipe } from './useSwipe';

type Props = { lines: readonly string[]; lang: Lang; name: string; onClose: () => void };

export function SocialStory({ lines, lang, name, onClose }: Props) {
  const t = useT();
  const uid = useId();
  const [i, setI] = useState(0);
  const headRef = useRef<HTMLHeadingElement>(null);
  const total = lines.length;
  const go = (k: number) => setI(Math.max(0, Math.min(total - 1, k)));
  const swipe = useSwipe(() => go(i - 1), () => go(i + 1));

  // Opened on purpose by the buddy: the reader takes focus so a screen reader starts at its title.
  useEffect(() => {
    headRef.current?.focus();
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    const to = ({ ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: total - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  };

  return (
    <section aria-labelledby={`${uid}-title`} onKeyDown={onKey} className="flex flex-col px-4 pt-4 pb-5 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${uid}-title`} ref={headRef} tabIndex={-1} className="text-20 font-medium tracking-[-0.02em] text-ink outline-none">
            {t('buddy.story.title', { name })}
          </h3>
          <p className="text-15 text-ink-muted">{t('buddy.story.lede')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t('buddy.story.done')}
        </Button>
      </div>

      <div
        {...swipe}
        className="mt-4 flex min-h-[15rem] touch-pan-y select-none flex-col justify-between rounded-sharp border border-hairline-strong bg-surface-2 px-5 pt-5 pb-4"
      >
        <div aria-live="polite">
          <p key={i} lang={lang} className="animate-rise text-32 leading-[40px] font-medium text-ink text-balance">
            {lines[i]}
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <ol aria-hidden className="flex flex-wrap items-center gap-1.5">
            {lines.map((_, k) => (
              <li key={k} className={cx('h-1.5 rounded-pill transition-[width,background-color] duration-200 ease-out', k === i ? 'w-5 bg-ink' : k < i ? 'w-1.5 bg-ink-muted' : 'w-1.5 bg-hairline-emphasis')} />
            ))}
          </ol>
          <span className="shrink-0 text-13 text-ink-muted tabular">{t('buddy.story.pos', { n: i + 1, total })}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={i === 0} onClick={() => go(i - 1)} icon={<Icon name="chevronRight" className="shrink-0 rotate-180" />}>
          {t('buddy.story.prev')}
        </Button>
        {i < total - 1 ? (
          <Button variant="primary" onClick={() => go(i + 1)} iconEnd={<Icon name="chevronRight" />}>
            {t('buddy.story.next')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t('buddy.story.done')}
          </Button>
        )}
      </div>
    </section>
  );
}
