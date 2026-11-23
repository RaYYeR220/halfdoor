import { notFound } from 'next/navigation';
import { getChurchBySlug } from '@/db/repo/churches';
import { getPersonInChurch } from '@/db/repo/people';
import { getViewer } from './viewer';

/** Viewer for a /c/[slug]/... page; 404 if the viewer is not in that church. */
export async function requireViewer(slug: string) {
  const viewer = await getViewer();
  const church = await getChurchBySlug(slug);
  if (!viewer || !church || viewer.churchId !== church.id) notFound();
  const person = await getPersonInChurch(church.id, viewer.personId);
  if (!person) notFound();
  return { viewer, person, church };
}
