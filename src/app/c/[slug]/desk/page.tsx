// Director desk: Children. Every child and where their card is; a row opens the card drawer (?child=<id>).
// Request-time reads sit behind the page's own Suspense, so client navigations between desk views stay instant.
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { sortChildren } from '@/lib/desk/helpers';
import { LEGACY_VIEWS, deskViewer } from '@/lib/desk/page';
import { loadChildren, loadClock } from '@/lib/desk/server';
import { ChildrenDesk } from '@/components/desk/ChildrenDesk';
import { DeskFallback, NotForYou } from '@/components/desk/DeskFrame';

export default function DeskPage({ params, searchParams }: PageProps<'/c/[slug]/desk'>) {
  return (
    <Suspense fallback={<DeskFallback />}>
      <Children params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Children({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const view = sp.view;
  // The first demo guide linked ?view=sunday etc.; those views are pages of their own now.
  if (typeof view === 'string' && LEGACY_VIEWS[view]) redirect(`/c/${encodeURIComponent(slug)}/desk/${LEGACY_VIEWS[view]}`);
  const ctx = await deskViewer(slug);
  if (!ctx) return <NotForYou />;
  const { church } = ctx;
  const rows = sortChildren(await loadChildren(church.id));
  const child = typeof sp.child === 'string' && rows.some((r) => r.id === sp.child) ? sp.child : null;
  return <ChildrenDesk rows={rows} clock={await loadClock(church, new Date())} initialChild={child} />;
}
