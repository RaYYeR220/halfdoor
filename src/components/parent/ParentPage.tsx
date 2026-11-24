'use client';
// The parent page for one child: write (A) → the enclave makes the card (B) → review every line against the
// parent's own words (C) → approved, with who opened it and notes from church (D), or sent back with a
// question (E). The server decides D/E from the stored card; A–C live here, in this browser only.
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { draftCard, translateCard } from '@/lib/card/pipeline';
import type { CardItem, VerifiedCard } from '@/lib/card/schema';
import { acceptSafetyPrompt } from '@/lib/card/verify';
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { cx } from '@/lib/cx';
import { useLang } from '@/lib/i18n/client';
import { describeDraftError, isAbort, type DraftFailure } from '@/lib/parent/errors';
import { approvalLanded, runTracker, serverViewOf, type Run } from '@/lib/parent/flow';
import { clearStory, readStory, subscribeStory, writeStory } from '@/lib/parent/storyStore';
import type { ChildPageData, ChildRef } from '@/lib/parent/types';
import { E2EE_MODEL } from '@/lib/venice/prices';
import { useToast } from '@/components/ui/Toast';
import { CardApproved } from './CardApproved';
import { CardReview, type ReviewState, type SupportLevel } from './CardReview';
import { DraftProgress, type DraftProgressState } from './DraftProgress';
import { StoryEditor } from './StoryEditor';

type Flow =
  | { kind: 'write'; failure?: DraftFailure }
  | { kind: 'drafting'; progress: DraftProgressState }
  | { kind: 'review'; review: ReviewState };

type Props = {
  data: ChildPageData;
  /** Every child linked to this parent (a switcher shows when there is more than one). */
  family: ChildRef[];
  /** /c/<slug>/parent/<pid> */
  base: string;
};

const MAX_TEXT = 400; // the card API's limit per line and per translation

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(id), resolve()), { once: true });
  });

/** Starting lines for "Edit my words" when this browser has no saved words: the quotes the card was made from. */
function wordsFromCard(items: readonly CardItem[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    for (const q of i.quotes) {
      const s = q.text.trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(/[.!?]$/.test(s) ? s : `${s}.`);
      }
    }
  }
  return out.join(' ');
}

export function ParentPage({ data, family, base }: Props) {
  const { lang, t } = useLang();
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const { child, card } = data;
  const name = child.firstName;

  // ---- the parent's words: this browser's saved copy until they type, then what they typed
  const stored = useSyncExternalStore(subscribeStory, () => readStory(child.id), () => null);
  const [typed, setTyped] = useState<string | null>(null);
  const story = typed ?? stored ?? '';
  const setStory = useCallback(
    (text: string) => {
      setTyped(text);
      writeStory(child.id, text);
    },
    [child.id],
  );

  // ---- which state the page is in
  const serverView = serverViewOf(card);
  const [flow, setFlow] = useState<Flow | null>(null);
  /** The version the approval PUT returned; D shows once the server's card has reached it (no stale flash). */
  const [approvedVersion, setApprovedVersion] = useState<number | null>(null);
  const landed = approvalLanded({ view: serverView, version: card?.version ?? null }, approvedVersion);
  // Once the approved card is on the page, the finished review is dropped, so a later refresh (say the card comes
  // back with a question) shows the server's state, not this stale review.
  if (landed && flow) setFlow(null);
  const view = flow && !landed ? flow.kind : serverView;
  /** Bumped by every state change the parent caused; the new state's heading takes focus once per bump. */
  const [focusToken, setFocusToken] = useState(0);
  const bump = () => setFocusToken((n) => n + 1);
  /** Enclave work (draft, translation): one run at a time, aborted on unmount and when the child changes. */
  const [runs] = useState(runTracker);
  useEffect(() => () => runs.abort(), [runs]);

  const patchReview = (patch: Partial<ReviewState> | ((r: ReviewState) => Partial<ReviewState>)) => {
    setFlow((f) => (f?.kind === 'review' ? { kind: 'review', review: { ...f.review, ...(typeof patch === 'function' ? patch(f.review) : patch) } } : f));
  };

  const translate = (source: VerifiedCard, run: Run) => {
    patchReview({ translation: { status: 'running', byId: null } });
    translateCard(source, { model: E2EE_MODEL, childName: name, signal: run.signal })
      .then((out) => {
        if (!run.live()) return;
        const byId: Record<string, CardItem['translation']> = {};
        for (const i of out.items) byId[i.id] = i.translation && i.translation.text.length <= MAX_TEXT ? i.translation : null;
        patchReview({ translation: { status: 'done', byId } });
      })
      .catch((e) => {
        if (run.live() && !isAbort(e)) patchReview({ translation: { status: 'failed', byId: null } });
      });
  };

  const makeCard = async () => {
    const text = story;
    const run = runs.start();
    // Callbacks of a stopped or replaced run never touch the page.
    const patch = (p: Partial<DraftProgressState>) => {
      if (run.live()) setFlow((f) => (f?.kind === 'drafting' ? { kind: 'drafting', progress: { ...f.progress, ...p } } : f));
    };
    setFlow({ kind: 'drafting', progress: { binding: null, attestation: null, result: null, startedAt: Date.now() } });
    bump();
    try {
      const { card: drafted, attestation } = await draftCard(text, name, {
        model: E2EE_MODEL,
        signal: run.signal,
        onBinding: (b) => patch({ binding: b }),
        onAttestation: (a) => patch({ attestation: a }),
      });
      patch({ result: { kept: drafted.items.length, dropped: drafted.dropped.length } });
      // A beat on the finished check list (real numbers), then the card.
      await sleep(900, run.signal);
      if (!run.live()) return;
      setFlow({ kind: 'review', review: newReview(text, drafted, attestation) });
      bump();
      if (drafted.lang === 'es') translate(drafted, run);
    } catch (e) {
      if (!run.live() || isAbort(e)) return;
      setFlow({ kind: 'write', failure: describeDraftError(e) });
      bump();
    }
  };

  const stop = () => {
    runs.abort();
    setFlow({ kind: 'write' });
    bump();
  };

  const editWords = () => {
    runs.abort();
    setApprovedVersion(null);
    setFlow({ kind: 'write' });
    bump();
  };

  const approve = async (r: ReviewState) => {
    const withCopy = r.card.lang === 'es' || r.spanishCopy;
    const items = r.card.items.map((i) => ({ ...i, translation: withCopy ? (r.translation.byId?.[i.id] ?? null) : null }));
    patchReview({ approving: true, approveError: false });
    const res = await fetch(`/api/cards/${child.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items, tags: r.card.tags, supportLevel: r.support, lang: r.card.lang === 'es' ? 'es' : 'en', approve: true }),
    }).catch(() => null);
    if (!res?.ok) {
      patchReview({ approving: false, approveError: true });
      return;
    }
    const saved = (await res.json().catch(() => null)) as { version?: unknown } | null;
    runs.abort();
    setApprovedVersion(typeof saved?.version === 'number' ? saved.version : (card?.version ?? 0) + 1);
    bump();
    startTransition(() => router.refresh());
  };

  const onDeleted = (alsoWords: boolean) => {
    if (alsoWords) {
      clearStory(child.id);
      setTyped('');
    }
    setApprovedVersion(null);
    setFlow(null);
    bump();
    toast(t('parent.delete.done', { name }), { tone: 'ok' });
    startTransition(() => router.refresh());
  };

  const savedOnDevice = !!stored && stored.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      {family.length > 1 && <ChildSwitcher family={family} current={child.id} base={base} label={t('parent.children')} />}

      {view === 'write' && (
        <StoryEditor
          childName={name}
          story={story}
          onChange={setStory}
          onClear={() => {
            setTyped('');
            clearStory(child.id);
          }}
          onMake={makeCard}
          failure={flow?.kind === 'write' ? flow.failure : undefined}
          saved={savedOnDevice && stored === story}
          editing={!!card && serverView !== 'write'}
          onCancelEdit={() => {
            setFlow(null);
            bump();
          }}
          fromCard={card && !savedOnDevice ? wordsFromCard(card.items) : null}
          access={data.access}
          tz={data.tz}
          now={data.now}
          shiftMs={data.clockShiftMs}
          focusToken={focusToken}
          lang={lang}
        />
      )}

      {view === 'drafting' && flow?.kind === 'drafting' && (
        <DraftProgress childName={name} progress={flow.progress} onStop={stop} focusToken={focusToken} lang={lang} />
      )}

      {view === 'review' && flow?.kind === 'review' && (
        <CardReview
          childName={name}
          review={flow.review}
          onPatch={patchReview}
          onAcceptPrompt={(id) => patchReview((r) => ({ card: acceptSafetyPrompt(r.card, r.story, id) }))}
          onDeclinePrompt={(id) => patchReview((r) => ({ card: { ...r.card, safetyPrompts: r.card.safetyPrompts.filter((p) => p.id !== id) } }))}
          onSpanishCopy={(on) => {
            patchReview({ spanishCopy: on });
            const r = flow.review;
            if (on && r.translation.status !== 'done' && r.translation.status !== 'running') translate(r.card, runs.start());
          }}
          onRetryTranslation={() => translate(flow.review.card, runs.start())}
          onApprove={() => approve(flow.review)}
          onEdit={editWords}
          focusToken={focusToken}
          lang={lang}
        />
      )}

      {(view === 'approved' || view === 'returned') && card && (
        <CardApproved
          data={data}
          card={card}
          justApproved={approvedVersion !== null}
          savedOnDevice={savedOnDevice}
          onClearSaved={() => {
            clearStory(child.id);
            setTyped(null);
          }}
          onEdit={editWords}
          onDeleted={onDeleted}
          focusToken={focusToken}
          lang={lang}
        />
      )}
    </div>
  );
}

function newReview(story: string, card: VerifiedCard, attestation: AttestationSummary): ReviewState {
  return {
    story,
    card,
    attestation,
    support: null as SupportLevel | null,
    supportError: false,
    spanishCopy: false,
    translation: { status: 'idle', byId: null },
    approving: false,
    approveError: false,
  };
}

function ChildSwitcher({ family, current, base, label }: { family: ChildRef[]; current: string; base: string; label: string }) {
  return (
    <nav aria-label={label} className="mb-8 flex flex-wrap gap-2">
      {family.map((c) => (
        <Link
          key={c.id}
          href={`${base}?child=${c.id}`}
          aria-current={c.id === current ? 'page' : undefined}
          className={cx(
            'inline-flex h-11 items-center rounded-pill border px-5 text-15 font-medium transition-[background-color,border-color] duration-200 ease-out',
            c.id === current ? 'border-ink bg-ink text-surface' : 'border-hairline-strong bg-surface text-ink hover:border-hairline-emphasis',
          )}
        >
          {c.firstName}
        </Link>
      ))}
    </nav>
  );
}
