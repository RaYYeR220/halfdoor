'use client';
// One child's card in a side drawer: the whole card (each line opens the parent's words), notes for the buddies,
// and the director's decision: acknowledge it, or send it back with a question. A native modal <dialog>: focus
// stays inside, Esc and the backdrop close it, and the page behind is inert. Opening it is a logged card read.
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react';
import type { CardView } from '@/lib/card/view';
import { cx } from '@/lib/cx';
import type { CardStatus, DeskClock } from '@/lib/desk/types';
import { useT } from '@/lib/i18n/client';
import { dayLabel } from '@/lib/parent/format';
import { CardLines } from '@/components/parent/CardLines';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { CardStatusPill } from './CardStatusPill';
import { useDeskTime } from './DeskFrame';

export type DrawerChild = { id: string; firstName: string; grade: string | null; parents: string[]; status: CardStatus | 'none' };

type Props = {
  child: DrawerChild | null;
  clock: DeskClock;
  onClose: () => void;
  /** The card's status changed here (acknowledged, sent back). */
  onChanged: (childId: string, status: CardStatus) => void;
};

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'none' } | { kind: 'draft' } | { kind: 'card'; card: CardView };

const MAX_NOTE = 2000;
const MAX_QUESTION = 500;

export function CardDrawer({ child, clock, onClose, onChanged }: Props) {
  const t = useT();
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [announce, setAnnounce] = useState('');
  const id = child?.id ?? null;

  // Open and fill when a child is given; close when it goes (or when the page is hidden on navigation).
  // The status decides whether there is anything to read: a parent's unapproved draft is never opened.
  const open = useEffectEvent((d: HTMLDialogElement, signal: AbortSignal) => {
    if (!child) return;
    if (!d.open) d.showModal();
    requestAnimationFrame(() => heading.current?.focus());
    setAnnounce('');
    if (child.status === 'none') return setLoad({ kind: 'none' });
    if (child.status === 'draft') return setLoad({ kind: 'draft' });
    setLoad({ kind: 'loading' });
    fetch(`/api/cards/${child.id}`, { cache: 'no-store', signal })
      .then(async (res) => {
        if (res.status === 404) return setLoad({ kind: 'none' });
        const body = (await res.json().catch(() => null)) as { locked?: boolean; card?: CardView } | null;
        setLoad(res.ok && body?.card ? { kind: 'card', card: body.card } : { kind: 'error' });
      })
      .catch((e) => {
        if ((e as { name?: string })?.name !== 'AbortError') setLoad({ kind: 'error' });
      });
  });
  useEffect(() => {
    const d = dialog.current;
    if (!d || !id) return;
    const ctrl = new AbortController();
    open(d, ctrl.signal);
    return () => {
      ctrl.abort();
      if (d.open) d.close();
    };
  }, [id]);

  const closed = useEffectEvent(() => onClose());
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onDialogClose = () => closed();
    d.addEventListener('close', onDialogClose);
    return () => d.removeEventListener('close', onDialogClose);
  }, []);

  const patchCard = (p: Partial<CardView>) => setLoad((l) => (l.kind === 'card' ? { kind: 'card', card: { ...l.card, ...p } } : l));
  const name = child?.firstName ?? '';
  const parent = child?.parents[0] ?? t('desk.drawer.theParent');

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${uid}-title`}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close(); // the backdrop
      }}
      className={cx(
        'fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(44rem,100vw)] max-w-none overflow-hidden border-0 border-l border-hairline-strong bg-ground p-0 text-ink',
        'backdrop:bg-[rgba(26,24,22,0.32)] open:animate-drawer print:hidden',
      )}
    >
      {child && (
        <div className="flex h-full flex-col">
          <header className="border-b border-hairline bg-surface px-5 pt-4 pb-4 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 ref={heading} id={`${uid}-title`} tabIndex={-1} className="text-24 font-medium text-ink outline-none">
                    {t('desk.drawer.title', { name })}
                  </h2>
                  <CardStatusPill status={load.kind === 'card' ? load.card.status : child.status} />
                </div>
                <DrawerMeta child={child} card={load.kind === 'card' ? load.card : null} clock={clock} />
              </div>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label={t('desk.drawer.close')}
                className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted transition-colors duration-200 ease-out hover:bg-ground hover:text-ink"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </header>

          <p aria-live="polite" className="sr-only">
            {announce}
          </p>

          {load.kind === 'card' ? (
            <CardBody
              key={child.id}
              childId={child.id}
              name={name}
              parent={parent}
              card={load.card}
              clock={clock}
              onPatch={patchCard}
              onChanged={(status, message) => {
                onChanged(child.id, status);
                setAnnounce(message);
              }}
              onAnnounce={setAnnounce}
            />
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-7 sm:px-7">
              {load.kind === 'loading' && (
                <p className="flex items-center gap-2.5 text-15 text-ink-muted" role="status">
                  <Spinner size={14} />
                  {t('desk.drawer.loading')}
                </p>
              )}
              {load.kind === 'error' && (
                <Banner tone="accent" icon="alert" role="alert">
                  {t('desk.drawer.error')}
                </Banner>
              )}
              {load.kind === 'none' && <Empty title={t('desk.drawer.noneTitle', { name })} body={t('desk.drawer.noneBody', { parent, name })} />}
              {load.kind === 'draft' && <Empty title={t('desk.drawer.draftTitle', { parent })} body={t('desk.drawer.draftBody', { name })} />}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-sharp border border-dashed border-hairline-strong px-5 py-6">
      <p className="text-17 font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[52ch] text-15 text-ink-muted text-pretty">{body}</p>
    </div>
  );
}

function DrawerMeta({ child, card, clock }: { child: DrawerChild; card: CardView | null; clock: DeskClock }) {
  const t = useT();
  const ctx = useDeskTime(clock);
  const parts: string[] = [];
  if (child.grade) parts.push(child.grade);
  if (card?.parentApprovedAt) {
    parts.push(t('desk.drawer.approvedBy', { who: child.parents[0] ?? t('desk.drawer.theParent'), date: dayLabel(new Date(card.parentApprovedAt), ctx) }));
  }
  if (card) parts.push(t('desk.drawer.version', { n: card.version }));
  if (parts.length === 0) return null;
  return <p className="mt-1.5 text-15 text-ink-muted tabular">{parts.join(' · ')}</p>;
}

type BodyProps = {
  childId: string;
  name: string;
  parent: string;
  card: CardView;
  clock: DeskClock;
  onPatch: (p: Partial<CardView>) => void;
  onChanged: (status: CardStatus, message: string) => void;
  onAnnounce: (message: string) => void;
};

function CardBody({ childId, name, parent, card, clock, onPatch, onChanged, onAnnounce }: BodyProps) {
  const t = useT();
  const uid = useId();
  const ctx = useDeskTime(clock);
  const [open, setOpen] = useState<string | null>(null);
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState(false);
  const [asking, setAsking] = useState(false);
  const status = card.status;
  const canDecide = status === 'parent_approved' || status === 'acknowledged';

  const acknowledge = async () => {
    setAcking(true);
    setAckError(false);
    const res = await fetch(`/api/cards/${childId}/ack`, { method: 'POST' }).catch(() => null);
    setAcking(false);
    if (!res?.ok) {
      setAckError(true);
      return;
    }
    const body = (await res.json().catch(() => null)) as { directorAckAt?: string } | null;
    onPatch({ status: 'acknowledged', directorAckAt: body?.directorAckAt ?? new Date().toISOString() });
    onChanged('acknowledged', t('desk.drawer.acked', { name }));
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 sm:px-7">
        {status === 'parent_approved' && (
          <Banner tone="accent" icon={null} title={t('desk.drawer.reviewTitle')} className="mb-6">
            {t('desk.drawer.reviewBody', { parent, name })}
          </Banner>
        )}
        {status === 'acknowledged' && card.directorAckAt && (
          <Banner tone="ok" role="status" className="mb-6">
            {t('desk.drawer.reviewedOn', { date: dayLabel(new Date(card.directorAckAt), ctx, true), name })}
          </Banner>
        )}
        {status === 'returned' && (
          <Banner tone="neutral" icon="reset" title={t('desk.drawer.returnedTitle', { parent })} className="mb-6">
            {card.returnedQuestion ? <span className="text-ink-2">“{card.returnedQuestion}”</span> : null}
          </Banner>
        )}

        <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-hairline py-4 text-15 sm:grid-cols-3">
          <Fact k={t('desk.drawer.support')}>{card.supportLevel ? t(`desk.support.${card.supportLevel}`) : t('desk.support.unset')}</Fact>
          <Fact k={t('desk.drawer.language')}>{card.lang === 'es' ? t('desk.lang.es') : t('desk.lang.en')}</Fact>
          <Fact k={t('desk.drawer.lines')}>{card.items.length}</Fact>
        </dl>

        <Card title={<b>{t('desk.drawer.cardTitle')}</b>} aside={<span className="text-13 text-ink-muted">{t('desk.drawer.tapLine')}</span>}>
          <CardLines
            items={card.items}
            cardLang={card.lang}
            active={open}
            open={open}
            onToggle={(id) => setOpen((cur) => (cur === id ? null : id))}
            translations
            idPrefix={uid}
            voice="team"
          />
        </Card>

        <TeamNotes childId={childId} name={name} initial={card.teamNotes ?? ''} onSaved={(text) => { onPatch({ teamNotes: text || undefined }); onAnnounce(t('desk.team.saved')); }} />

        {asking && (
          <SendBack
            childId={childId}
            name={name}
            parent={parent}
            onCancel={() => setAsking(false)}
            onSent={(question) => {
              setAsking(false);
              onPatch({ status: 'returned', returnedQuestion: question, directorAckAt: null });
              onChanged('returned', t('desk.drawer.sentBack', { parent }));
            }}
          />
        )}
      </div>

      {canDecide && !asking && (
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline bg-surface px-5 py-3.5 sm:px-7">
          {status === 'parent_approved' && (
            <Button variant="primary" pending={acking} onClick={acknowledge} iconEnd={<Icon name="check" size={13} />}>
              {t('desk.drawer.acknowledge')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setAsking(true)}>
            {t('desk.drawer.sendBack')}
          </Button>
          {ackError && (
            <p role="alert" className="text-15 text-danger-ink">
              {t('desk.drawer.ackFailed')}
            </p>
          )}
          {status === 'parent_approved' && !ackError && <p className="text-13 text-ink-muted">{t('desk.drawer.ackHint', { name })}</p>}
        </footer>
      )}
    </>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-13 text-ink-muted">{k}</dt>
      <dd className="mt-0.5 text-ink tabular">{children}</dd>
    </div>
  );
}

function TeamNotes({ childId, name, initial, onSaved }: { childId: string; name: string; initial: string; onSaved: (text: string) => void }) {
  const t = useT();
  const fieldId = useId();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = text.trim() !== saved.trim();

  const save = async () => {
    setState('saving');
    const res = await fetch(`/api/cards/${childId}/team-notes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (!res?.ok) return setState('error');
    setSaved(text.trim());
    setState('saved');
    onSaved(text.trim());
  };

  return (
    <section aria-labelledby={`${fieldId}-label`} className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label id={`${fieldId}-label`} htmlFor={fieldId} className="text-17 font-medium text-ink">
          {t('desk.team.label')}
        </label>
        <span className="text-13 text-ink-muted">{t('desk.team.shownAs')}</span>
      </div>
      <p id={`${fieldId}-hint`} className="mt-1 mb-3 max-w-[60ch] text-15 text-ink-muted text-pretty">
        {t('desk.team.hint', { name })}
      </p>
      <Textarea
        id={fieldId}
        rows={3}
        value={text}
        maxLength={MAX_NOTE}
        aria-describedby={`${fieldId}-hint`}
        placeholder={t('desk.team.placeholder', { name })}
        onChange={(e) => {
          setText(e.target.value);
          if (state !== 'saving') setState('idle');
        }}
        className="text-15 leading-[1.55]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={!dirty} pending={state === 'saving'} onClick={save}>
          {t('desk.team.save')}
        </Button>
        <p role="status" className={cx('text-13', state === 'error' ? 'text-danger-ink' : 'text-ok-ink')}>
          {state === 'saved' && !dirty && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="check" size={12} />
              {t('desk.team.saved')}
            </span>
          )}
          {state === 'error' && t('desk.team.failed')}
        </p>
      </div>
    </section>
  );
}

function SendBack({
  childId, name, parent, onCancel, onSent,
}: { childId: string; name: string; parent: string; onCancel: () => void; onSent: (question: string) => void }) {
  const t = useT();
  const fieldId = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    box.current?.focus();
    box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const send = async () => {
    setSending(true);
    setError(false);
    const res = await fetch(`/api/cards/${childId}/return`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: question.trim() }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) return setError(true);
    onSent(question.trim());
  };

  return (
    <section aria-labelledby={`${fieldId}-label`} className="mt-8 rounded-sharp border border-hairline-strong bg-surface px-4 pt-4 pb-5 sm:px-[22px]">
      <label id={`${fieldId}-label`} htmlFor={fieldId} className="text-17 font-medium text-ink">
        {t('desk.return.label', { parent })}
      </label>
      <p id={`${fieldId}-hint`} className="mt-1 mb-3 max-w-[60ch] text-15 text-ink-muted text-pretty">
        {t('desk.return.hint', { parent, name })}
      </p>
      <Textarea
        ref={box}
        id={fieldId}
        rows={3}
        value={question}
        maxLength={MAX_QUESTION}
        aria-describedby={`${fieldId}-hint`}
        placeholder={t('desk.return.placeholder')}
        onChange={(e) => setQuestion(e.target.value)}
        counter={{ count: question.length, max: MAX_QUESTION, label: t('ui.counter', { count: question.length, max: MAX_QUESTION }) }}
        className="text-15 leading-[1.55]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={question.trim().length === 0} pending={sending} onClick={send}>
          {t('desk.return.send')}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t('desk.return.cancel')}
        </Button>
        {error && (
          <p role="alert" className="text-15 text-danger-ink">
            {t('desk.return.failed')}
          </p>
        )}
      </div>
    </section>
  );
}
