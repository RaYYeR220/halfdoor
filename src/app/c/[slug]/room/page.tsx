// The room view: the children checked in at a service, with their pickup codes and safety lines only. For the room
// leader (and the kids' director). Names and the clock come from the server; safety lines through the access gate.
import { Suspense } from 'react';
import { requireViewer } from '@/lib/auth/page-viewer';
import { pickService } from '@/lib/buddy/live';
import { loadRoomBase } from '@/lib/buddy/server';
import { getT } from '@/lib/i18n/server';
import { RoomView } from '@/components/room/RoomView';

export default function Page({ params, searchParams }: PageProps<'/c/[slug]/room'>) {
  return (
    <Suspense fallback={<RoomFallback />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const { viewer, person, church } = await requireViewer(slug);
  if (viewer.role !== 'leader' && viewer.role !== 'director') {
    const { t } = await getT(person.lang);
    return (
      <div className="mx-auto max-w-[56ch]">
        <h1 className="text-32 font-medium text-ink">{t('room.notYours.title')}</h1>
        <p className="mt-3 text-17 text-ink-muted text-pretty">{t('room.notYours.body')}</p>
      </div>
    );
  }
  const wanted = (await searchParams).service;
  const now = new Date();
  const { services, children, clock } = await loadRoomBase(church, now);
  return (
    <RoomView
      services={services}
      roster={children}
      clock={clock}
      initialService={pickService(services, now, typeof wanted === 'string' ? wanted : null)?.id ?? null}
      viewerId={viewer.personId}
    />
  );
}

function RoomFallback() {
  return (
    <div className="mx-auto max-w-[1080px]" aria-hidden>
      <div className="h-9 w-[min(18rem,70%)] rounded-sharp bg-ground-edge" />
      <div className="mt-4 h-5 w-[min(34rem,92%)] rounded-sharp bg-ground-edge" />
      <div className="mt-8 flex gap-2">
        <div className="h-[60px] w-56 rounded-sharp border border-hairline bg-surface" />
        <div className="h-[60px] w-56 rounded-sharp border border-hairline" />
      </div>
    </div>
  );
}
