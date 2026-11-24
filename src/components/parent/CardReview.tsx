'use client';
// (C) The card next to the parent's own words. Every line lights the words it came from (and a tap on the
// words finds the line); safety lines are the parent's exact sentences; what didn't pass the check is listed
// with the reason. Nothing reaches the kids' team until "Approve card".
import { useCallback, useId, useMemo, useState } from 'react';
import type { VerifiedCard } from '@/lib/card/schema';
import type { AttestationSummary } from '@/lib/crypto/attestation';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { markSources } from '@/lib/parent/highlight';
import { plural } from '@/lib/parent/plural';
import { EnclaveStatus } from '@/components/enclave/EnclaveStatus';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { CardLines, lineDomId } from './CardLines';
import { LeftOutList } from './LeftOutList';
import { SafetyPrompts } from './SafetyPrompts';
import { StoryText } from './StoryText';
import { SupportLevelField, type SupportLevel } from './SupportLevel';
import { TranslationPanel, type TranslationState } from './TranslationPanel';
import { useAutoFocus } from './useAutoFocus';

export type { SupportLevel } from './SupportLevel';

export type ReviewState = {
  story: string;
  card: VerifiedCard;
  attestation: AttestationSummary;
  support: SupportLevel | null;
  supportError: boolean;
  spanishCopy: boolean;
  translation: TranslationState;
  approving: boolean;
  approveError: boolean;
};

type Props = {
  childName: string;
  review: ReviewState;
  onPatch: (patch: Partial<ReviewState>) => void;
  onAcceptPrompt: (id: string) => void;
  onDeclinePrompt: (id: string) => void;
  onSpanishCopy: (on: boolean) => void;
  onRetryTranslation: () => void;
  onApprove: () => void;
  onEdit: () => void;
  focusToken: number;
  lang: Lang;
};

const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
const smooth = (): ScrollBehavior =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

export function CardReview({
  childName, review, onPatch, onAcceptPrompt, onDeclinePrompt, onSpanishCopy, onRetryTranslation, onApprove, onEdit, focusToken, lang,
}: Props) {
  const t = useT();
  const uid = useId();
  const headingRef = useAutoFocus<HTMLHeadingElement>(focusToken);
  const { card, story } = review;
  const [preview, setPreview] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const active = preview ?? open;
  const sources = useMemo(() => markSources(card.items, card.safetyPrompts), [card.items, card.safetyPrompts]);
  const cardLang = card.lang === 'en' || card.lang === 'es' ? card.lang : undefined;
  const translating = (card.lang === 'es' || review.spanishCopy) && review.translation.status === 'running';

  /** Bring the lit words into view inside the sticky story column (wide screens only: on a phone it is below). */
  const showWords = useCallback(
    (id: string | null) => {
      if (!id || !wide()) return;
      requestAnimationFrame(() => {
        const box = document.getElementById(`${uid}-story`);
        const mark = box?.querySelector<HTMLElement>(`mark[data-ids~="${CSS.escape(id)}"]`);
        if (!box || !mark) return;
        const b = box.getBoundingClientRect();
        const m = mark.getBoundingClientRect();
        if (m.top < b.top + 16 || m.bottom > b.bottom - 16) box.scrollBy({ top: m.top - b.top - b.height / 3, behavior: smooth() });
      });
    },
    [uid],
  );

  const onPreview = (id: string | null) => {
    setPreview(id);
    showWords(id);
  };
  const onToggle = (id: string) => {
    setOpen((cur) => (cur === id ? null : id));
    showWords(id);
  };
  /** Clicked words in the story: open the line they feed and bring it into view. */
  const onPick = (id: string) => {
    setOpen(id);
    const el = document.getElementById(lineDomId(uid, id));
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest', behavior: smooth() });
  };

  const approve = () => {
    if (!review.support) {
      onPatch({ supportError: true });
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[name="${uid}-support"]`)?.focus());
      return;
    }
    onApprove();
  };

  const counts = { lines: card.items.length, left: card.dropped.length, questions: card.safetyPrompts.length };

  return (
    <div>
      <header className="max-w-[760px]">
        <h1 ref={headingRef} tabIndex={-1} className="text-32 font-medium text-balance text-ink outline-none">
          {t('parent.review.title', { name: childName })}
        </h1>
        <p className="mt-3 text-17 text-ink-2 text-pretty">{t('parent.review.lede')}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-15 text-ink-muted tabular">
          <span>{plural(t, 'parent.review.lines', counts.lines)}</span>
          <span aria-hidden>·</span>
          <span>{counts.left === 0 ? t('parent.review.noneLeft') : plural(t, 'parent.review.left', counts.left)}</span>
          {counts.questions > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="text-danger-ink">{plural(t, 'parent.review.questions', counts.questions)}</span>
            </>
          )}
        </p>
      </header>

      <div className="mt-8 grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        {/* The card column comes first in reading order (on a phone it is what the parent reviews). */}
        <div className="flex min-w-0 flex-col gap-6 lg:order-2">
          <SafetyPrompts
            prompts={card.safetyPrompts}
            lang={cardLang}
            onAccept={onAcceptPrompt}
            onDecline={onDeclinePrompt}
            onPreview={(id) => onPreview(id)}
            idPrefix={uid}
          />

          <Card
            title={<b>{t('parent.review.card', { name: childName })}</b>}
            aside={<span className="text-13 text-ink-muted">{t('parent.review.madeFrom')}</span>}
          >
            {card.items.length > 0 ? (
              <CardLines
                items={card.items}
                cardLang={card.lang}
                active={active}
                open={open}
                onPreview={onPreview}
                onToggle={onToggle}
                idPrefix={uid}
              />
            ) : (
              <p className="py-2 text-15 text-ink-muted">{t('parent.review.empty')}</p>
            )}
          </Card>

          <LeftOutList dropped={card.dropped} lang={cardLang} headingId={`${uid}-left`} />

          <SupportLevelField
            name={`${uid}-support`}
            childName={childName}
            value={review.support}
            onChange={(v) => onPatch({ support: v, supportError: false })}
            error={review.supportError}
          />

          <TranslationPanel
            cardLang={card.lang}
            items={card.items}
            translation={review.translation}
            spanishCopy={review.spanishCopy}
            onSpanishCopy={onSpanishCopy}
            onRetry={onRetryTranslation}
            headingId={`${uid}-tr`}
          />

          <div className="border-t border-hairline pt-6">
            {review.approveError && (
              <Banner tone="safety" role="alert" className="mb-4">
                {t('parent.review.approveFailed')}
              </Banner>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={approve}
                pending={review.approving}
                disabled={translating || card.items.length === 0}
                iconEnd={review.approving ? undefined : <Icon name="check" />}
              >
                {review.approving ? t('parent.review.approving') : t('parent.review.approve')}
              </Button>
              <Button variant="secondary" onClick={onEdit} disabled={review.approving}>
                {t('parent.review.edit')}
              </Button>
            </div>
            <p className="mt-3 text-15 text-ink-muted text-pretty" aria-live="polite">
              {translating ? t('parent.review.waitTranslation') : t('parent.review.afterApprove')}
            </p>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-[calc(var(--shell-h)+1.5rem)] lg:order-1">
          <Card
            title={<b>{t('parent.review.yourWords')}</b>}
            aside={<span className="text-13 text-ink-muted">{t('parent.review.tapWords')}</span>}
            padding="none"
          >
            <div
              id={`${uid}-story`}
              className="overflow-y-auto overscroll-contain px-4 pb-5 sm:px-[22px] lg:max-h-[calc(100dvh-var(--shell-h)-15rem)]"
            >
              <StoryText story={story} sources={sources} active={active} onPick={onPick} lang={cardLang} />
            </div>
          </Card>
          <div className="mt-4">
            <EnclaveStatus value={review.attestation} lang={lang} />
          </div>
        </div>
      </div>
    </div>
  );
}
