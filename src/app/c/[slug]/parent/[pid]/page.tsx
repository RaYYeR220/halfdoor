// PLACEHOLDER: proves routing + viewer resolution. Real parent surface arrives in a later task.
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth/page-viewer';

export default async function Page({ params }: PageProps<'/c/[slug]/parent/[pid]'>) {
  const { slug, pid } = await params;
  const { viewer, person } = await requireViewer(slug);
  if (viewer.personId !== pid) notFound();
  return <p>Parent (placeholder) — {person.firstName}, {viewer.role}</p>;
}
