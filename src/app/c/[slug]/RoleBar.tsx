'use client';
// Minimal persona switcher (unstyled; real UI comes later).
import { useRouter } from 'next/navigation';

export type Persona = { label: string; value: string };

export function RoleBar({ personas, current }: { personas: Persona[]; current: string | null }) {
  const router = useRouter();
  async function pick(value: string) {
    const r = await fetch('/api/sandbox/as', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId: value }),
    });
    if (r.ok) router.refresh();
  }
  return (
    <nav aria-label="Switch persona">
      {personas.map((p) => (
        <button key={p.value} type="button" aria-pressed={p.value === current} onClick={() => pick(p.value)}>
          {p.label}
        </button>
      ))}
    </nav>
  );
}
