// PLACEHOLDER content inside the real shell. The buddy phone view arrives in Task 17d.
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth/page-viewer';
import { Section } from '@/components/ui/Section';

export default function Page({ params }: PageProps<'/c/[slug]/buddy/[pid]'>) {
  return (
    <Suspense>
      <Placeholder params={params} />
    </Suspense>
  );
}

async function Placeholder({ params }: { params: Promise<{ slug: string; pid: string }> }) {
  const { slug, pid } = await params;
  const { viewer, person } = await requireViewer(slug);
  if (viewer.personId !== pid) notFound();
  return (
    <div className="mx-auto max-w-[680px]">
      <Section level={1} title={person.firstName} />
    </div>
  );
}
