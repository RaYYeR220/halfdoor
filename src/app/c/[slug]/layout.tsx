import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getChurchBySlug } from '@/db/repo/churches';
import { listPeople } from '@/db/repo/people';
import { COOKIE_AS, COOKIE_SANDBOX } from '@/lib/auth/viewer';
import { verifyValue } from '@/lib/auth/tokens';
import { RoleBar, type Persona } from './RoleBar';

// [first name, label, isRoomLeaderPersona]. The room leader is played by a buddy (Tom).
const ORDER: [string, string, boolean?][] = [
  ['Hannah', "Hannah — kids' director"],
  ['Maria', "Maria — Leo's mom"],
  ['Lucía', "Lucía — Ana's mom"],
  ['Jordan', "Jordan — Sam's dad"],
  ['Priya', 'Priya — buddy'],
  ['Marco', 'Marco — buddy'],
  ['Tom', 'Room leader', true],
];

// Everything here reads params/cookies/DB at request time, so it streams inside one Suspense boundary.
export default function ChurchLayout({ children, params }: LayoutProps<'/c/[slug]'>) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
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
  const showBar = sandbox && !!sbx && verifyValue(sbx) === church.id;

  let personas: Persona[] = [];
  if (showBar) {
    const people = await listPeople(church.id);
    personas = ORDER.flatMap(([name, label, leader]) => {
      const p = people.find((x) => x.firstName === name);
      return p ? [{ label, value: leader ? `${p.id}:leader` : p.id }] : [];
    });
  }
  return (
    <>
      {sandbox && <header>{church.name} — fictional church, sample data</header>}
      {showBar && <RoleBar personas={personas} current={jar.get(COOKIE_AS)?.value ?? null} />}
      <main>{children}</main>
    </>
  );
}
