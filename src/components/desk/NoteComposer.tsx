'use client';
// The note home for one child at one service. What the buddy logged on the left; the note on the right, drafted
// in an enclave from this browser, every sentence tied to the moments it rests on (hover a chip to see one).
// Judgment words are marked, never removed: approving with any of them needs a tick that they were read.
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { AttestationSummary } from '@/lib/crypto/attestation';
import { ENCLAVE_COPY } from '@/lib/crypto/attestation';
import { cx } from '@/lib/cx';
import { flagRuns } from '@/lib/desk/helpers';
import type { DeskClock, DeskService, NoteChild } from '@/lib/desk/types';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { draftParentNote } from '@/lib/note/pipeline';
import type { MomentView } from '@/lib/note/schema';
import { describeDraftError, isAbort } from '@/lib/parent/errors';
import { timeLabel } from '@/lib/parent/format';
import { E2EE_MODEL } from '@/lib/venice/prices';
import { EnclaveStatus, type EnclaveFailure } from '@/components/enclave/EnclaveStatus';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Spinner } from '@/components/ui/Spinner';
import { useDeskTime } from './DeskFrame';

type Moment = MomentView & { at: string };
type Context = { childFirstName: string; lang: 'en' | 'es'; moments: Moment[] };
type Sentence = { text: string; evidence: string[] };
type Saved = { status: 'draft' | 'approved'; approvedAt: string | null };
type SavedNote = Saved & { serviceId: string; sentences: Sentence[] };

type Draft =
  | { kind: 'idle' }
  | { kind: 'drafting'; binding: AttestationSummary | null; attestation: AttestationSummary | null; startedAt: number }
  | { kind: 'failed'; enclave?: EnclaveFailure; key?: MessageKey }
  | { kind: 'ready'; attestation: AttestationSummary | null; dropped: number };

export const KIND_LABEL: Record<Moment['kind'], MessageKey> = {
  good: 'desk.moment.good',
  hard: 'desk.moment.hard',
  break: 'desk.moment.break',
  bathroom: 'desk.moment.bathroom',
  note: 'desk.moment.note',
};

/** Parent-page error keys that say "card"; the note has its own words for those. */
const NOTE_ERROR: Partial<Record<MessageKey, MessageKey>> = {
  'parent.error.budgetSandbox': 'desk.note.err.budgetSandbox',
  'parent.error.unusable': 'desk.note.err.unusable',
  'parent.error.length': 'desk.note.err.unusable',
};

type Props = {
  service: DeskService;
  child: NoteChild;
  clock: DeskClock;
  onSaved: (state: Saved) => void;
};

export function NoteComposer({ service, child, clock, onSaved }: Props) {
  const t = useT();
  const uid = useId();
  const ctx = useDeskTime(clock);
  const [context, setContext] = useState<Context | 'error' | null>(null);
  const [sentences, setSentences] = useState<Sentence[] | null>(null);
  const [saved, setSaved] = useState<Saved | null>(child.note);
  const [draft, setDraft] = useState<Draft>({ kind: 'idle' });
  const [editing, setEditing] = useState<number | null>(null);
  const [reviewedFlags, setReviewedFlags] = useState(false);
  const [saving, setSaving] = useState<'draft' | 'approve' | null>(null);
  const [saveError, setSaveError] = useState<MessageKey | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const run = useRef<AbortController | null>(null);
  const name = child.firstName;
  const parent = child.parents[0] ?? t('desk.drawer.theParent');

  // The moments (decrypted for the director) and any note already saved for this service.
  const load = useEffectEvent((signal: AbortSignal) => {
    const q = `service=${service.id}&child=${child.childId}`;
    fetch(`/api/notes/context?${q}`, { cache: 'no-store', signal })
      .then((r) => (r.ok ? (r.json() as Promise<Context>) : Promise.reject(new Error(String(r.status)))))
      .then(setContext)
      .catch((e) => !isAbort(e) && setContext('error'));
    if (!child.note) return;
    fetch(`/api/notes?child=${child.childId}`, { cache: 'no-store', signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ notes: SavedNote[] }>) : null))
      .then((body) => {
        const n = body?.notes.find((x) => x.serviceId === service.id);
        if (n) {
          setSentences(n.sentences.map((s) => ({ text: s.text, evidence: s.evidence ?? [] })));
          setSaved({ status: n.status, approvedAt: n.approvedAt });
        }
      })
      .catch(() => undefined);
  });
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => {
      ctrl.abort();
      run.current?.abort();
    };
  }, []);

  const moments = context && context !== 'error' ? context.moments : [];
  const lang = context && context !== 'error' ? context.lang : 'en';
  const byId = new Map(moments.map((m) => [m.id, m]));
  const flagged = (sentences ?? []).some((s) => flagRuns(s.text, lang).some((r) => r.flagged));
  const approved = saved?.status === 'approved';
  /** An approved note reads as sent: no edit controls until the director chooses to change it. */
  const [unlocked, setUnlocked] = useState(false);
  const locked = approved && !unlocked;

  const makeDraft = async () => {
    if (!context || context === 'error' || moments.length === 0) return;
    run.current?.abort();
    const ctrl = new AbortController();
    run.current = ctrl;
    setDraft({ kind: 'drafting', binding: null, attestation: null, startedAt: Date.now() });
    setSaveError(null);
    setAnnounce(t('desk.note.step.sealed'));
    try {
      const { note, attestation } = await draftParentNote(
        moments.map((m): MomentView => ({ id: m.id, step: m.step, kind: m.kind, helped: m.helped, ...(m.note ? { note: m.note } : {}) })),
        lang,
        {
          model: E2EE_MODEL,
          childName: name,
          signal: ctrl.signal,
          onBinding: (b) => !ctrl.signal.aborted && setDraft((d) => (d.kind === 'drafting' ? { ...d, binding: b } : d)),
          onAttestation: (a) => {
            if (ctrl.signal.aborted) return;
            setDraft((d) => (d.kind === 'drafting' ? { ...d, attestation: a } : d));
            setAnnounce(t('desk.note.step.writing'));
          },
        },
      );
      if (ctrl.signal.aborted) return;
      setSentences(note.sentences.map((s) => ({ text: s.text, evidence: s.evidence })));
      setDraft({ kind: 'ready', attestation, dropped: note.dropped.length });
      setReviewedFlags(false);
      setEditing(null);
      setAnnounce(t('desk.note.drafted'));
    } catch (e) {
      if (ctrl.signal.aborted || isAbort(e)) return;
      const f = describeDraftError(e);
      setDraft(f.kind === 'enclave' ? { kind: 'failed', enclave: f.status } : { kind: 'failed', key: NOTE_ERROR[f.key] ?? f.key });
      setAnnounce(t('desk.note.failedTitle'));
    }
  };

  const save = async (approve: boolean) => {
    if (!sentences) return;
    const clean = sentences.map((s) => ({ text: s.text.trim(), evidence: s.evidence })).filter((s) => s.text.length > 0);
    if (clean.length === 0) return setSaveError('desk.note.err.empty');
    setSaving(approve ? 'approve' : 'draft');
    setSaveError(null);
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: service.id, childId: child.childId, sentences: clean, approve, acknowledgeFlags: approve && flagged ? reviewedFlags : undefined }),
    }).catch(() => null);
    setSaving(null);
    if (!res) return setSaveError('desk.note.err.network');
    if (res.status === 409) return setSaveError('desk.note.err.flags');
    if (!res.ok) return setSaveError(res.status === 400 ? 'desk.note.err.invalid' : 'desk.note.err.save');
    const next: Saved = { status: approve ? 'approved' : 'draft', approvedAt: approve ? new Date().toISOString() : null };
    setSentences(clean);
    setSaved(next);
    setEditing(null);
    setUnlocked(false);
    onSaved(next);
    setAnnounce(approve ? t('desk.note.approvedLive', { parent, name }) : t('desk.note.savedLive'));
  };

  const patch = (i: number, text: string) => setSentences((ss) => ss && ss.map((s, k) => (k === i ? { ...s, text } : s)));
  const remove = (i: number) => {
    setSentences((ss) => ss && ss.filter((_, k) => k !== i));
    setEditing(null);
  };

  return (
    <div className="grid gap-x-8 gap-y-6 border-t border-hairline bg-ground/40 px-5 pt-5 pb-6 lg:grid-cols-[minmax(0,16.5rem)_minmax(0,1fr)]">
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {/* ---------------------------------------------- what the buddy logged */}
      <section aria-labelledby={`${uid}-moments`} className="min-w-0">
        <h4 id={`${uid}-moments`} className="text-15 font-medium text-ink-muted">
          {t('desk.note.logged')}
        </h4>
        {context === null ? (
          <p className="mt-3 flex items-center gap-2 text-15 text-ink-muted">
            <Spinner size={13} />
            {t('desk.note.loading')}
          </p>
        ) : context === 'error' ? (
          <p role="alert" className="mt-3 text-15 text-danger-ink">
            {t('desk.note.loadFailed')}
          </p>
        ) : (
          <ol className="mt-2 flex flex-col">
            {moments.map((m) => (
              <li
                key={m.id}
                id={`${uid}-m-${m.id}`}
                className={cx(
                  'relative rounded-sharp border-b border-hairline py-3 pr-2 pl-3 transition-[background-color] duration-200 ease-out last:border-b-0',
                  "before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[2px] before:rounded-pill before:content-['']",
                  lit === m.id ? 'bg-accent-tint before:bg-accent' : 'before:bg-transparent',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-13 text-ink-muted tabular">{timeLabel(new Date(m.at), null, ctx)}</span>
                  <span className="text-15 font-medium text-ink">{m.step}</span>
                  <KindPill kind={m.kind} />
                </div>
                {m.helped.length > 0 && (
                  <p className="mt-1 text-15 text-ink-2 text-pretty">
                    <span className="text-ink-muted">{t('desk.note.helped')}</span> {m.helped.join(' · ')}
                  </p>
                )}
                {m.note && <p className="mt-1 text-15 text-ink-2 text-pretty">“{m.note}”</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---------------------------------------------- the note */}
      <section aria-labelledby={`${uid}-note`} className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 id={`${uid}-note`} className="text-15 font-medium text-ink-muted">
            {t('desk.note.to', { parent, lang: lang === 'es' ? t('desk.lang.es') : t('desk.lang.en') })}
          </h4>
        </div>

        {draft.kind === 'drafting' ? (
          <DraftSteps draft={draft} onStop={() => { run.current?.abort(); setDraft({ kind: 'idle' }); }} />
        ) : sentences && sentences.length > 0 ? (
          <>
            {locked && (
              <Banner tone="ok" role="status" className="mt-3">
                {t('desk.note.approvedBody', { parent, name })}
              </Banner>
            )}
            <ol className="mt-3 flex flex-col rounded-sharp border border-hairline-strong bg-surface">
              {sentences.map((s, i) => (
                <SentenceRow
                  key={i}
                  index={i}
                  sentence={s}
                  lang={lang}
                  editing={editing === i}
                  locked={locked}
                  momentFor={(id) => byId.get(id)}
                  timeOf={(m) => timeLabel(new Date(m.at), null, ctx)}
                  onEdit={() => setEditing(i)}
                  onDone={() => setEditing(null)}
                  onChange={(text) => patch(i, text)}
                  onRemove={() => remove(i)}
                  onLight={setLit}
                  domIdOf={(id) => `${uid}-m-${id}`}
                />
              ))}
            </ol>
            {draft.kind === 'ready' && draft.dropped > 0 && (
              <p className="mt-2 text-13 text-ink-muted">{t(draft.dropped === 1 ? 'desk.note.droppedOne' : 'desk.note.droppedMany', { count: draft.dropped })}</p>
            )}

            {flagged && !locked && (
              <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-sharp border border-accent-line bg-accent-tint/40 px-4 py-3">
                <input
                  type="checkbox"
                  checked={reviewedFlags}
                  onChange={(e) => setReviewedFlags(e.target.checked)}
                  className="mt-[3px] size-[18px] shrink-0 accent-[var(--accent-hover)]"
                />
                <span className="text-15 text-accent-ink text-pretty">
                  <span className="font-medium">{t('desk.note.flagsTick')}</span> {t('desk.note.flagsHint')}
                </span>
              </label>
            )}

            {locked ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => setUnlocked(true)}>
                  {t('desk.note.editApproved')}
                </Button>
                <p className="text-13 text-ink-muted">{t('desk.note.editApprovedHint', { parent })}</p>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  pending={saving === 'approve'}
                  disabled={saving !== null || (flagged && !reviewedFlags) || editing !== null}
                  onClick={() => save(true)}
                  iconEnd={<Icon name="check" size={13} />}
                >
                  {approved ? t('desk.note.approveAgain') : t('desk.note.approve')}
                </Button>
                <Button variant="secondary" pending={saving === 'draft'} disabled={saving !== null || editing !== null} onClick={() => save(false)}>
                  {t('desk.note.saveDraft')}
                </Button>
                <Button variant="quiet" disabled={saving !== null || moments.length === 0} onClick={makeDraft} icon={<Icon name="reset" size={13} />}>
                  {t('desk.note.again')}
                </Button>
              </div>
            )}
            {saveError && (
              <p role="alert" className="mt-2 text-15 text-danger-ink">
                {t(saveError)}
              </p>
            )}
            {approved ? null : <p className="mt-2 text-13 text-ink-muted">{t('desk.note.afterApprove', { parent })}</p>}
          </>
        ) : (
          <div className="mt-3 rounded-sharp border border-hairline-strong bg-surface px-4 py-4">
            {draft.kind === 'failed' && (
              <div className="mb-4">
                {draft.enclave ? (
                  <EnclaveStatus value={draft.enclave} />
                ) : (
                  <Banner tone="accent" icon="alert" role="alert" title={t('desk.note.failedTitle')}>
                    {draft.key ? t(draft.key) : null}
                  </Banner>
                )}
              </div>
            )}
            <p className="text-15 text-ink-2 text-pretty">{t('desk.note.intro', { name, parent })}</p>
            <p className="mt-2 text-13 text-ink-muted text-pretty">{ENCLAVE_COPY.short}</p>
            <Button variant="primary" className="mt-4" disabled={!context || context === 'error' || moments.length === 0} onClick={makeDraft}>
              {t('desk.note.draft')}
            </Button>
          </div>
        )}

        {draft.kind === 'ready' && draft.attestation && (
          <EnclaveStatus value={draft.attestation} className="mt-6" />
        )}
      </section>
    </div>
  );
}

export function KindPill({ kind }: { kind: Moment['kind'] }) {
  const t = useT();
  return (
    <Pill size="sm" tone={kind === 'good' ? 'ok' : kind === 'hard' ? 'accent' : 'quiet'}>
      {t(KIND_LABEL[kind])}
    </Pill>
  );
}

function DraftSteps({ draft, onStop }: { draft: Extract<Draft, { kind: 'drafting' }>; onStop: () => void }) {
  const t = useT();
  const seconds = useElapsed(draft.startedAt);
  const summary = draft.attestation ?? draft.binding;
  const steps: { key: string; state: 'todo' | 'active' | 'done'; title: string; detail: string | null }[] = [
    {
      key: 'sealed',
      state: summary ? 'done' : 'active',
      title: t('desk.note.step.sealed'),
      detail: summary ? `${t('parent.draft.sealedIn')} · ${summary.provider}` : t('parent.draft.asking'),
    },
    {
      key: 'signed',
      state: draft.attestation ? 'done' : draft.binding ? 'active' : 'todo',
      title: t('parent.draft.signature'),
      detail: draft.attestation
        ? draft.attestation.quote.signatureSource === 'snapshot'
          ? t('enclave.sigSaved', { date: (draft.attestation.quote.snapshotCapturedAt ?? '').slice(0, 10) || '—' })
          : draft.attestation.reused
            ? `${t('enclave.sigLive')} · ${t('enclave.reused', { minutes: Math.max(1, Math.round(draft.attestation.ageMs / 60_000)) })}`
            : t('enclave.sigLive')
        : null,
    },
    {
      key: 'writing',
      state: draft.attestation ? 'active' : 'todo',
      title: t('desk.note.step.writing'),
      detail: draft.attestation ? t('parent.draft.seconds', { s: seconds }) : null,
    },
    { key: 'checking', state: 'todo', title: t('desk.note.step.checking'), detail: null },
  ];
  return (
    <div className="mt-3 rounded-sharp border border-hairline-strong bg-surface px-4 py-2">
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3.5 border-b border-hairline py-3 last:border-b-0">
            <span
              aria-hidden
              className={cx(
                'mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-pill border text-13 tabular',
                s.state === 'done' && 'border-ok-line bg-ok-bg text-ok-ink',
                s.state === 'active' && 'border-ink text-ink',
                s.state === 'todo' && 'border-hairline-strong text-ink-muted',
              )}
            >
              {s.state === 'done' ? <Icon name="check" size={12} /> : s.state === 'active' ? <Spinner size={12} /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cx('text-15', s.state === 'todo' ? 'text-ink-muted' : 'text-ink', s.state === 'active' && 'font-medium')}>{s.title}</p>
              {s.detail && <p className={cx('text-13 tabular', s.state === 'done' ? 'text-ok-ink' : 'text-ink-muted')}>{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-end border-t border-hairline py-2">
        <Button size="sm" variant="quiet" onClick={onStop}>
          {t('parent.draft.stop')}
        </Button>
      </div>
    </div>
  );
}

function useElapsed(from: number): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS(Math.max(0, Math.round((Date.now() - from) / 1000))), 1000);
    return () => clearInterval(id);
  }, [from]);
  return s;
}

type RowProps = {
  index: number;
  sentence: Sentence;
  lang: 'en' | 'es';
  editing: boolean;
  locked: boolean;
  momentFor: (id: string) => Moment | undefined;
  timeOf: (m: Moment) => string;
  onEdit: () => void;
  onDone: () => void;
  onChange: (text: string) => void;
  onRemove: () => void;
  onLight: (id: string | null) => void;
  domIdOf: (momentId: string) => string;
};

function SentenceRow({ index, sentence, lang, editing, locked, momentFor, timeOf, onEdit, onDone, onChange, onRemove, onLight, domIdOf }: RowProps) {
  const t = useT();
  const box = useRef<HTMLTextAreaElement>(null);
  const runs = flagRuns(sentence.text, lang);
  const words = runs.filter((r) => r.flagged).map((r) => r.text.toLowerCase());

  useEffect(() => {
    if (!editing) return;
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  return (
    <li className="group/row border-b border-hairline px-4 py-3.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-[3px] w-4 shrink-0 text-13 text-ink-muted tabular">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <textarea
              ref={box}
              value={sentence.text}
              rows={Math.max(2, Math.ceil(sentence.text.length / 70))}
              maxLength={300}
              aria-label={t('desk.note.editLabel', { n: index + 1 })}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  onDone();
                }
              }}
              className="block w-full resize-none rounded-sharp border border-hairline-emphasis bg-surface px-3 py-2 text-17 leading-[1.5] text-ink"
            />
          ) : (
            <p lang={lang} className="text-17 leading-[1.5] text-ink text-pretty">
              {runs.map((r, k) =>
                r.flagged ? (
                  <mark key={k} className="rounded-[2px] bg-accent-tint px-0.5 text-accent-ink underline decoration-rose decoration-2 underline-offset-[3px]">
                    {r.text}
                  </mark>
                ) : (
                  <span key={k}>{r.text}</span>
                ),
              )}
            </p>
          )}
          {words.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-13 text-rose">
              <Icon name="alert" size={12} />
              {t('desk.note.flagged', { words: [...new Set(words)].join(', ') })}
            </p>
          )}
          <ul aria-label={t('desk.note.evidence')} className="mt-2 flex flex-wrap gap-1.5">
            {sentence.evidence.map((id) => {
              const m = momentFor(id);
              return m ? <EvidenceChip key={id} moment={m} time={timeOf(m)} onLight={onLight} momentDomId={domIdOf(id)} /> : null;
            })}
          </ul>
        </div>
        <div className={cx('-mt-1 -mr-2 flex shrink-0 items-center', locked && 'hidden')}>
          {editing ? (
            <Button size="sm" variant="quiet" onClick={onDone}>
              {t('desk.note.done')}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="quiet" onClick={onEdit} aria-label={t('desk.note.editLabel', { n: index + 1 })}>
                {t('desk.note.edit')}
              </Button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={t('desk.note.remove', { n: index + 1 })}
                className="inline-flex size-11 items-center justify-center rounded-pill text-ink-muted transition-colors duration-200 ease-out hover:bg-ground hover:text-ink"
              >
                <Icon name="close" size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function EvidenceChip({ moment, time, onLight, momentDomId }: { moment: Moment; time: string; onLight: (id: string | null) => void; momentDomId: string }) {
  const t = useT();
  const tip = useId();
  return (
    <li className="group/chip relative">
      <button
        type="button"
        aria-describedby={tip}
        onPointerEnter={() => onLight(moment.id)}
        onPointerLeave={() => onLight(null)}
        onFocus={() => onLight(moment.id)}
        onBlur={() => onLight(null)}
        onClick={() => document.getElementById(momentDomId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
        className="relative inline-flex h-7 items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-2 pr-3 pl-2.5 text-13 font-medium text-ink-2 transition-[border-color] duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] hover:border-hairline-emphasis"
      >
        <span aria-hidden className={cx('size-[6px] rounded-pill', moment.kind === 'good' ? 'bg-ok-ink' : moment.kind === 'hard' ? 'bg-accent' : 'bg-ink-muted')} />
        {moment.step} · {t(KIND_LABEL[moment.kind])}
      </button>
      <span
        id={tip}
        role="tooltip"
        className="pointer-events-none absolute top-[calc(100%+8px)] left-0 z-20 w-max max-w-[18rem] rounded-sharp bg-ink px-3 py-2 text-13 leading-[18px] text-surface opacity-0 transition-opacity duration-200 ease-out group-focus-within/chip:opacity-100 group-hover/chip:opacity-100"
      >
        <span className="block tabular text-surface/75">{time} · {moment.step}</span>
        <span className="block">{t(KIND_LABEL[moment.kind])}</span>
        {moment.helped.length > 0 && <span className="block">{t('desk.note.helped')} {moment.helped.join(' · ')}</span>}
        {moment.note && <span className="block">“{moment.note}”</span>}
      </span>
    </li>
  );
}
