// Director desk: This Sunday. Buddy matches per service: suggest, read the reasons and the gaps, approve.
import { Suspense } from 'react';
import { deskViewer } from '@/lib/desk/page';
import { loadAssignments, loadChildren, loadUpcoming } from '@/lib/desk/server';
import { DeskFallback, NotForYou } from '@/components/desk/DeskFrame';
import { SundayDesk } from '@/components/desk/SundayDesk';

export default function Page({ params }: PageProps<'/c/[slug]/desk/sunday'>) {
  return (
    <Suspense fallback={<DeskFallback />}>
      <Sunday params={params} />
    </Suspense>
  );
}

async function Sunday({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await deskViewer(slug);
  if (!ctx) return <NotForYou />;
  const { church } = ctx;
  const { services, clock } = await loadUpcoming(church, new Date());
  const initial = await loadAssignments(church.id, services.map((s) => s.id));
  const childRows = await loadChildren(church.id);
  return <SundayDesk services={services} clock={clock} initial={initial} childRows={childRows} />;
}
