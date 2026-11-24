'use client';
// Notes: per service, the children a buddy logged moments for. Open one to read the moments and write the note home.
import { useId, useState } from 'react';
import { cx } from '@/lib/cx';
import type { DeskClock, NoteChild, NotesService } from '@/lib/desk/types';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { timeLabel } from '@/lib/parent/format';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { DeskHead, useDeskTime } from './DeskFrame';
import { NoteComposer } from './NoteComposer';
import { ServiceTabs, panelId, tabId } from './ServiceTabs';

const COUNT_KEYS: [keyof NoteChild['counts'], MessageKey, MessageKey][] = [
  ['good', 'desk.notes.count.goodOne', 'desk.notes.count.goodMany'],
  ['hard', 'desk.notes.count.hardOne', 'desk.notes.count.hardMany'],
  ['break', 'desk.notes.count.breakOne', 'desk.notes.count.breakMany'],
  ['bathroom', 'desk.notes.count.bathroomOne', 'desk.notes.count.bathroomMany'],
  ['note', 'desk.notes.count.noteOne', 'desk.notes.count.noteMany'],
];

export function NotesDesk({ services: initial, clock }: { services: NotesService[]; clock: DeskClock }) {
  const t = useT();
  const uid = useId();
  const ctx = useDeskTime(clock);
  const [services, setServices] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setServices(initial);
  }
  const first = services.find((s) => s.children.length > 0) ?? services[0];
  const [selected, setSelected] = useState(first?.id ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const service = services.find((s) => s.id === selected) ?? first;

  const setNote = (serviceId: string, childId: string, note: NoteChild['note']) =>
    setServices((ss) => ss.map((s) => (s.id !== serviceId ? s : { ...s, children: s.children.map((c) => (c.childId === childId ? { ...c, note } : c)) })));

  return (
    <div>
      <DeskHead title={t('desk.notes.title')} lede={t('desk.notes.lede')} />

      {!service ? (
        <p className="mt-8 rounded-sharp border border-dashed border-hairline-strong px-5 py-6 text-15 text-ink-muted">{t('desk.noServices')}</p>
      ) : (
        <>
          <div className="mt-7">
            <ServiceTabs
              services={services}
              selected={service.id}
              onSelect={(id) => {
                setSelected(id);
                setOpen(null);
              }}
              idBase={uid}
              label={t('desk.sunday.services')}
              meta={(s) => timeLabel(new Date(s.startsAt), new Date(s.endsAt), ctx)}
              aside={(s) => {
                const n = services.find((x) => x.id === s.id)?.children.length ?? 0;
                return <span className="text-13 text-ink-muted tabular">{n === 0 ? t('desk.notes.kidsNone') : n === 1 ? t('desk.notes.kidsOne') : t('desk.notes.kidsMany', { count: n })}</span>;
              }}
            />
          </div>

          <section id={panelId(uid, service.id)} role="tabpanel" aria-labelledby={tabId(uid, service.id)} className="mt-6">
            {service.children.length === 0 ? (
              <div className="rounded-sharp border border-dashed border-hairline-strong px-5 py-6">
                <p className="text-17 font-medium text-ink">{t('desk.notes.emptyTitle', { service: service.label.replace(/\s+service$/i, '') })}</p>
                <p className="mt-1 max-w-[62ch] text-15 text-ink-muted text-pretty">{t('desk.notes.emptyBody')}</p>
              </div>
            ) : (
              <ul className="rounded-sharp border border-hairline-strong bg-surface">
                {service.children.map((c) => {
                  const isOpen = open === c.childId;
                  const counts = COUNT_KEYS.filter(([k]) => c.counts[k] > 0).map(([k, one, many]) => (c.counts[k] === 1 ? t(one) : t(many, { count: c.counts[k] })));
                  return (
                    <li key={c.childId} className="border-b border-hairline last:border-b-0">
                      <h3>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`${uid}-note-${c.childId}`}
                          onClick={() => setOpen(isOpen ? null : c.childId)}
                          className="group grid w-full grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-x-5 gap-y-1 px-5 py-4 text-left outline-offset-[-2px] transition-[background-color] duration-200 ease-out hover:bg-ground/70"
                        >
                          <span className="min-w-0">
                            <span className="block text-17 leading-6 font-medium text-ink">{c.firstName}</span>
                            <span className="block text-13 text-ink-muted">{counts.join(' · ')}</span>
                          </span>
                          <NoteState note={c.note} />
                          <Icon name="chevronDown" className={cx('text-ink-muted transition-transform duration-200 ease-out', isOpen && 'rotate-180')} />
                        </button>
                      </h3>
                      <div id={`${uid}-note-${c.childId}`} hidden={!isOpen}>
                        {isOpen && (
                          <NoteComposer
                            service={service}
                            child={c}
                            clock={clock}
                            onSaved={(note) => setNote(service.id, c.childId, note)}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function NoteState({ note }: { note: NoteChild['note'] }) {
  const t = useT();
  if (!note) return <Pill tone="quiet">{t('desk.note.status.none')}</Pill>;
  if (note.status === 'approved') return <Pill tone="ok" icon={<Icon name="check" size={12} />}>{t('desk.note.status.approved')}</Pill>;
  return <Pill tone="neutral" dot>{t('desk.note.status.draft')}</Pill>;
}
