'use client';
// Tabs for today's services (9:00 · 11:00), with their real times. Arrow keys, Home and End move between them.
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Any service with an id and a label: the desk's, or the live pages' (room view, station). */
type Tabbable = { id: string; label: string };

type Props<S extends Tabbable> = {
  services: S[];
  selected: string;
  onSelect: (id: string) => void;
  /** Prefix for tab / panel ids: tab `${idBase}-tab-<id>`, panel `${idBase}-panel-<id>`. */
  idBase: string;
  label: string;
  meta: (s: S) => ReactNode;
  aside?: (s: S) => ReactNode;
};

export const tabId = (base: string, id: string) => `${base}-tab-${id}`;
export const panelId = (base: string, id: string) => `${base}-panel-${id}`;

export function ServiceTabs<S extends Tabbable>({ services, selected, onSelect, idBase, label, meta, aside }: Props<S>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = services.length;
    const to = ({ ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const k = ((to % n) + n) % n;
    onSelect(services[k].id);
    refs.current[k]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {services.map((s, i) => {
        const on = s.id === selected;
        return (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(idBase, s.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId(idBase, s.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'relative flex min-h-[60px] min-w-[13.5rem] items-center justify-between gap-4 rounded-sharp border px-4 py-2.5 text-left',
              'transition-[background-color,border-color] duration-200 ease-out',
              on
                ? 'border-ink bg-surface'
                : 'border-hairline-strong bg-transparent hover:border-hairline-emphasis hover:bg-surface/60',
            )}
          >
            <span className="min-w-0">
              <span className={cx('block text-17 leading-6 font-medium', on ? 'text-ink' : 'text-ink-2')}>{s.label}</span>
              <span className="block text-13 text-ink-muted tabular">{meta(s)}</span>
            </span>
            {aside && <span className="shrink-0">{aside(s)}</span>}
          </button>
        );
      })}
    </div>
  );
}
