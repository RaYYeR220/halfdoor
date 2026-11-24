'use client';
// "Delete Sam's card": a native modal dialog (focus stays inside, Esc closes) that says exactly what goes and
// what stays before anything is deleted.
import { useId, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';

type Props = { childId: string; childName: string; savedOnDevice: boolean; onDeleted: (alsoWords: boolean) => void };

export function DeleteCard({ childId, childName, savedOnDevice, onDeleted }: Props) {
  const t = useT();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [alsoWords, setAlsoWords] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = childName;

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/cards/${childId}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    dialog.current?.close();
    onDeleted(savedOnDevice && alsoWords);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="mt-14 border-t border-hairline pt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-[60ch]">
          <h2 id={`${id}-title`} className="text-17 font-medium text-ink">
            {t('parent.delete.title', { name })}
          </h2>
          <p className="mt-1 text-15 text-ink-muted text-pretty">{t('parent.delete.lede')}</p>
        </div>
        <Button variant="danger" onClick={() => dialog.current?.showModal()}>
          {t('parent.delete.button', { name })}
        </Button>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby={`${id}-dlg`}
        onClose={() => setFailed(false)}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-sharp border border-hairline-strong bg-surface p-0 text-ink backdrop:bg-[rgba(26,24,22,0.38)] open:animate-rise"
      >
        <div className="px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
          <h2 id={`${id}-dlg`} className="text-20 font-medium tracking-[-0.02em] text-ink">
            {t('parent.delete.confirmTitle', { name })}
          </h2>
          <p className="mt-4 text-15 font-medium text-ink">{t('parent.delete.what')}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-15 text-ink-2 marker:text-ink-muted">
            <li>{t('parent.delete.card')}</li>
            <li>{t('parent.delete.notes')}</li>
            <li>{t('parent.delete.moments', { name })}</li>
          </ul>
          <p className="mt-4 text-15 text-ink-2 text-pretty">{t('parent.delete.stays', { name })}</p>
          <p className="mt-2 text-15 font-medium text-danger-ink">{t('parent.delete.final')}</p>

          {savedOnDevice && (
            <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-sharp border border-hairline-strong px-3.5 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
              <input
                type="checkbox"
                checked={alsoWords}
                onChange={(e) => setAlsoWords(e.target.checked)}
                className="mt-[3px] size-[18px] shrink-0 accent-ink focus-visible:outline-none"
              />
              <span className="text-15 text-ink">{t('parent.delete.alsoWords')}</span>
            </label>
          )}

          {failed && (
            <Banner tone="safety" role="alert" className="mt-4">
              {t('parent.delete.failed')}
            </Banner>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => dialog.current?.close()} autoFocus disabled={busy}>
              {t('parent.delete.cancel')}
            </Button>
            <Button variant="danger" onClick={confirm} pending={busy}>
              {t('parent.delete.confirm')}
            </Button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
