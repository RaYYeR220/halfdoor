// Director desk: Sunday pack. The lesson in, a picture schedule out, one printable page per expected child.
import { Suspense } from 'react';
import { getLessonInChurch } from '@/db/repo/lessons';
import { deskViewer } from '@/lib/desk/page';
import { SAMPLE_LESSON } from '@/lib/desk/sampleLesson';
import { loadPackChildren, loadUpcoming } from '@/lib/desk/server';
import { DeskFallback, NotForYou } from '@/components/desk/DeskFrame';
import { PackDesk } from '@/components/desk/PackDesk';

export default function Page({ params }: PageProps<'/c/[slug]/desk/pack'>) {
  return (
    <Suspense fallback={<DeskFallback />}>
      <SundayPack params={params} />
    </Suspense>
  );
}

async function SundayPack({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await deskViewer(slug);
  if (!ctx) return <NotForYou />;
  const { church } = ctx;
  const { services, clock, raw } = await loadUpcoming(church, new Date());
  const packChildren = await loadPackChildren(church.id, raw);
  // The demo church starts from a sample lesson with the whole morning in it; a real church from its own last one.
  let initialText = '';
  if (church.mode === 'sandbox') initialText = SAMPLE_LESSON;
  else {
    const linked = services.find((s) => s.lessonId)?.lessonId;
    initialText = linked ? ((await getLessonInChurch(church.id, linked))?.sourceText ?? '') : '';
  }
  return <PackDesk services={services} clock={clock} packChildren={packChildren} initialText={initialText} churchName={church.name} />;
}
