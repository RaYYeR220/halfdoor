// The buddy's phone: today's children, each card locked until check-in. The server sends names, card readiness
// and the clock only; card content is fetched through the access gate in the browser, after check-in.
import { Suspense } from 'react';
import { requireViewer } from '@/lib/auth/page-viewer';
import { pickService } from '@/lib/buddy/live';
import { loadBuddyToday } from '@/lib/buddy/server';
import { getT } from '@/lib/i18n/server';
import { BuddyPhone } from '@/components/buddy/BuddyPhone';

export default function Page({ params, searchParams }: PageProps<'/c/[slug]/buddy/[pid]'>) {
  return (
    <Suspense fallback={<BuddyFallback />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);

async function Content({
  params, searchParams,
}: { params: Promise<{ slug: string; pid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug, pid } = await params;
  const { viewer, person, church } = await requireViewer(slug);
  if (viewer.personId !== pid || viewer.role !== 'buddy') {
    const { t } = await getT(person.lang);
    return (
      <div className="mx-auto max-w-[56ch]">
        <h1 className="text-32 font-medium text-ink">{t('buddy.notYours.title')}</h1>
        <p className="mt-3 text-17 text-ink-muted text-pretty">{t('buddy.notYours.body')}</p>
      </div>
    );
  }
  const sp = await searchParams;
  const now = new Date();
  const { services, clock } = await loadBuddyToday(church, viewer.personId, now);
  return (
    <BuddyPhone
      me={{ id: person.id, firstName: person.firstName }}
      services={services}
      clock={clock}
      initialService={pickService(services, now, one(sp.service))?.id ?? null}
      initialChild={one(sp.child)}
    />
  );
}

/** The phone's shape while today's matches load: heading, meta line, one locked card. */
function BuddyFallback() {
  return (
    <div className="mx-auto max-w-[640px]" aria-hidden>
      <div className="h-9 w-[min(20rem,80%)] rounded-sharp bg-ground-edge" />
      <div className="mt-3 h-4 w-[min(16rem,70%)] rounded-sharp bg-ground-edge" />
      <div className="mt-6 h-[22rem] rounded-sharp border border-hairline bg-surface" />
    </div>
  );
}
