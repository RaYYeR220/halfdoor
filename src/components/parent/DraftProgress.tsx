'use client';
// (B) The card is being made. Four real steps, each lit by the pipeline as it happens: the quote binding, Intel's
// signature, the enclave reading the words, the lines checked against them. Nothing is encrypted before step 2.
import { useEffect, useState } from 'react';
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { cx } from '@/lib/cx';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { plural } from '@/lib/parent/plural';
import { isFixture } from '@/lib/venice/fixtureChat';
import { EnclaveStatus } from '@/components/enclave/EnclaveStatus';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useAutoFocus } from './useAutoFocus';

export type DraftProgressState = {
  /** Binding passed; Intel's signature check is running (fresh checks only). */
  binding: AttestationSummary | null;
  /** Binding and signature passed; the words are encrypted and on their way. */
  attestation: AttestationSummary | null;
  /** Every line was checked against the parent's words. */
  result: { kept: number; dropped: number } | null;
  startedAt: number;
};

type StepState = 'todo' | 'active' | 'done';

type Props = { childName: string; progress: DraftProgressState; onStop: () => void; focusToken: number; lang: Lang };

export function DraftProgress({ childName, progress, onStop, focusToken, lang }: Props) {
  const t = useT();
  const headingRef = useAutoFocus<HTMLHeadingElement>(focusToken);
  const { binding, attestation: att, result } = progress;
  const seconds = useElapsed(progress.startedAt, !result);

  const sealed: StepState = binding || att ? 'done' : 'active';
  const signed: StepState = att ? 'done' : binding ? 'active' : 'todo';
  const reading: StepState = result ? 'done' : att ? 'active' : 'todo';
  const checking: StepState = result ? 'done' : 'todo';

  const summary = att ?? binding;
  const fixture = isFixture(summary);
  const sigDetail = att
    ? fixture
      ? t('enclave.fixture')
      : att.quote.signatureSource === 'snapshot'
        ? t('enclave.sigSaved', { date: (att.quote.snapshotCapturedAt ?? '').slice(0, 10) || '—' })
        : t('enclave.sigLive')
    : null;

  const steps: { key: string; state: StepState; title: string; detail: string | null }[] = [
    {
      key: 'sealed',
      state: sealed,
      title: t('parent.draft.sealed'),
      detail: fixture ? t('enclave.fixture') : summary ? `${t('parent.draft.sealedIn')} · ${summary.provider}` : t('parent.draft.asking'),
    },
    {
      key: 'signed',
      state: signed,
      title: t('parent.draft.signature'),
      detail: sigDetail
        ? att?.reused
          ? `${sigDetail} · ${t('enclave.reused', { minutes: Math.max(1, Math.round(att.ageMs / 60_000)) })}`
          : sigDetail
        : signed === 'active'
          ? t('enclave.sigPending')
          : null,
    },
    {
      key: 'reading',
      state: reading,
      title: t('parent.draft.reading'),
      detail: reading === 'active' ? t('parent.draft.seconds', { s: seconds }) : null,
    },
    {
      key: 'checking',
      state: checking,
      title: t('parent.draft.checking'),
      detail: result ? `${plural(t, 'parent.draft.kept', result.kept)} · ${plural(t, 'parent.review.left', result.dropped)}` : null,
    },
  ];
  const current = steps.find((s) => s.state === 'active') ?? steps.at(-1)!;
  const announce = result ? `${steps[3].title}. ${steps[3].detail}` : `${current.title}…`;

  return (
    <div className="mx-auto max-w-[680px]">
      <h1 ref={headingRef} tabIndex={-1} className="text-32 font-medium text-balance text-ink outline-none">
        {t('parent.draft.title', { name: childName })}
      </h1>
      <p className="mt-3 max-w-[56ch] text-17 text-ink-muted text-pretty">{t('parent.draft.lede')}</p>

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      <ol className="mt-8 border-t border-hairline">
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-4 border-b border-hairline py-4">
            <Marker n={i + 1} state={s.state} />
            <div className="min-w-0 flex-1 pt-[3px]">
              <p className={cx('text-17 leading-6', s.state === 'todo' ? 'text-ink-muted' : 'text-ink', s.state === 'active' && 'font-medium')}>
                {s.title}
                {s.state === 'active' && '…'}
              </p>
              {s.detail && (
                <p className={cx('mt-1 text-15 tabular text-pretty', s.state === 'done' && s.key !== 'checking' ? 'text-ok-ink' : 'text-ink-muted')}>
                  {s.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-15 text-ink-muted">{t('parent.draft.safe')}</p>
        <Button variant="secondary" onClick={onStop} disabled={!!result}>
          {t('parent.draft.stop')}
        </Button>
      </div>

      <EnclaveStatus value={summary ?? 'pending'} lang={lang} className="mt-8" />
    </div>
  );
}

function Marker({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      aria-hidden
      className={cx(
        'mt-px inline-flex size-7 shrink-0 items-center justify-center rounded-pill border text-13 font-medium tabular transition-[background-color,border-color,color] duration-200 ease-out',
        state === 'done' && 'border-ok-line bg-ok-bg text-ok-ink',
        state === 'active' && 'border-ink bg-surface text-ink',
        state === 'todo' && 'border-hairline-strong bg-transparent text-ink-muted',
      )}
    >
      {state === 'done' ? <Icon name="check" size={13} /> : state === 'active' ? <Spinner size={14} /> : n}
    </span>
  );
}

/** Whole seconds since `from`, ticking while `running`. */
function useElapsed(from: number, running: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setS(Math.max(0, Math.round((Date.now() - from) / 1000))), 1000);
    return () => clearInterval(id);
  }, [from, running]);
  return s;
}
