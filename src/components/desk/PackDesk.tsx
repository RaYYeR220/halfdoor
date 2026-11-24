'use client';
// Sunday pack: paste the lesson, pick the services, make the picture schedule (one call that sees the lesson and
// nothing about the children), then look at every expected child's page and print them, one child per page.
import { useEffect, useEffectEvent, useId, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import type { DeskClock, DeskService, PackChild } from '@/lib/desk/types';
import type { Lang, MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { timeLabel } from '@/lib/parent/format';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { DeskHead, useDeskTime } from './DeskFrame';
import { PackSheet, type Pack } from './PackSheet';

const MAX_LESSON = 8000;

type Props = {
  services: DeskService[];
  clock: DeskClock;
  /** Expected children (with an approved card) per service. */
  packChildren: Record<string, PackChild[]>;
  initialText: string;
  churchName: string;
};

type LessonInfo = { id: string; title: string; bigIdeaQuote: string | null; verseRef: string | null; steps: unknown[] };
type Making =
  | { kind: 'idle' }
  | { kind: 'confirm'; titles: string[]; services: string[] }
  | { kind: 'running' }
  | { kind: 'error'; keys: MessageKey[] }
  | { kind: 'done'; title: string; steps: number; minutes: number; verse: string | null; replaced: string[] };

type Linked = Record<string, { id: string; title: string } | null>;

const LESSON_ERRORS: Record<string, MessageKey> = {
  big_idea_not_in_lesson: 'desk.pack.err.bigIdea',
  bad_label: 'desk.pack.err.label',
  duplicate_step_key: 'desk.pack.err.duplicate',
  total_minutes_over_120: 'desk.pack.err.minutes',
};

/** Runs `job` over `items`, at most `n` at a time. */
async function pool<T>(items: readonly T[], n: number, job: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await job(items[next++]);
  }));
}

export function PackDesk({ services, clock, packChildren, initialText, churchName }: Props) {
  const t = useT();
  const uid = useId();
  const ctx = useDeskTime(clock);
  const [text, setText] = useState(initialText);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(services.map((s) => s.id)));
  const [making, setMaking] = useState<Making>({ kind: 'idle' });
  const [linked, setLinked] = useState<Linked>(() => Object.fromEntries(services.map((s) => [s.id, s.lessonId ? { id: s.lessonId, title: s.lessonTitle ?? '' } : null])));
  const [previewId, setPreviewId] = useState(services.find((s) => s.lessonId)?.id ?? services[0]?.id ?? '');
  const [version, setVersion] = useState(0);
  const [lessons, setLessons] = useState<Record<string, LessonInfo | 'none' | 'error'>>({});
  const [packs, setPacks] = useState<Record<string, Pack | 'error'>>({});
  const [childLang, setChildLang] = useState<Record<string, Lang>>({});
  const [pageChild, setPageChild] = useState<Record<string, string>>({});

  const preview = services.find((s) => s.id === previewId);
  const kids = preview ? (packChildren[preview.id] ?? []) : [];
  const lessonKey = preview ? `${preview.id}:${linked[preview.id]?.id ?? 'none'}:${version}` : '';
  const packKey = (childId: string, lang: Lang) => `${lessonKey}|${childId}|${lang}`;
  const when = (s: DeskService) => timeLabel(new Date(s.startsAt), new Date(s.endsAt), ctx);
  const short = (s: DeskService) => s.label.replace(/\s+service$/i, '');

  // The preview service's lesson, then each expected child's page (two at a time; Spanish homes get both languages).
  const loadPreview = useEffectEvent((signal: AbortSignal) => {
    if (!preview) return;
    const key = lessonKey;
    const jobs = kids.flatMap((k) => (k.lang === 'es' ? [[k.id, 'en'], [k.id, 'es']] : [[k.id, 'en']]) as [string, Lang][]);
    (async () => {
      const res = await fetch(`/api/lessons?service=${preview.id}`, { cache: 'no-store', signal });
      if (res.status === 404) return setLessons((l) => ({ ...l, [key]: 'none' }));
      const lesson = res.ok ? ((await res.json()) as LessonInfo) : null;
      setLessons((l) => ({ ...l, [key]: lesson ?? 'error' }));
      if (!lesson) return;
      await pool(jobs, 2, async ([childId, lang]) => {
        const r = await fetch(`/api/pack?service=${preview.id}&child=${childId}&lang=${lang}`, { cache: 'no-store', signal });
        const body = r.ok ? ((await r.json()) as Pack) : null;
        setPacks((p) => ({ ...p, [`${key}|${childId}|${lang}`]: body ?? 'error' }));
      });
    })().catch((e) => {
      if ((e as { name?: string })?.name !== 'AbortError') setLessons((l) => ({ ...l, [key]: 'error' }));
    });
  });
  // lessonKey carries the service, its lesson and the version.
  useEffect(() => {
    const ctrl = new AbortController();
    loadPreview(ctrl.signal);
    return () => ctrl.abort();
  }, [lessonKey]);

  const make = async (confirmed: boolean) => {
    const ids = services.filter((s) => chosen.has(s.id)).map((s) => s.id);
    const replacing = services.filter((s) => chosen.has(s.id) && linked[s.id]);
    if (replacing.length > 0 && !confirmed) {
      setMaking({ kind: 'confirm', titles: [...new Set(replacing.map((s) => linked[s.id]!.title).filter(Boolean))], services: replacing.map(short) });
      return;
    }
    setMaking({ kind: 'running' });
    const res = await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceIds: ids, text }),
    }).catch(() => null);
    if (!res) return setMaking({ kind: 'error', keys: ['desk.pack.err.network'] });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return setMaking({ kind: 'error', keys: errorKeys(res.status, body) });
    const lesson = body?.lesson as { title: string; steps: unknown[]; totalMinutes: number } | undefined;
    const id = String(body?.id ?? '');
    const verse = (body?.verse as { ref?: string } | null)?.ref ?? null;
    const replaced = Array.isArray(body?.replaced) ? (body.replaced as string[]) : [];
    setLinked((l) => ({ ...l, ...Object.fromEntries(ids.map((x) => [x, { id, title: lesson?.title ?? '' }])) }));
    setMaking({
      kind: 'done',
      title: lesson?.title ?? '',
      steps: lesson?.steps.length ?? 0,
      minutes: lesson?.totalMinutes ?? 0,
      verse,
      replaced: services.filter((s) => replaced.includes(s.id)).map(short),
    });
    setVersion((v) => v + 1);
    if (!ids.includes(previewId)) setPreviewId(ids[0]);
  };

  const lesson = lessons[lessonKey];
  const info = lesson && lesson !== 'none' && lesson !== 'error' ? lesson : null;
  const totalMinutes = (() => {
    const first = kids.length ? packs[packKey(kids[0].id, 'en')] : undefined;
    return first && first !== 'error' ? first.steps.reduce((n, s) => n + s.minutes, 0) : null;
  })();
  const selectedKid = kids.find((k) => k.id === pageChild[previewId]) ?? kids[0];
  const langOf = (k: PackChild) => childLang[k.id] ?? k.lang;
  const overviewPack = kids.map((k) => packs[packKey(k.id, 'en')]).find((p): p is Pack => !!p && p !== 'error');

  return (
    <div>
      <DeskHead title={t('desk.pack.title')} lede={t('desk.pack.lede')} />

      {/* ------------------------------------------------ the lesson */}
      <section aria-labelledby={`${uid}-lesson`} className="mt-8 rounded-sharp border border-hairline-strong bg-surface px-4 pt-4 pb-5 sm:px-[22px] sm:pt-[18px] print:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline pb-3">
          <label id={`${uid}-lesson`} htmlFor={`${uid}-text`} className="text-17 font-medium text-ink">
            {t('desk.pack.lessonLabel')}
          </label>
          <span className="text-13 text-ink-muted">{t('desk.pack.lessonAside')}</span>
        </div>
        <p id={`${uid}-hint`} className="mt-3 mb-3 max-w-[64ch] text-15 text-ink-muted text-pretty">
          {t('desk.pack.lessonHint')}
        </p>
        <Textarea
          id={`${uid}-text`}
          rows={11}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (making.kind === 'confirm' || making.kind === 'error') setMaking({ kind: 'idle' });
          }}
          aria-describedby={`${uid}-hint`}
          counter={{ count: text.length, max: MAX_LESSON, label: t('ui.counter', { count: text.length, max: MAX_LESSON }) }}
          className="text-15 leading-[1.6]"
        />

        <fieldset className="mt-5">
          <legend className="text-15 font-medium text-ink">{t('desk.pack.useAt')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {services.map((s) => {
              const on = chosen.has(s.id);
              return (
                <label
                  key={s.id}
                  className={cx(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-sharp border px-3.5 py-2 transition-[border-color,background-color] duration-200 ease-out',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
                    on ? 'border-ink bg-surface' : 'border-hairline-strong hover:border-hairline-emphasis',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setChosen((c) => {
                        const n = new Set(c);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      });
                      if (making.kind === 'confirm') setMaking({ kind: 'idle' });
                    }}
                    className="size-[18px] shrink-0 accent-[var(--ink)] focus-visible:outline-none"
                  />
                  <span className="flex flex-col">
                    <span className="text-15 font-medium text-ink">{s.label}</span>
                    <span className="text-13 text-ink-muted tabular">
                      {[when(s), linked[s.id]?.title ? t('desk.pack.now', { title: linked[s.id]!.title }) : t('desk.pack.noLesson')].join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-hairline pt-4">
          <Button
            variant="primary"
            pending={making.kind === 'running'}
            disabled={chosen.size === 0 || text.trim().length < 40 || text.length > MAX_LESSON || making.kind === 'confirm'}
            onClick={() => make(false)}
          >
            {making.kind === 'running' ? t('desk.pack.making') : t('desk.pack.make')}
          </Button>
          <p className="max-w-[52ch] text-13 text-ink-muted text-pretty">{t('desk.pack.privacy')}</p>
        </div>

        <div aria-live="polite">
          {making.kind === 'confirm' && (
            <Banner
              tone="neutral"
              icon="alert"
              className="mt-4"
              title={t('desk.pack.replaceTitle', { services: making.services.join(' · ') })}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => make(true)}>
                    {t('desk.pack.replaceYes')}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setMaking({ kind: 'idle' })}>
                    {t('desk.pack.replaceNo')}
                  </Button>
                </div>
              }
            >
              {making.titles.length ? t('desk.pack.replaceBody', { title: making.titles.join('”, “') }) : null}
            </Banner>
          )}
          {making.kind === 'error' && (
            <Banner tone="accent" icon="alert" role="alert" className="mt-4" title={t('desk.pack.errTitle')}>
              {making.keys.map((k) => (
                <span key={k} className="block">
                  {t(k)}
                </span>
              ))}
            </Banner>
          )}
          {making.kind === 'done' && (
            <Banner tone="ok" role="status" className="mt-4" title={t('desk.pack.doneTitle', { title: making.title })}>
              {[
                t('desk.pack.doneSteps', { count: making.steps, minutes: making.minutes }),
                making.verse ? t('desk.pack.doneVerse', { ref: making.verse }) : t('desk.pack.doneNoVerse'),
                making.replaced.length ? t('desk.pack.doneReplaced', { services: making.replaced.join(', ') }) : null,
              ].filter(Boolean).join(' · ')}
            </Banner>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ the preview */}
      <section aria-labelledby={`${uid}-preview`} className="mt-12 print:mt-0">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 print:hidden">
          <div className="min-w-0">
            <h2 id={`${uid}-preview`} className="text-24 font-medium text-ink">
              {t('desk.pack.previewTitle')}
            </h2>
            {info && (
              <p className="mt-1 text-15 text-ink-muted tabular">
                {[
                  `“${info.title}”`,
                  t('desk.pack.stepsCount', { count: info.steps.length }),
                  totalMinutes ? t('desk.pack.minutes', { n: totalMinutes }) : null,
                  info.verseRef,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {services.length > 1 && (
              <div role="group" aria-label={t('desk.pack.previewFor')} className="flex rounded-pill border border-hairline-strong bg-surface p-[3px]">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={s.id === previewId}
                    onClick={() => setPreviewId(s.id)}
                    className={cx(
                      "relative h-9 rounded-pill px-4 text-15 font-medium tabular transition-colors duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                      s.id === previewId ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {short(s)}
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" onClick={() => window.print()} disabled={!info || kids.length === 0} icon={<PrintIcon />}>
              {t('desk.pack.print')}
            </Button>
          </div>
        </div>

        {!preview ? (
          <Quiet>{t('desk.noServices')}</Quiet>
        ) : lesson === undefined ? (
          <p role="status" className="mt-6 flex items-center gap-2.5 text-15 text-ink-muted print:hidden">
            <Spinner size={14} />
            {t('desk.pack.loading')}
          </p>
        ) : lesson === 'none' ? (
          <Quiet>{t('desk.pack.noneYet', { service: short(preview) })}</Quiet>
        ) : lesson === 'error' ? (
          <Banner tone="accent" icon="alert" role="alert" className="mt-6">
            {t('desk.pack.loadFailed')}
          </Banner>
        ) : kids.length === 0 ? (
          <Quiet>{t('desk.pack.noKids', { service: short(preview) })}</Quiet>
        ) : (
          <>
            {info?.bigIdeaQuote && (
              <p className="mt-5 max-w-[64ch] border-l-2 border-ink pl-4 text-17 text-ink-2 text-pretty print:hidden">
                <span className="font-medium text-ink">{t('desk.pack.bigIdea')}</span> {info.bigIdeaQuote}
              </p>
            )}
            {overviewPack ? (
              <Overview kids={kids} steps={overviewPack.steps} packFor={(id) => packs[packKey(id, 'en')]} />
            ) : (
              <p role="status" className="mt-6 flex items-center gap-2.5 text-15 text-ink-muted print:hidden">
                <Spinner size={14} />
                {t('desk.pack.loading')}
              </p>
            )}

            <div className="mt-12 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 print:hidden">
              <div>
                <h3 className="text-20 font-medium tracking-[-0.02em] text-ink">{t('desk.pack.pagesTitle')}</h3>
                <p className="mt-1 text-15 text-ink-muted">{t('desk.pack.pagesLede')}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div role="group" aria-label={t('desk.pack.pageFor')} className="flex flex-wrap gap-2">
                {kids.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={selectedKid?.id === k.id}
                    onClick={() => setPageChild((p) => ({ ...p, [previewId]: k.id }))}
                    className={cx(
                      'inline-flex h-11 items-center rounded-pill border px-5 text-15 font-medium transition-[background-color,border-color] duration-200 ease-out',
                      selectedKid?.id === k.id ? 'border-ink bg-ink text-surface' : 'border-hairline-strong bg-surface text-ink hover:border-hairline-emphasis',
                    )}
                  >
                    {k.firstName}
                  </button>
                ))}
              </div>
              {selectedKid && (
                <div role="group" aria-label={t('desk.pack.storyLang', { name: selectedKid.firstName })} className="flex rounded-pill border border-hairline-strong bg-surface p-[3px]">
                  {(['en', 'es'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={langOf(selectedKid) === l}
                      onClick={() => {
                        setChildLang((c) => ({ ...c, [selectedKid.id]: l }));
                        if (l === 'es' && !packs[packKey(selectedKid.id, 'es')] && preview) {
                          const key = packKey(selectedKid.id, 'es');
                          fetch(`/api/pack?service=${preview.id}&child=${selectedKid.id}&lang=es`, { cache: 'no-store' })
                            .then((r) => (r.ok ? (r.json() as Promise<Pack>) : null))
                            .then((body) => setPacks((p) => ({ ...p, [key]: body ?? 'error' })))
                            .catch(() => setPacks((p) => ({ ...p, [key]: 'error' })));
                        }
                      }}
                      className={cx(
                        "relative h-9 rounded-pill px-4 text-15 font-medium transition-colors duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                        langOf(selectedKid) === l ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink',
                      )}
                    >
                      <span aria-hidden>{l.toUpperCase()}</span>
                      <span className="sr-only">{l === 'es' ? t('desk.lang.es') : t('desk.lang.en')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-8 print:mt-0 print:block">
              {kids.map((k) => {
                const p = packs[packKey(k.id, langOf(k))];
                const shown = k.id === selectedKid?.id;
                return (
                  <div key={k.id} className={cx(shown ? 'block' : 'hidden', 'print:block print:not-last:break-after-page')}>
                    {p && p !== 'error' ? (
                      <PackSheet
                        childName={k.firstName}
                        pack={p}
                        service={short(preview)}
                        title={info?.title ?? null}
                        bigIdea={info?.bigIdeaQuote ?? null}
                        churchName={churchName}
                        className="mx-auto max-w-[760px]"
                      />
                    ) : p === 'error' ? (
                      <Banner tone="accent" icon="alert" className="print:hidden">
                        {t('desk.pack.pageFailed', { name: k.firstName })}
                      </Banner>
                    ) : (
                      <p className="flex items-center gap-2.5 text-15 text-ink-muted print:hidden">
                        <Spinner size={14} />
                        {t('desk.pack.loading')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function errorKeys(status: number, body: Record<string, unknown> | null): MessageKey[] {
  const code = typeof body?.error === 'string' ? body.error : '';
  if (status === 422 && code === 'lesson_unverified') {
    const errs = Array.isArray(body?.errors) ? (body.errors as string[]) : [];
    const keys = errs.map((e) => LESSON_ERRORS[e]).filter((k): k is MessageKey => !!k);
    return keys.length ? [...new Set(keys)] : ['desk.pack.err.unusable'];
  }
  if (status === 429) return [code === 'daily_cap' ? 'desk.pack.err.daily' : 'desk.pack.err.sandbox'];
  if (code === 'lesson_too_short') return ['desk.pack.err.short'];
  if (code === 'lesson_too_long') return ['desk.pack.err.long'];
  if (code === 'invalid_services') return ['desk.pack.err.services'];
  if (status === 404) return ['desk.pack.err.gone'];
  if (code === 'lesson_failed') return ['desk.pack.err.unusable'];
  return ['desk.pack.err.unavailable'];
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="mt-6 rounded-sharp border border-dashed border-hairline-strong px-5 py-6 text-15 text-ink-muted print:hidden">{children}</p>;
}

/** The morning's steps down the side, one column per child, each child's supports in the step they belong to. */
function Overview({ kids, steps, packFor }: { kids: PackChild[]; steps: Pack['steps']; packFor: (childId: string) => Pack | 'error' | undefined }) {
  const t = useT();
  const packs = kids.map((k) => packFor(k.id));
  const chipsOf = (i: number, stepKey: string) => {
    const p = packs[i];
    return p && p !== 'error' ? (p.steps.find((s) => s.key === stepKey)?.chips ?? []) : null;
  };
  return (
    <div className="relative mt-6 overflow-x-auto rounded-sharp border border-hairline-strong bg-surface print:hidden">
      <table className="w-full table-fixed border-collapse text-left" style={{ minWidth: `${12 + kids.length * 9.5}rem` }}>
        <caption className="sr-only">{t('desk.pack.overviewCaption')}</caption>
        <colgroup>
          <col className="w-[12rem]" />
          {kids.map((k) => (
            <col key={k.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="px-4 pt-3.5 pb-3 align-bottom text-13 font-normal text-ink-muted">
              {t('desk.pack.colStep')}
            </th>
            {kids.map((k, i) => {
              const p = packs[i];
              const none = p && p !== 'error' && p.steps.every((s) => s.chips.length === 0);
              return (
                <th key={k.id} scope="col" className="border-l border-hairline px-3 pt-3.5 pb-3 align-bottom">
                  <span className="text-15 font-medium text-ink">{k.firstName}</span>
                  {k.lang === 'es' && <span className="ml-1.5 text-13 font-normal text-ink-muted">ES</span>}
                  {none && <span className="block text-13 font-normal text-ink-muted">{t('desk.pack.noChanges')}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {steps.map((s, si) => (
            <tr key={s.key} className="border-b border-hairline last:border-b-0">
              <th scope="row" className="px-4 py-2.5 align-top font-normal">
                <span className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms through our proxy */}
                  <img src={s.pictogramUrl} alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
                  <span className="min-w-0">
                    <span className="block text-15 leading-5 font-medium text-ink">{s.label}</span>
                    <span className="block text-13 text-ink-muted tabular">
                      <span className="sr-only">{t('desk.pack.stepN', { n: si + 1 })} · </span>
                      {t('desk.pack.minutes', { n: s.minutes })}
                    </span>
                  </span>
                </span>
              </th>
              {kids.map((k, i) => {
                const list = chipsOf(i, s.key);
                return (
                  <td key={k.id} className="border-l border-hairline px-2.5 py-2.5 align-top">
                    {list === null ? (
                      packs[i] === undefined ? <span className="block h-4 w-16 rounded-sharp bg-ground" aria-hidden /> : null
                    ) : list.length === 0 ? (
                      <span className="sr-only">{t('desk.pack.nothing')}</span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {list.map((c) => (
                          <li key={c.chip} className="flex items-center gap-2 rounded-sharp bg-accent-tint/60 py-1 pr-2 pl-1 text-13 leading-[17px] text-accent-ink">
                            {/* eslint-disable-next-line @next/next/no-img-element -- pinned ARASAAC pictograms */}
                            <img src={c.pictogramUrl} alt="" width={20} height={20} className="size-5 shrink-0 rounded-[1px] bg-surface object-contain" />
                            <span className="min-w-0">{c.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 14 14" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" aria-hidden>
      <path d="M3.75 5V1.75h6.5V5M3.75 10.25h-2v-5.25h10.5v5.25h-2" />
      <rect x="3.75" y="8.25" width="6.5" height="4" />
    </svg>
  );
}
