'use client';
// A buddy with more than one child this service picks whose card to look at. Each tile says, in words, where that
// card stands (locked, open since 9:02, closed at 10:14), so an unlock elsewhere is visible without switching.
import { useRef, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';

export type KidTile = { id: string; firstName: string; status: string; tone: 'open' | 'locked' | 'quiet' };

type Props = { kids: readonly KidTile[]; selected: string; onSelect: (id: string) => void; label: string; panelId: (id: string) => string; tabId: (id: string) => string };

export function KidsList({ kids, selected, onSelect, label, panelId, tabId }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = kids.length;
    const to = ({ ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const k = ((to % n) + n) % n;
    onSelect(kids[k].id);
    refs.current[k]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {kids.map((k, i) => {
        const on = k.id === selected;
        return (
          <button
            key={k.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(k.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId(k.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(k.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'flex min-h-14 min-w-[9.5rem] shrink-0 flex-col justify-center rounded-sharp border px-3.5 py-2 text-left transition-[background-color,border-color] duration-200 ease-out',
              on ? 'border-ink bg-surface' : 'border-hairline-strong bg-transparent hover:border-hairline-emphasis hover:bg-surface/60',
            )}
          >
            <span className={cx('text-17 leading-6 font-medium', on ? 'text-ink' : 'text-ink-2')}>{k.firstName}</span>
            <span className="flex items-center gap-1.5 text-13 text-ink-muted tabular">
              <span aria-hidden className={cx('size-[7px] shrink-0 rounded-pill', k.tone === 'open' ? 'bg-accent' : k.tone === 'locked' ? 'border border-ink-muted' : 'bg-hairline-emphasis')} />
              {k.status}
            </span>
          </button>
        );
      })}
    </div>
  );
}
