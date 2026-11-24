// The sandbox guide's seven steps: who each one acts as and which page it opens. Pure, so the target resolution
// is unit-tested without rendering the panel.
import type { DemoFlags } from './flags';
import type { Persona, PersonaKey } from './personas';

export type Who = PersonaKey | 'buddy';
export type PathCtx = { base: string; samId: string | null; buddyId: string | null; serviceId: string | null };
export type StepDef = { flag: keyof DemoFlags; who: Who; path: (c: PathCtx) => string };
export type StepTarget = { value: string; name: string; href: string };

/** The station and the buddy's phone open on Sam's service (the one he is matched at), with Sam picked out. */
const atService = (c: PathCtx, child = false) => {
  const q = [c.serviceId && `service=${c.serviceId}`, child && c.samId && `child=${c.samId}`].filter(Boolean).join('&');
  return q ? `?${q}` : '';
};

export const STEPS: readonly StepDef[] = [
  { flag: 'samCardApproved', who: 'jordan', path: () => '' },
  { flag: 'samCardAcknowledged', who: 'hannah', path: (c) => `${c.base}/desk${c.samId ? `?child=${c.samId}` : ''}` },
  { flag: 'samAssignedApproved', who: 'hannah', path: (c) => `${c.base}/desk/sunday` },
  { flag: 'samCheckedIn', who: 'hannah', path: (c) => `${c.base}/station${atService(c, true)}` },
  { flag: 'samCardOpenedByBuddy', who: 'buddy', path: (c) => `${c.base}/buddy/${c.buddyId}${atService(c, true)}` },
  { flag: 'samCheckedOut', who: 'hannah', path: (c) => `${c.base}/station${atService(c, true)}` },
  { flag: 'samNoteApproved', who: 'hannah', path: (c) => `${c.base}/desk/notes` },
];

/**
 * The person and page a step opens. The `buddy` step is always the buddy themself: a role-bar persona for the same
 * person may stand for another role (Tom is the room leader there, `id:leader`), and the phone opens only for the buddy.
 */
export function stepTarget(
  s: StepDef,
  ctx: PathCtx,
  byKey: ReadonlyMap<PersonaKey, Persona>,
  buddy: { value: string; name: string } | null,
): StepTarget | null {
  if (s.who === 'buddy') return buddy ? { ...buddy, href: s.path(ctx) } : null;
  const p = byKey.get(s.who);
  if (!p) return null;
  return { value: p.value, name: p.name, href: s.who === 'jordan' ? p.href : s.path({ ...ctx, buddyId: null }) };
}

/** The buddy for step 5: the matched person's own id (never a `:leader` value), named from the personas when present. */
export function buddyFor(
  buddyId: string | null,
  personas: readonly Persona[],
  fallbackName: string | null | undefined,
): { value: string; name: string } | null {
  return buddyId ? { value: buddyId, name: personas.find((p) => p.personId === buddyId)?.name ?? fallbackName ?? '' } : null;
}
