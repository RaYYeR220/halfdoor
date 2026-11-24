// Director desk: AI ledger. Every AI call this church made, with the enclave check behind each encrypted one.
import { Suspense } from 'react';
import { deskViewer } from '@/lib/desk/page';
import { loadClock, loadLedger } from '@/lib/desk/server';
import { DeskFallback, NotForYou } from '@/components/desk/DeskFrame';
import { LedgerDesk } from '@/components/desk/LedgerDesk';

export default function Page({ params }: PageProps<'/c/[slug]/desk/ledger'>) {
  return (
    <Suspense fallback={<DeskFallback />}>
      <AiLedger params={params} />
    </Suspense>
  );
}

async function AiLedger({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await deskViewer(slug);
  if (!ctx) return <NotForYou />;
  const { church } = ctx;
  const ledger = await loadLedger(church);
  return <LedgerDesk ledger={ledger} clock={await loadClock(church, new Date())} />;
}
