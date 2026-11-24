// Director desk: Patterns. Plain counts over each child's finished Sundays, with the moments behind them.
import { Suspense } from 'react';
import { listCards } from '@/db/repo/cards';
import { listPeople } from '@/db/repo/people';
import { deskViewer } from '@/lib/desk/page';
import { loadPatternsBoard } from '@/lib/desk/patterns';
import { loadClock } from '@/lib/desk/server';
import { DeskFallback, NotForYou } from '@/components/desk/DeskFrame';
import { PatternsDesk } from '@/components/desk/PatternsDesk';

export default function Page({ params }: PageProps<'/c/[slug]/desk/patterns'>) {
  return (
    <Suspense fallback={<DeskFallback />}>
      <Patterns params={params} />
    </Suspense>
  );
}

async function Patterns({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await deskViewer(slug);
  if (!ctx) return <NotForYou />;
  const { church } = ctx;
  const now = new Date();
  const boards = await loadPatternsBoard(church, now);
  const carded = new Set((await listCards(church.id)).map((c) => c.childId));
  const shown = new Set(boards.map((b) => b.childId));
  const without = (await listPeople(church.id))
    .filter((p) => p.role === 'child' && carded.has(p.id) && !shown.has(p.id))
    .map((p) => p.firstName)
    .sort();
  return <PatternsDesk boards={boards} without={without} clock={await loadClock(church, now)} />;
}
