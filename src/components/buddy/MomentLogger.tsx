'use client';
// Log a moment in two taps, during the step that's on now (or another one): a good moment, a hard one (with what
// helped, from the card's Helps lines), a break, the bathroom, or a short note. Below, what's been logged today.
import { useId, useRef, useState } from 'react';
import type { MomentRow } from '@/lib/buddy/types';
import { cx } from '@/lib/cx';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { MAX_MOMENT_NOTE_CHARS } from '@/lib/note/schema';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';

export type MomentKind = MomentRow['kind'];
export type SaveResult = 'ok' | 'locked' | 'failed';
export type NewMoment = { stepKey: string; kind: MomentKind; helpedItemIds: string[]; note?: string };

export const KIND_LABEL: Record<MomentKind, MessageKey> = {
  good: 'buddy.log.good',
  hard: 'buddy.log.hard',
  break: 'buddy.log.break',
  bathroom: 'buddy.log.bathroom',
  note: 'buddy.log.note',
};

const KIND_DOT: Record<MomentKind, string> = {
  good: 'bg-ok-ink',
  hard: 'bg-accent',
  break: 'bg-ink-muted',
  bathroom: 'bg-ink-muted',
  note: 'bg-ink-muted',
};

type Props = {
  name: string;
  steps: readonly { key: string; label: string }[];
  /** The step on now (by the clock), the default choice. */
  currentKey: string | null;
  helps: readonly { id: string; text: string; lang?: string }[];
  moments: readonly MomentRow[] | null;
  onSave: (m: NewMoment) => Promise<SaveResult>;
  timeOf: (iso: string) => string;
};

export function MomentLogger({ name, steps, currentKey, helps, moments, onSave, timeOf }: Props) {
  const t = useT();
  const toast = useToast();
  const uid = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const [panel, setPanel] = useState<'hard' | 'note' | null>(null);
  const [helped, setHelped] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<MomentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelHead = useRef<HTMLHeadingElement>(null);

  const stepKey = picked ?? currentKey ?? 'other';
  const stepName = (key: string) => (key === 'other' ? t('buddy.log.other') : (steps.find((s) => s.key === key)?.label ?? key));
  const helpText = new Map(helps.map((h) => [h.id, h.text]));

  const save = async (kind: MomentKind) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    const r = await onSave({
      stepKey,
      kind,
      helpedItemIds: kind === 'hard' ? helped : [],
      ...(kind === 'note' ? { note: note.trim() } : {}),
    });
    setBusy(null);
    if (r === 'ok') {
      toast(t('buddy.log.saved', { kind: t(KIND_LABEL[kind]) }), { tone: 'ok' });
      setPanel(null);
      setHelped([]);
      setNote('');
    } else if (r === 'failed') {
      setError(t('buddy.log.failed'));
    }
    // 'locked': the card closed under us; the panel goes away with it.
  };

  const open = (p: 'hard' | 'note') => {
    setPanel((cur) => (cur === p ? null : p));
    setError(null);
    requestAnimationFrame(() => panelHead.current?.focus());
  };

  const noteLen = note.trim().length;
  const list = moments ? [...moments].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : null;

  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-5 sm:px-5">
      <section aria-labelledby={`${uid}-title`}>
        <h3 id={`${uid}-title`} className="text-20 font-medium tracking-[-0.02em] text-ink">
          {t('buddy.log.title')}
        </h3>

        <div role="group" aria-label={t('buddy.log.during')} className="mt-3">
          <p className="text-13 text-ink-muted">{t('buddy.log.during')}</p>
          <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 pt-[7px] pb-[7px] sm:-mx-5 sm:px-5">
            {[...steps.map((s) => s.key), 'other'].map((key) => (
              <Chip key={key} pressed={stepKey === key} onClick={() => setPicked(key === currentKey ? null : key)}>
                {stepName(key)}
                {key === currentKey && <span className={cx('font-normal', stepKey === key ? 'text-accent-ink' : 'text-rose')}>· {t('buddy.log.nowTag')}</span>}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <KindButton kind="good" busy={busy} onClick={() => save('good')} big />
          <KindButton kind="hard" busy={busy} onClick={() => open('hard')} expanded={panel === 'hard'} controls={`${uid}-panel`} big />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <KindButton kind="break" busy={busy} onClick={() => save('break')} />
          <KindButton kind="bathroom" busy={busy} onClick={() => save('bathroom')} />
          <KindButton kind="note" busy={busy} onClick={() => open('note')} expanded={panel === 'note'} controls={`${uid}-panel`} />
        </div>

        <div id={`${uid}-panel`} hidden={!panel}>
          {panel === 'hard' && (
            <div className="mt-3 animate-rise rounded-sharp border border-hairline-strong bg-surface-2 px-4 pt-3.5 pb-4">
              <h4 ref={panelHead} tabIndex={-1} className="text-17 font-medium text-ink outline-none">
                {t('buddy.log.helped')}
              </h4>
              <p className="text-13 text-ink-muted text-pretty">{helps.length ? t('buddy.log.helpedHint') : t('buddy.log.noHelps')}</p>
              {helps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-2 gap-y-3.5">
                  {helps.map((h) => {
                    const on = helped.includes(h.id);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        aria-pressed={on}
                        lang={h.lang}
                        onClick={() => setHelped((cur) => (on ? cur.filter((x) => x !== h.id) : [...cur, h.id]))}
                        className={cx(
                          "relative inline-flex min-h-[34px] max-w-full items-center gap-[7px] rounded-pill border py-[6px] pr-[14px] pl-[12px] text-left text-15 leading-5 font-medium",
                          "transition-[background-color,border-color,color] duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-[5px] after:content-['']",
                          on ? 'border-accent-line bg-accent-tint text-accent-ink' : 'border-hairline-strong bg-surface text-ink hover:border-hairline-emphasis',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cx(
                            'inline-flex size-4 shrink-0 items-center justify-center rounded-pill border',
                            on ? 'border-accent-ink bg-accent-ink text-surface' : 'border-hairline-emphasis bg-surface',
                          )}
                        >
                          {on && <Icon name="check" size={10} />}
                        </span>
                        <span className="min-w-0">{h.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" pending={busy === 'hard'} onClick={() => save('hard')}>
                  {t('buddy.log.saveHard')}
                </Button>
                <Button variant="quiet" onClick={() => setPanel(null)}>
                  {t('buddy.log.cancel')}
                </Button>
              </div>
            </div>
          )}
          {panel === 'note' && (
            <div className="mt-3 animate-rise rounded-sharp border border-hairline-strong bg-surface-2 px-4 pt-3.5 pb-4">
              <h4 ref={panelHead} tabIndex={-1} className="text-17 font-medium text-ink outline-none">
                <label htmlFor={`${uid}-note`}>{t('buddy.log.noteLabel')}</label>
              </h4>
              <div className="mt-2">
                <Textarea
                  id={`${uid}-note`}
                  rows={3}
                  value={note}
                  maxLength={MAX_MOMENT_NOTE_CHARS}
                  placeholder={t('buddy.log.notePlaceholder')}
                  onChange={(e) => setNote(e.target.value)}
                  counter={{ count: note.length, max: MAX_MOMENT_NOTE_CHARS, label: t('ui.counter', { count: note.length, max: MAX_MOMENT_NOTE_CHARS }) }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" pending={busy === 'note'} disabled={noteLen === 0} onClick={() => save('note')}>
                  {t('buddy.log.saveNote')}
                </Button>
                <Button variant="quiet" onClick={() => setPanel(null)}>
                  {t('buddy.log.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-15 text-danger-ink">
            <Icon name="alert" className="mt-1 shrink-0" />
            {error}
          </p>
        )}
      </section>

      <section aria-labelledby={`${uid}-today`} className="border-t border-hairline pt-4">
        <h3 id={`${uid}-today`} className="text-17 font-medium text-ink">
          {t('buddy.log.today', { name })}
        </h3>
        {list === null ? (
          <div aria-hidden className="mt-3 flex flex-col gap-2">
            <div className="h-4 w-2/3 rounded-sharp bg-ground-edge" />
            <div className="h-4 w-1/2 rounded-sharp bg-ground" />
          </div>
        ) : list.length === 0 ? (
          <p className="mt-1 text-15 text-ink-muted">{t('buddy.log.none')}</p>
        ) : (
          <ol className="mt-2 flex flex-col">
            {list.map((m) => {
              const items = m.helpedItemIds.map((id) => helpText.get(id)).filter(Boolean) as string[];
              return (
                <li key={m.id} className="grid animate-rise grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 border-t border-hairline py-2.5 first:border-t-0">
                  <span className="pt-px text-15 text-ink-muted tabular">{timeOf(m.at)}</span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-17 leading-6 text-ink">
                      <span aria-hidden className={cx('size-2 shrink-0 rounded-pill', KIND_DOT[m.kind])} />
                      <span>
                        <span className="font-medium">{t(KIND_LABEL[m.kind])}</span>
                        <span className="text-ink-muted"> · {stepName(m.stepKey)}</span>
                      </span>
                    </p>
                    {items.length > 0 && <p className="mt-0.5 text-15 text-ink-muted text-pretty">{t('buddy.log.helpedList', { items: items.join(' · ') })}</p>}
                    {m.note && <p className="mt-0.5 text-15 text-ink-2 text-pretty">“{m.note}”</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-13 text-ink-muted-2 text-pretty">{t('buddy.log.who')}</p>
      </section>
    </div>
  );
}

function KindButton({
  kind, busy, onClick, big, expanded, controls,
}: { kind: MomentKind; busy: MomentKind | null; onClick: () => void; big?: boolean; expanded?: boolean; controls?: string }) {
  const t = useT();
  const pending = busy === kind && kind !== 'hard' && kind !== 'note';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null && !pending}
      aria-busy={pending || undefined}
      aria-expanded={expanded}
      aria-controls={expanded !== undefined ? controls : undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-sharp border px-2.5 font-medium whitespace-nowrap transition-[background-color,border-color] duration-200 ease-out',
        'disabled:opacity-45',
        big ? 'min-h-14 text-17' : 'min-h-12 text-15',
        expanded ? 'border-ink bg-surface text-ink' : 'border-hairline-strong bg-surface text-ink hover:border-hairline-emphasis hover:bg-surface-2',
      )}
    >
      {pending ? (
        <Spinner size={14} />
      ) : (
        big && <span aria-hidden className={cx('size-2 rounded-pill', KIND_DOT[kind])} />
      )}
      {t(KIND_LABEL[kind])}
      {expanded !== undefined && !big && (
        <Icon name="chevronDown" size={12} className={cx('shrink-0 text-ink-muted transition-transform duration-200 ease-out', expanded && 'rotate-180')} />
      )}
    </button>
  );
}
