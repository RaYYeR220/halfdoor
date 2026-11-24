// The parent page: write about your child, check the card against your words, approve it, see who opened it.
// Request-time reads (viewer, the child's card, access log, notes) stream inside this page's own Suspense.
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { listChildrenOf } from '@/db/repo/people';
import { requireViewer } from '@/lib/auth/page-viewer';
import { getT } from '@/lib/i18n/server';
import { loadChildPage } from '@/lib/parent/server';
import { ParentPage } from '@/components/parent/ParentPage';

export default function Page({ params, searchParams }: PageProps<'/c/[slug]/parent/[pid]'>) {
  return (
    <Suspense fallback={<ParentFallback />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({
  params, searchParams,
}: { params: Promise<{ slug: string; pid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug, pid } = await params;
  const { viewer, person, church } = await requireViewer(slug);
  if (viewer.personId !== pid || viewer.role !== 'parent') notFound();

  const family = await listChildrenOf(church.id, viewer.personId);
  if (family.length === 0) {
    const { t } = await getT(person.lang);
    return (
      <div className="mx-auto max-w-[680px]">
        <h1 className="text-32 font-medium text-ink">{t('parent.none.title')}</h1>
        <p className="mt-3 text-17 text-ink-muted text-pretty">{t('parent.none.body')}</p>
      </div>
    );
  }
  const wanted = (await searchParams).child;
  const child = family.find((c) => c.id === wanted) ?? family[0];
  const data = await loadChildPage(church, child, viewer.personId, new Date());

  return (
    <ParentPage
      key={child.id}
      data={data}
      family={family.map((c) => ({ id: c.id, firstName: c.firstName, gender: c.gender ?? null }))}
      base={`/c/${encodeURIComponent(slug)}/parent/${pid}`}
    />
  );
}

/** Quiet placeholder in the page's shape while the card and log load. */
function ParentFallback() {
  return (
    <div className="mx-auto max-w-[1120px]" aria-hidden>
      <div className="h-9 w-[min(22rem,80%)] rounded-sharp bg-ground-edge" />
      <div className="mt-4 h-5 w-[min(34rem,95%)] rounded-sharp bg-ground-edge" />
      <div className="mt-10 h-64 max-w-[720px] rounded-sharp border border-hairline bg-surface" />
    </div>
  );
}
