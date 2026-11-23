// PLACEHOLDER: proves routing + viewer resolution. Real director desk arrives in a later task.
import { requireViewer } from '@/lib/auth/page-viewer';

export default async function DeskPage({ params }: PageProps<'/c/[slug]/desk'>) {
  const { slug } = await params;
  const { viewer, person } = await requireViewer(slug);
  return <p>Desk (placeholder) — {person.firstName}, {viewer.role}</p>;
}
