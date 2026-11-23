import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getChurchBySlug } from '@/db/repo/churches';
import { getPersonInChurch, listPeople } from '@/db/repo/people';
import { COOKIE_AS, COOKIE_SANDBOX, getViewer } from '@/lib/auth/viewer';
import { verifyValue } from '@/lib/auth/tokens';
import { buildPersonas } from '@/lib/demo/personas';
import { LANG_COOKIE, resolveLang } from '@/lib/i18n';
import { AppShell, AppShellFallback, type ShellGuide } from '@/components/shell/AppShell';
import type { ViewerBadge } from '@/components/shell/RoleBar';

// Everything here reads params/cookies/DB at request time, so it streams inside one Suspense boundary.
export default function ChurchLayout({ children, params }: LayoutProps<'/c/[slug]'>) {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <ChurchShell params={params}>{children}</ChurchShell>
    </Suspense>
  );
}

async function ChurchShell({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const church = await getChurchBySlug(slug);
  if (!church) notFound();
  const sandbox = church.mode === 'sandbox';
  const jar = await cookies();
  const sbx = jar.get(COOKIE_SANDBOX)?.value;
  // The role bar and the guide belong to the browser that made this sandbox, nobody else.
  const ownsSandbox = sandbox && !!sbx && verifyValue(sbx) === church.id;

  const viewer = await getViewer();
  const people = ownsSandbox ? await listPeople(church.id) : [];
  const mine = viewer && viewer.churchId === church.id ? viewer : null;
  const me = mine ? (people.find((p) => p.id === mine.personId) ?? (await getPersonInChurch(church.id, mine.personId))) : undefined;
  const badge: ViewerBadge | null = me && mine ? { name: me.firstName, roleKey: `role.kind.${mine.role}` } : null;

  const personas = ownsSandbox ? buildPersonas(slug, people) : [];
  const sam = people.find((p) => p.role === 'child' && p.firstName === 'Sam');
  // The guide reads its step flags from /api/demo/state on mount and then polls; the layout doesn't repeat that.
  const guide: ShellGuide | null = ownsSandbox ? { slug, samId: sam?.id ?? null } : null;

  return (
    <AppShell
      churchName={church.name}
      sandbox={sandbox}
      lang={resolveLang(jar.get(LANG_COOKIE)?.value, me?.lang)}
      personas={personas}
      current={jar.get(COOKIE_AS)?.value ?? null}
      viewer={badge}
      guide={guide}
    >
      {children}
    </AppShell>
  );
}
