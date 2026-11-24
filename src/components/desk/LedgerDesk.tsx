'use client';
// AI ledger: every AI call this church made, newest first: what it was for, which model, whether it went end to
// end encrypted to an enclave and what the browser checked about that enclave, tokens and cost. Prompts and
// answers are never stored, so they are never here.
import type { ReactNode } from 'react';
import { ENCLAVE_COPY, HONEST_LIMITS } from '@/lib/crypto/attestation';
import { cx } from '@/lib/cx';
import { formatUsd } from '@/lib/desk/helpers';
import type { DeskClock, Ledger, LedgerRow } from '@/lib/desk/types';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { dayLabel, formatNumber, timeLabel } from '@/lib/parent/format';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Spinner } from '@/components/ui/Spinner';
import { DeskHead, useDeskTime } from './DeskFrame';

const PURPOSE: Record<LedgerRow['purpose'], MessageKey> = {
  card: 'desk.ledger.purpose.card',
  translate: 'desk.ledger.purpose.translate',
  note: 'desk.ledger.purpose.note',
  lesson: 'desk.ledger.purpose.lesson',
};

export function LedgerDesk({ ledger, clock }: { ledger: Ledger; clock: DeskClock }) {
  const t = useT();
  const { rows, totals, cap } = ledger;
  const n = (x: number) => formatNumber(x, 'en');
  const used = cap ? Math.min(totals.calls, cap.calls) : 0;

  return (
    <div>
      <DeskHead title={t('desk.ledger.title')} lede={t('desk.ledger.lede')} />

      <dl className="mt-8 grid grid-cols-2 rounded-sharp border border-hairline-strong bg-surface md:grid-cols-4">
        <Stat label={t('desk.ledger.stat.calls')} value={n(totals.calls)} note={t('desk.ledger.stat.callsNote', { e2ee: totals.e2ee, plain: totals.plain })} />
        <Stat label={t('desk.ledger.stat.tokens')} value={n(totals.tokensIn + totals.tokensOut)} note={t('desk.ledger.tokens', { in: n(totals.tokensIn), out: n(totals.tokensOut) })} />
        <Stat label={t('desk.ledger.stat.cost')} value={formatUsd(totals.costUsd)} note={totals.running ? t('desk.ledger.stat.costRunning') : t('desk.ledger.stat.costNote')} />
        {cap ? (
          <Stat label={t('desk.ledger.stat.allowance')} value={t('desk.ledger.stat.allowanceValue', { used, max: cap.calls })} note={t('desk.ledger.stat.allowanceNote')}>
            <span
              role="meter"
              aria-valuemin={0}
              aria-valuemax={cap.calls}
              aria-valuenow={used}
              aria-label={t('desk.ledger.stat.allowance')}
              className="mt-2.5 block h-1.5 w-full overflow-hidden rounded-pill bg-accent-tint"
            >
              <span className="block h-full rounded-pill bg-accent" style={{ width: `${(used / cap.calls) * 100}%` }} />
            </span>
          </Stat>
        ) : (
          <Stat label={t('desk.ledger.stat.failed')} value={n(totals.failed)} note={t('desk.ledger.stat.failedNote')} />
        )}
      </dl>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-sharp border border-dashed border-hairline-strong px-5 py-6">
          <p className="text-17 font-medium text-ink">{t('desk.ledger.emptyTitle')}</p>
          <p className="mt-1 max-w-[62ch] text-15 text-ink-muted text-pretty">{t('desk.ledger.emptyBody')}</p>
        </div>
      ) : (
        <ol className="mt-6 rounded-sharp border border-hairline-strong bg-surface" aria-label={t('desk.ledger.listLabel')}>
          {rows.map((r) => (
            <Row key={r.id} r={r} clock={clock} />
          ))}
        </ol>
      )}

      <div className="mt-6 max-w-[68ch] border-t border-hairline pt-4 text-13 text-ink-muted text-pretty">
        <p>{t('desk.ledger.explain')}</p>
        <p className="mt-2">{ENCLAVE_COPY.claim}</p>
        <p className="mt-2">{HONEST_LIMITS}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, note, children }: { label: string; value: string; note: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 border-hairline px-5 py-4 [&:nth-child(odd)]:border-r max-md:[&:nth-child(-n+2)]:border-b md:border-r md:last:border-r-0">
      <dt className="text-13 text-ink-muted">{label}</dt>
      <dd className="mt-1 text-24 font-medium text-ink tabular">{value}</dd>
      <dd className="mt-0.5 text-13 text-ink-muted tabular">{note}</dd>
      {children && <dd>{children}</dd>}
    </div>
  );
}

function Row({ r, clock }: { r: LedgerRow; clock: DeskClock }) {
  const t = useT();
  const ctx = useDeskTime(clock);
  const at = new Date(r.at);
  const a = r.attestation;
  const n = (x: number) => formatNumber(x, 'en');

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 border-b border-hairline px-5 py-4 last:border-b-0 md:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
      <p className="col-span-2 text-13 text-ink-muted tabular md:col-span-1 md:pt-0.5 md:text-15">
        <span className="md:block">{dayLabel(at, ctx)}</span>
        <span className="md:hidden"> · </span>
        <span className="md:block md:text-13">{timeLabel(at, null, ctx)}</span>
      </p>

      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-17 leading-6 font-medium text-ink">{t(PURPOSE[r.purpose])}</span>
          <code className="font-mono text-13 text-ink-muted">{r.model}</code>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {r.e2ee ? (
            <Pill tone="ok" size="sm" icon={<Icon name="lock" size={12} />}>
              {t('desk.ledger.e2ee')}
            </Pill>
          ) : (
            <Pill tone="quiet" size="sm">
              {t('desk.ledger.plain')}
            </Pill>
          )}
          {a && (
            <span
              className={cx(
                'inline-flex min-h-6 items-center gap-[7px] rounded-[12px] border px-2.5 py-[3px] text-13 leading-4 font-medium',
                a.signature === 'verified' ? 'border-hairline-strong bg-surface-2 text-ink' : 'border-danger-line bg-danger-bg text-danger-ink',
              )}
            >
              <Icon name={a.signature === 'verified' ? 'check' : 'alert'} size={12} />
              {[
                a.provider,
                a.signature === 'verified'
                  ? a.source === 'snapshot'
                    ? t('desk.ledger.sigSaved', { date: a.snapshotDate ?? '—' })
                    : t('desk.ledger.sigLive')
                  : t('desk.ledger.sigNot'),
                a.checkedIn === 'browser' ? t('desk.ledger.inBrowser') : a.checkedIn === 'node' ? t('desk.ledger.onServer') : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
          {a?.mrtdShort && (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-pill border border-hairline-strong px-2.5 text-13 text-ink-muted">
              MRTD <code className="font-mono text-ink-2">{a.mrtdShort}</code>
            </span>
          )}
          {r.e2ee && !a && !r.attestationMismatch && <Pill tone="quiet" size="sm">{t('desk.ledger.noRecord')}</Pill>}
          {r.attestationMismatch && <Pill tone="danger" size="sm">{t('desk.ledger.mismatch')}</Pill>}
          {r.ok === null && (
            <Pill tone="quiet" size="sm" icon={<Spinner size={11} />}>
              {t('desk.ledger.running')}
            </Pill>
          )}
          {r.ok === false && <Pill tone="danger" size="sm">{t('desk.ledger.failed')}</Pill>}
        </div>
        {r.attestationRaw !== null && r.attestationRaw !== undefined && (
          <details className="group mt-2">
            <summary className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-sharp px-1 text-13 font-medium text-ink-2 hover:text-rose">
              <Icon name="chevronRight" size={12} className="transition-transform duration-200 ease-out group-open:rotate-90" />
              {t('desk.ledger.record')}
            </summary>
            <pre className="mt-1 max-h-72 overflow-auto rounded-sharp border border-hairline bg-surface-2 px-3 py-2.5 font-mono text-[12px] leading-[18px] text-ink-2">
              {JSON.stringify(r.attestationRaw, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <div className="row-start-2 text-right md:row-start-auto">
        <p className={cx('text-17 leading-6 font-medium text-ink tabular', r.ok === null && 'text-ink-muted')}>{formatUsd(r.costUsd)}</p>
        <p className="mt-0.5 text-13 whitespace-nowrap text-ink-muted tabular">
          {r.tokensIn === null && r.tokensOut === null ? t('desk.ledger.noTokens') : t('desk.ledger.tokens', { in: n(r.tokensIn ?? 0), out: n(r.tokensOut ?? 0) })}
        </p>
      </div>
    </li>
  );
}
