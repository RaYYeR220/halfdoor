'use client';
// (A) The parent writes about their child in their own words. Saved in this browser as they type; nothing
// leaves the page until "Make the card", and then only after the enclave check passes.
import { useEffect, useId, useRef, useState } from 'react';
import { ENCLAVE_COPY, ENCLAVE_COPY_ES } from '@/lib/crypto/attestation';
import { preloadQuoteVerifier } from '@/lib/crypto/tdxQuote';
import { STORY_MAX, STORY_MIN } from '@/lib/card/pipeline';
import { cx } from '@/lib/cx';
import type { Lang, MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import type { DraftFailure } from '@/lib/parent/errors';
import { formatNumber } from '@/lib/parent/format';
import type { AccessRow } from '@/lib/parent/types';
import { EnclaveStatus } from '@/components/enclave/EnclaveStatus';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { AccessLog } from './AccessLog';
import { useAutoFocus } from './useAutoFocus';

type Props = {
  childName: string;
  story: string;
  onChange: (text: string) => void;
  onClear: () => void;
  onMake: () => void;
  failure?: DraftFailure;
  /** The text on screen is the copy saved in this browser. */
  saved: boolean;
  /** Rewriting a card that already exists (from "Edit my words"). */
  editing: boolean;
  onCancelEdit: () => void;
  /** The card's own quotes, offered as a start when this browser has no saved words. */
  fromCard: string | null;
  access: AccessRow[];
  tz: string;
  now: string;
  shiftMs: number;
  focusToken: number;
  lang: Lang;
};

const HINTS: { key: string; label: MessageKey; starter: MessageKey; note?: MessageKey }[] = [
  { key: 'loves', label: 'parent.hint.loves', starter: 'parent.starter.loves' },
  { key: 'hard', label: 'parent.hint.hard', starter: 'parent.starter.hard' },
  { key: 'helps', label: 'parent.hint.helps', starter: 'parent.starter.helps' },
  { key: 'communicates', label: 'parent.hint.communicates', starter: 'parent.starter.communicates' },
  { key: 'safety', label: 'parent.hint.safety', starter: 'parent.starter.safety', note: 'parent.hint.safetyNote' },
];

export function StoryEditor(p: Props) {
  const t = useT();
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const headingRef = useAutoFocus<HTMLHeadingElement>(p.editing || p.failure ? 0 : p.focusToken);
  const failureRef = useAutoFocus<HTMLDivElement>(p.failure ? p.focusToken : 0);
  const boxFocus = useAutoFocus<HTMLTextAreaElement>(p.editing && !p.failure ? p.focusToken : 0);
  const [confirmClear, setConfirmClear] = useState(false);
  const copy = p.lang === 'es' ? ENCLAVE_COPY_ES : ENCLAVE_COPY;
  const name = p.childName;
  const count = p.story.length;
  const num = (n: number) => formatNumber(n, p.lang);
  const tooShort = p.story.trim().length < STORY_MIN;
  const tooLong = count > STORY_MAX;

  // Warm Intel's signature verifier while the parent writes, so the check before sending is quicker.
  useEffect(() => preloadQuoteVerifier(), []);

  const setBox = (el: HTMLTextAreaElement | null) => {
    box.current = el;
    boxFocus(el);
  };

  const insert = (starter: string) => {
    const el = box.current;
    const at = el ? el.selectionEnd : p.story.length;
    const before = p.story.slice(0, at);
    const after = p.story.slice(at);
    const head = before.replace(/ +$/, '');
    const next = `${head}${head.length === 0 || head.endsWith('\n') ? '' : '\n'}${starter}${after}`;
    const caret = next.length - after.length;
    p.onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const dictation = useDictation(p.lang, (text) => {
    const cur = box.current?.value ?? p.story;
    p.onChange(cur && !/\s$/.test(cur) ? `${cur} ${text}` : `${cur}${text}`);
  });

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 max-w-[720px]">
        {p.editing && (
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-15 text-ink-muted">{t('parent.write.editingNote')}</p>
            <Button variant="quiet" size="sm" onClick={p.onCancelEdit} className="-ml-4">
              {t('parent.write.backToCard', { name })}
            </Button>
          </div>
        )}
        <h1 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="text-32 font-medium text-balance text-ink outline-none">
          {t('parent.write.title', { name })}
        </h1>
        <p id={`${id}-lede`} className="mt-3 max-w-[58ch] text-17 text-ink-2 text-pretty">
          {t('parent.write.lede', { name })}
        </p>

        {p.failure && (
          <div ref={failureRef} tabIndex={-1} className="mt-6 flex flex-col gap-3 outline-none">
            {p.failure.kind === 'enclave' ? (
              <EnclaveStatus value={p.failure.status} lang={p.lang} time={{ tz: p.tz, shiftMs: p.shiftMs ?? 0 }} />
            ) : (
              <Banner tone="safety" role="alert" title={t('parent.error.title')}>
                {t(p.failure.key, { min: num(STORY_MIN), max: num(STORY_MAX) })}
              </Banner>
            )}
            <p className="text-15 text-ink-muted">{t('parent.error.kept')}</p>
          </div>
        )}

        <div className="mt-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-13 font-medium text-ink-muted" id={`${id}-hints`}>
              {t('parent.write.startLine')}
            </span>
            {HINTS.map((h) => (
              <Chip
                key={h.key}
                onClick={() => insert(t(h.starter, { name }))}
                aria-describedby={`${id}-hints`}
                title={h.note ? t(h.note) : undefined}
              >
                {t(h.label, { name })}
              </Chip>
            ))}
          </div>
          {p.fromCard && !p.story.trim() && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-sharp border border-hairline-strong bg-surface-2 px-4 py-3">
              <p className="min-w-0 flex-1 basis-[18rem] text-15 text-ink-2 text-pretty">{t('parent.write.noSaved')}</p>
              <Button size="sm" variant="secondary" onClick={() => p.onChange(p.fromCard ?? '')}>
                {t('parent.write.fromCard')}
              </Button>
            </div>
          )}

          <div className="relative mt-4">
            <textarea
              ref={setBox}
              rows={11}
              value={p.story}
              onChange={(e) => p.onChange(e.target.value)}
              aria-labelledby={`${id}-title`}
              aria-describedby={`${id}-lede ${id}-count`}
              aria-invalid={tooLong || undefined}
              placeholder={t('parent.write.placeholder', { name })}
              spellCheck
              className={cx(
                'block min-h-[16rem] w-full resize-y rounded-sharp border bg-surface px-4 pt-3.5 pb-12 text-17 leading-[1.65] text-ink sm:px-5 sm:pt-4',
                'placeholder:text-ink-muted-2 transition-[border-color] duration-200 ease-out',
                'border-hairline-strong hover:border-hairline-emphasis focus-visible:border-hairline-emphasis',
                'aria-[invalid=true]:border-danger-ink',
              )}
            />
            {dictation.available && (
              <div className="absolute right-2 bottom-2">
                <Button
                  size="sm"
                  variant={dictation.listening ? 'primary' : 'quiet'}
                  onClick={dictation.toggle}
                  aria-pressed={dictation.listening}
                  icon={<MicGlyph />}
                >
                  {dictation.listening ? t('parent.write.dictateStop') : t('parent.write.dictate')}
                </Button>
              </div>
            )}
          </div>

          <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-2 text-13 text-ink-muted">
              {confirmClear ? (
                <span className="flex flex-wrap items-center gap-x-1 gap-y-1" role="group" aria-label={t('parent.write.clearConfirm')}>
                  <span className="mr-1 text-ink">{t('parent.write.clearConfirm')}</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      p.onClear();
                      setConfirmClear(false);
                      box.current?.focus();
                    }}
                  >
                    {t('parent.write.clearYes')}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setConfirmClear(false)} autoFocus>
                    {t('parent.write.clearNo')}
                  </Button>
                </span>
              ) : (
                <>
                  {p.saved && count > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="check" size={12} className="text-ok-ink" />
                      {t('parent.write.saved')}
                    </span>
                  )}
                  {count > 0 && (
                    <>
                      {p.saved && <span aria-hidden>·</span>}
                      <button
                        type="button"
                        onClick={() => setConfirmClear(true)}
                        className="relative rounded-sharp font-medium text-ink-muted underline decoration-hairline-emphasis underline-offset-4 hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                      >
                        {t('parent.write.clear')}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            <p id={`${id}-count`} className={cx('text-13 tabular', tooLong ? 'text-danger-ink' : 'text-ink-muted')}>
              <span aria-hidden>
                {num(count)} / {num(STORY_MAX)}
              </span>
              <span className="sr-only">{t('ui.counter', { count: num(count), max: num(STORY_MAX) })}</span>
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button variant="primary" onClick={p.onMake} disabled={tooShort || tooLong} iconEnd={<Icon name="arrowRight" />}>
              {t('parent.write.make')}
            </Button>
            {tooShort && (
              <p className="text-15 text-ink-muted tabular">
                {t('parent.write.minHint', { min: num(STORY_MIN), count: num(Math.max(1, STORY_MIN - p.story.trim().length)) })}
              </p>
            )}
            {tooLong && <p className="text-15 text-danger-ink">{t('parent.write.tooLong', { max: num(STORY_MAX) })}</p>}
          </div>

          <div className="mt-8 border-t border-hairline pt-5">
            <p className="flex items-start gap-2.5 text-15 text-ink-2 text-pretty">
              <Icon name="lock" size={15} className="mt-[3px] shrink-0 text-ink-muted" />
              <span>{copy.short}</span>
            </p>
            <details className="group mt-1 pl-[25px]">
              <summary className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-sharp px-1 text-15 font-medium text-rose hover:text-accent-ink">
                {t('parent.write.protectedLink')}
                <Icon name="chevronDown" className="transition-transform duration-200 ease-out group-open:rotate-180" />
              </summary>
              <div className="mt-1 flex max-w-[62ch] flex-col gap-3 pb-1 text-15 text-ink-2 text-pretty">
                <p>{t('parent.write.protectedSteps')}</p>
                <div className="rounded-sharp border border-hairline bg-surface-2 px-3.5 py-3">
                  <p className="text-13 font-medium text-ink-muted">{t('enclave.limits')}</p>
                  <p className="mt-1">{copy.limits}</p>
                  <p className="mt-2 text-ink-muted">{copy.pccsNote}</p>
                </div>
              </div>
            </details>
          </div>
        </div>

        {p.access.length > 0 && !p.editing && (
          <div className="mt-14">
            <AccessLog childName={name} rows={p.access} tz={p.tz} now={p.now} shiftMs={p.shiftMs} lang={p.lang} />
          </div>
        )}
      </div>

      <aside aria-labelledby={`${id}-next`} className="lg:pt-[4.5rem]">
        <h2 id={`${id}-next`} className="text-15 font-medium text-ink-muted">
          {t('parent.next.title')}
        </h2>
        <ol className="mt-4 flex flex-col">
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className="relative flex gap-3.5 pb-6 last:pb-0">
              {n < 3 && <span aria-hidden className="absolute top-8 bottom-1 left-[13px] w-px bg-hairline-strong" />}
              <span
                aria-hidden
                className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-pill border border-hairline-strong bg-surface text-13 font-medium text-ink tabular"
              >
                {n}
              </span>
              <div className="min-w-0 pt-[3px]">
                <p className="text-15 font-medium text-ink">{t(`parent.next.${n}.title`)}</p>
                <p className="mt-0.5 text-15 text-ink-muted text-pretty">{t(`parent.next.${n}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 14 14" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden>
      <rect x="4.75" y="1.5" width="4.5" height="7" rx="2.25" />
      <path d="M2.75 7a4.25 4.25 0 0 0 8.5 0M7 11.25v1.5" />
    </svg>
  );
}

// ---- dictation: only speech recognition that runs on this device (the words must not go to a speech service)
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = (new () => Recognition) & {
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
};

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SPEECH_LANG: Record<Lang, string> = { en: 'en-US', es: 'es-419' };

/**
 * The button shows only when the browser says on-device recognition is installed for this language
 * (SpeechRecognition.available with processLocally); cloud speech recognition is never used.
 */
function useDictation(lang: Lang, onText: (text: string) => void) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => {
    let alive = true;
    const Ctor = recognitionCtor();
    if (!Ctor || typeof Ctor.available !== 'function') return;
    Ctor.available({ langs: [SPEECH_LANG[lang]], processLocally: true })
      .then((status) => {
        if (alive) setAvailable(status === 'available');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      rec.current?.stop();
    };
  }, [lang]);

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[lang];
    r.processLocally = true;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal && res[0].transcript.trim()) onTextRef.current(res[0].transcript.trim());
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return { available, listening, toggle };
}
