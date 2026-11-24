// SERVER-ONLY. The desk's pages are the director's: anyone else in the church gets a short "not yours" panel.
import { requireViewer } from '@/lib/auth/page-viewer';

export async function deskViewer(slug: string) {
  const ctx = await requireViewer(slug);
  return ctx.viewer.role === 'director' ? ctx : null;
}

/** Old ?view= links (the demo guide's first version) to the desk's own pages. */
export const LEGACY_VIEWS: Record<string, string> = {
  sunday: 'sunday', pack: 'pack', notes: 'notes', patterns: 'patterns', ledger: 'ledger',
};
