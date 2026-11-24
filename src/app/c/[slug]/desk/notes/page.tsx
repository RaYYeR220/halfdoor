// Director desk: Notes. Today's moments per child, and the note home drafted in an enclave from this browser.
import { Suspense } from 'react';
import { deskViewer } from '@/lib/desk/page';
import { loadNotesBoard, loadUpcoming } from '@/lib/desk/server';
import { DeskFallback, NotForYou } from '@/components/desk/DeskFrame';
import { NotesDesk } from '@/components/desk/NotesDesk';

export default function Page({ params }: PageProps<'/c/[slug]/desk/notes'>) {
  return (
    <Suspense fallback={<DeskFallback />}>
      <Notes params={params} />
    </Suspense>
  );
}

async function Notes({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await deskViewer(slug);
  if (!ctx) return <NotForYou />;
  const { church } = ctx;
  const { services, clock } = await loadUpcoming(church, new Date());
  return <NotesDesk services={await loadNotesBoard(church.id, services)} clock={clock} />;
}
