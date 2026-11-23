// PLACEHOLDER content inside the real shell. The director desk arrives in Task 17b.
import { Suspense } from 'react';
import { requireViewer } from '@/lib/auth/page-viewer';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';

const VIEWS = ['Children', 'This Sunday', 'Sunday pack', 'Notes', 'Patterns', 'AI ledger'];

// Request-time reads sit behind the page's own Suspense, so client navigations between pages stay instant.
export default function DeskPage({ params }: PageProps<'/c/[slug]/desk'>) {
  return (
    <Suspense>
      <Desk params={params} />
    </Suspense>
  );
}

async function Desk({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { church } = await requireViewer(slug);
  return (
    <div className="mx-auto max-w-[1040px]">
      <Section level={1} title="Kids' desk" description={`${church.name} · the kids' team's view of this Sunday.`}>
        <Card title={<b>Desk views</b>}>
          <ul className="flex flex-wrap gap-2">
            {VIEWS.map((v) => (
              <li key={v} className="rounded-pill border border-hairline-strong px-3 py-1 text-15 text-ink-2">
                {v}
              </li>
            ))}
          </ul>
        </Card>
      </Section>
    </div>
  );
}
