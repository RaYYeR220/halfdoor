// What the browser checked about the enclave before anything was sent. Every claim here is ENCLAVE_COPY
// (or its Spanish twin) word for word, plus the honest limits; the short row labels only name the checks.
import type { ReactNode } from 'react';
import {
  ENCLAVE_COPY, ENCLAVE_COPY_ES, signatureText, type AttestationSummary,
} from '@/lib/crypto/attestation';
import { cx } from '@/lib/cx';
import { t, type Lang } from '@/lib/i18n';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Spinner } from '@/components/ui/Spinner';

/** Why nothing was sent: the binding failed, Intel's signature failed (with its reason), or no check could run. */
export type EnclaveFailure = { error: 'binding' | 'signature' | 'unavailable'; reason?: string };
export type EnclaveStatusValue = AttestationSummary | 'pending' | EnclaveFailure;

type Props = { value: EnclaveStatusValue; lang?: Lang; className?: string };

const isFailure = (v: EnclaveStatusValue): v is EnclaveFailure => typeof v === 'object' && 'error' in v;

function clock(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-419' : 'en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
}

export function EnclaveStatus({ value, lang = 'en', className }: Props) {
  const copy = lang === 'es' ? ENCLAVE_COPY_ES : ENCLAVE_COPY;

  if (value === 'pending' || isFailure(value)) {
    const failed = isFailure(value);
    const message = !failed
      ? t(lang, 'enclave.checking')
      : value.error === 'binding'
        ? copy.bindingFailed
        : value.error === 'signature'
          ? copy.signatureNotVerified(value.reason ?? 'unknown')
          : copy.unverifiedNothingSent;
    return (
      <Frame className={className} lang={lang} pill={failed ? <Pill tone="danger" icon={<Icon name="alert" size={12} />}>{t(lang, 'enclave.failed')}</Pill> : <Pill tone="quiet" icon={<Spinner size={12} />}>{t(lang, 'enclave.pending')}</Pill>}>
        <p role={failed ? 'alert' : 'status'} className={cx('text-15 text-pretty', failed ? 'text-danger-ink' : 'text-ink-muted')}>
          {message}
        </p>
      </Frame>
    );
  }

  const s = value;
  const q = s.quote;
  const sig = q.signature;
  const minutes = Math.max(1, Math.round(s.ageMs / 60_000));
  const sigLabel =
    sig === 'pending'
      ? t(lang, 'enclave.sigPending')
      : sig === 'unverified'
        ? t(lang, 'enclave.sigFailed')
        : q.signatureSource === 'snapshot'
          ? t(lang, 'enclave.sigSaved', { date: (q.snapshotCapturedAt ?? '').slice(0, 10) || '—' })
          : t(lang, 'enclave.sigLive');

  const pill =
    sig === 'verified' ? (
      <Pill tone="ok" icon={<Icon name="check" size={12} />}>{t(lang, 'enclave.ok')}</Pill>
    ) : sig === 'pending' ? (
      <Pill tone="quiet" icon={<Spinner size={12} />}>{t(lang, 'enclave.pending')}</Pill>
    ) : (
      <Pill tone="danger" icon={<Icon name="alert" size={12} />}>{t(lang, 'enclave.failed')}</Pill>
    );

  return (
    <Frame className={className} lang={lang} pill={pill}>
      <dl className="grid grid-cols-1 gap-x-4 text-15 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)]">
        <Row k={t(lang, 'enclave.provider')}>{s.provider}</Row>
        <Row k={t(lang, 'enclave.hardware')}>{s.hardware ?? t(lang, 'enclave.hardwareGeneric')}</Row>
        <Row k={t(lang, 'enclave.sealed')}>
          <span className="inline-flex items-start gap-1.5 text-ok-ink">
            <Icon name="check" size={13} className="mt-[5px] shrink-0" />
            {t(lang, 'enclave.sealedOk')}
          </span>
        </Row>
        <Row k={t(lang, 'enclave.signature')}>
          <span className={cx('inline-flex items-start gap-1.5', sig === 'verified' ? 'text-ok-ink' : sig === 'unverified' ? 'text-danger-ink' : 'text-ink-muted')}>
            {sig === 'verified' && <Icon name="check" size={13} className="mt-[5px] shrink-0" />}
            {sig === 'pending' && <Spinner size={13} className="mt-[5px]" />}
            {sigLabel}
          </span>
        </Row>
        <Row k={t(lang, 'enclave.checked')}>
          {s.reused ? t(lang, 'enclave.reused', { minutes }) : t(lang, 'enclave.fresh')}
        </Row>
      </dl>

      <details className="group mt-3 border-t border-hairline pt-1">
        <summary className="-mx-1 flex min-h-11 items-center gap-1.5 rounded-sharp px-1 text-15 font-medium text-ink hover:text-rose">
          <Icon name="chevronRight" className="transition-transform duration-200 ease-out group-open:rotate-90" />
          {t(lang, 'enclave.more')}
        </summary>
        <div className="flex flex-col gap-3 pb-1 pl-5 text-15 text-ink-2 text-pretty">
          <p>{copy.bindingOk}</p>
          <p>{signatureText(s, lang)}</p>
          <p suppressHydrationWarning>{copy.freshness(clock(s.checkedAt, lang))}</p>
          <p>
            {copy.measurement(q.mrtdShort).split(q.mrtdShort)[0]}
            <code className="font-mono text-13 text-ink">{q.mrtdShort}</code>
            {copy.measurement(q.mrtdShort).split(q.mrtdShort)[1]}
          </p>
          <div className="rounded-sharp border border-hairline bg-surface-2 px-3 py-2.5">
            <p className="text-13 font-medium text-ink-muted">{t(lang, 'enclave.limits')}</p>
            <p className="mt-1">{copy.limits}</p>
            <p className="mt-2 text-ink-muted">{copy.pccsNote}</p>
          </div>
        </div>
      </details>
    </Frame>
  );
}

function Frame({ pill, children, className, lang }: { pill: ReactNode; children: ReactNode; className?: string; lang: Lang }) {
  return (
    <section
      lang={lang}
      aria-label={t(lang, 'enclave.title')}
      className={cx('rounded-sharp border border-hairline-strong bg-surface px-4 pt-3.5 pb-3 sm:px-5', className)}
    >
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3 border-b border-hairline pb-3">
        <p className="text-15 font-medium text-ink">{t(lang, 'enclave.title')}</p>
        {pill}
      </div>
      {children}
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-2 text-13 leading-[22px] font-medium text-ink-muted sm:py-2">{k}</dt>
      <dd className="pb-2 leading-[22px] text-ink sm:py-2">{children}</dd>
    </>
  );
}
