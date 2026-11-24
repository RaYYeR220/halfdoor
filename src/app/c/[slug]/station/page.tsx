// The demo church's simulated check-in station (Planning Center Check-Ins does this in a real church). Sandbox
// churches only; any persona may play the front desk. English, like the director's desk.
import { Suspense } from 'react';
import { requireViewer } from '@/lib/auth/page-viewer';
import { pickService } from '@/lib/buddy/live';
import { loadStation } from '@/lib/buddy/server';
import { t } from '@/lib/i18n';
import { StationDesk } from '@/components/station/StationDesk';

export default function Page({ params, searchParams }: PageProps<'/c/[slug]/station'>) {
  return (
    <Suspense fallback={<StationFallback />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);

async function Content({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const { church } = await requireViewer(slug);
  // Same test as POST /api/station's `viewer.sandbox`: resolveViewer sets it to `church.mode === 'sandbox'`.
  if (church.mode !== 'sandbox') {
    return (
      <div className="mx-auto max-w-[56ch]">
        <h1 className="text-32 font-medium text-ink">{t('en', 'station.realTitle')}</h1>
        <p className="mt-3 text-17 text-ink-muted text-pretty">{t('en', 'station.realBody')}</p>
      </div>
    );
  }
  const sp = await searchParams;
  const now = new Date();
  const data = await loadStation(church, now);
  return (
    <StationDesk
      services={data.services}
      roster={data.children}
      clock={data.clock}
      rows={data.rows}
      initialService={pickService(data.services, now, one(sp.service))?.id ?? null}
      highlight={one(sp.child)}
    />
  );
}

function StationFallback() {
  return (
    <div className="mx-auto max-w-[960px]" aria-hidden>
      <div className="h-4 w-24 rounded-sharp bg-ground-edge" />
      <div className="mt-3 h-9 w-[min(24rem,80%)] rounded-sharp bg-ground-edge" />
      <div className="mt-4 h-5 w-[min(36rem,92%)] rounded-sharp bg-ground-edge" />
      <div className="mt-9 h-80 rounded-sharp border border-hairline bg-surface" />
    </div>
  );
}
