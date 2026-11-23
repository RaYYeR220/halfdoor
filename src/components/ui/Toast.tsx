'use client';
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n/client';
import { Icon } from './Icon';

type Tone = 'neutral' | 'ok';
type ToastItem = { id: number; message: string; tone: Tone };
type Show = (message: string, opts?: { tone?: Tone }) => void;

const ToastContext = createContext<Show | null>(null);

const LIFETIME_MS = 3200;

/** Short confirmations ("Saved"). One polite live region; the newest toast replaces the last. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const show = useCallback<Show>((message, opts) => {
    seq.current += 1;
    setItem({ id: seq.current, message, tone: opts?.tone ?? 'neutral' });
  }, []);

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => setItem((cur) => (cur?.id === item.id ? null : cur)), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [item]);

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex justify-center lg:inset-x-auto lg:bottom-6 lg:left-6 lg:justify-start"
      >
        {item && <ToastView key={item.id} item={item} onDismiss={() => setItem(null)} />}
      </div>
    </ToastContext>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const t = useT();
  return (
    <div className="pointer-events-auto flex min-h-11 animate-rise items-center gap-2.5 rounded-sharp bg-ink py-1 pr-1 pl-4 text-15 text-surface">
      {item.tone === 'ok' && <Icon name="check" className="text-ok-bg" />}
      <span className="py-2">{item.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('ui.dismiss')}
        className="inline-flex size-9 items-center justify-center rounded-sharp text-surface/70 hover:text-surface focus-visible:outline-offset-0"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

/** show('Saved') from any client component under the app shell. */
export function useToast(): Show {
  const show = use(ToastContext);
  return show ?? (() => {});
}
