// The demo church's role bar: who you can be in a sandbox, and where each person lands.
// Plain data (no React, no server APIs) so the server layout and client components can share it.

export type PersonaKey = 'hannah' | 'jordan' | 'maria' | 'lucia' | 'priya' | 'marco' | 'grace' | 'tom';
export type PersonaGroup = 'team' | 'parents' | 'buddies' | 'room';
type Surface = 'desk' | 'parent' | 'buddy' | 'room';

type PersonaSpec = { key: PersonaKey; firstName: string; group: PersonaGroup; surface: Surface; leader?: true };

/** Matched to seeded people by first name. Tom, a trained buddy, plays the room leader. */
export const PERSONA_SPECS: readonly PersonaSpec[] = [
  { key: 'hannah', firstName: 'Hannah', group: 'team', surface: 'desk' },
  { key: 'jordan', firstName: 'Jordan', group: 'parents', surface: 'parent' },
  { key: 'maria', firstName: 'Maria', group: 'parents', surface: 'parent' },
  { key: 'lucia', firstName: 'Lucía', group: 'parents', surface: 'parent' },
  { key: 'priya', firstName: 'Priya', group: 'buddies', surface: 'buddy' },
  { key: 'marco', firstName: 'Marco', group: 'buddies', surface: 'buddy' },
  { key: 'grace', firstName: 'Grace', group: 'buddies', surface: 'buddy' },
  { key: 'tom', firstName: 'Tom', group: 'room', surface: 'room', leader: true },
];

export type Persona = {
  key: PersonaKey;
  group: PersonaGroup;
  personId: string;
  name: string;
  /** What POST /api/sandbox/as takes and the hd_as cookie holds: `id` or `id:leader`. */
  value: string;
  /** The persona's home page in this church. */
  href: string;
};

export function personaHref(slug: string, surface: Surface, personId: string): string {
  const base = `/c/${encodeURIComponent(slug)}`;
  if (surface === 'desk') return `${base}/desk`;
  if (surface === 'room') return `${base}/room`;
  return `${base}/${surface}/${personId}`;
}

/** Personas present in this church, in role-bar order. */
export function buildPersonas(slug: string, people: readonly { id: string; firstName: string; role: string }[]): Persona[] {
  return PERSONA_SPECS.flatMap((spec) => {
    const p = people.find((x) => x.firstName === spec.firstName && x.role !== 'child');
    if (!p) return [];
    return [{
      key: spec.key,
      group: spec.group,
      personId: p.id,
      name: p.firstName,
      value: spec.leader ? `${p.id}:leader` : p.id,
      href: personaHref(slug, spec.surface, p.id),
    }];
  });
}

export const initials = (name: string) => name.trim().slice(0, 1).toUpperCase();
