'use client';
// (D) The approved card: where it is (timeline), the card itself (each line still opens its quote), who opened
// it and when, notes from church, and taking it back. (E) The same page with the kids' team's question on top.
import { useId, useState } from 'react';
import type { CardView } from '@/lib/card/view';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { dayLabel } from '@/lib/parent/format';
import { deriveTimeline } from '@/lib/parent/timeline';
import type { ChildPageData } from '@/lib/parent/types';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { AccessLog } from './AccessLog';
import { CardLines } from './CardLines';
import { DeleteCard } from './DeleteCard';
import { NotesList } from './NotesList';
import { StatusTimeline } from './StatusTimeline';
import { useAutoFocus } from './useAutoFocus';

type Props = {
  data: ChildPageData;
  card: CardView;
  justApproved: boolean;
  savedOnDevice: boolean;
  onClearSaved: () => void;
  onEdit: () => void;
  onDeleted: (alsoWords: boolean) => void;
  focusToken: number;
  lang: Lang;
};

export function CardApproved({ data, card, justApproved, savedOnDevice, onClearSaved, onEdit, onDeleted, focusToken, lang }: Props) {
  const t = useT();
  const uid = useId();
  const headingRef = useAutoFocus<HTMLHeadingElement>(focusToken);
  const [open, setOpen] = useState<string | null>(null);
  const name = data.child.firstName;
  const returned = card.status === 'returned';
  const ctx = { lang, tz: data.tz, now: new Date(data.now), t, shiftMs: data.clockShiftMs };
  const steps = deriveTimeline({
    status: card.status,
    parentApprovedAt: card.parentApprovedAt,
    directorAckAt: card.directorAckAt,
    match: data.match,
    access: data.access,
  });

  const pill =
    card.status === 'acknowledged' ? (
      <Pill tone="ok" icon={<Icon name="check" size={12} />}>{t('parent.status.acknowledged')}</Pill>
    ) : returned ? (
      <Pill tone="accent" icon={<Icon name="alert" size={12} />}>{t('parent.status.returned')}</Pill>
    ) : (
      <Pill tone="neutral" dot>{t('parent.status.parent_approved')}</Pill>
    );

  return (
    <div>
      {justApproved && !returned && (
        <Banner tone="ok" role="status" className="mb-8">
          {t('parent.done.approvedBanner')}
        </Banner>
      )}
      {returned && (
        <Banner
          tone="accent"
          role="note"
          icon="alert"
          className="mb-8"
          title={t('parent.returned.title')}
          action={
            <Button variant="secondary" size="sm" onClick={onEdit}>
              {t('parent.returned.edit')}
            </Button>
          }
        >
          {card.returnedQuestion ? <span className="text-ink">“{card.returnedQuestion}”</span> : t('parent.returned.noQuestion')}
        </Banner>
      )}

      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 ref={headingRef} tabIndex={-1} className="text-32 font-medium text-balance text-ink outline-none">
              {t('parent.done.title', { name })}
            </h1>
            {pill}
          </div>
          {card.parentApprovedAt && (
            <p className="mt-2 text-15 text-ink-muted tabular">
              {t('parent.done.meta', { date: dayLabel(new Date(card.parentApprovedAt), ctx, true), version: card.version })}
            </p>
          )}
        </div>
        {!returned && (
          <Button variant="secondary" onClick={onEdit}>
            {t('parent.done.edit')}
          </Button>
        )}
      </header>

      <div className="mt-8 rounded-sharp border border-hairline-strong bg-surface px-4 py-5 sm:px-[22px]">
        <StatusTimeline
          steps={steps}
          match={data.match}
          childName={name}
          tz={data.tz}
          now={data.now}
          shiftMs={data.clockShiftMs}
          lang={lang}
          title={t('parent.tl.title')}
        />
      </div>

      <div className="mt-10 grid items-start gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card
            title={<b>{t('parent.done.cardTitle')}</b>}
            aside={<span className="text-13 text-ink-muted">{t('parent.done.tapLine')}</span>}
          >
            <CardLines
              items={card.items}
              cardLang={card.lang}
              active={open}
              open={open}
              onToggle={(id) => setOpen((cur) => (cur === id ? null : id))}
              translations
              idPrefix={uid}
              flush={!card.teamNotes}
            />
            {card.teamNotes && (
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="text-13 font-medium text-ink-muted">{t('parent.done.teamNotes')}</p>
                <p className="mt-1 text-15 text-ink-2 text-pretty whitespace-pre-line">{card.teamNotes}</p>
              </div>
            )}
          </Card>
          {!returned && <p className="text-15 text-ink-muted text-pretty">{t('parent.done.editNote')}</p>}
          {savedOnDevice && (
            <p className="flex flex-wrap items-center gap-x-2 text-15 text-ink-muted">
              <span>{t('parent.done.savedWords')}</span>
              <Button variant="quiet" size="sm" onClick={onClearSaved} className="-ml-2 underline decoration-hairline-emphasis underline-offset-4">
                {t('parent.done.clearSaved')}
              </Button>
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-12">
          <AccessLog childId={data.child.id} childName={name} rows={data.access} tz={data.tz} now={data.now} shiftMs={data.clockShiftMs} lang={lang} />
          <NotesList notes={data.notes} tz={data.tz} now={data.now} shiftMs={data.clockShiftMs} lang={lang} />
        </div>
      </div>

      <DeleteCard childId={data.child.id} childName={name} savedOnDevice={savedOnDevice} onDeleted={onDeleted} />
    </div>
  );
}
