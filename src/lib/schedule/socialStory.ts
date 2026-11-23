import type { Adaptation, Chip } from './adapt';
import type { Segment, Step } from './segments';

type Lang = 'en' | 'es';

// Fixed sentence tables. The social story is assembled from these and nothing else: no model prose, no names.
const SEGMENT_SENTENCE: Record<Segment, { en: string; es: string }> = {
  arrive: { en: 'we walk into church', es: 'entramos a la iglesia' },
  worship: { en: 'we sing songs together', es: 'cantamos juntos' },
  story: { en: 'we hear a Bible story', es: 'escuchamos una historia de la Biblia' },
  snack: { en: 'we have a snack', es: 'comemos una merienda' },
  craft: { en: 'we make something with our hands', es: 'hacemos algo con las manos' },
  play: { en: 'we play together', es: 'jugamos juntos' },
  prayer: { en: 'we pray', es: 'oramos' },
  pickup: { en: 'we get ready to go home', es: 'nos preparamos para ir a casa' },
  transition: { en: 'we move to the next place', es: 'pasamos al siguiente lugar' },
};
const LEAD = { first: { en: 'First,', es: 'Primero,' }, then: { en: 'Then,', es: 'Luego,' } } as const;

const CHIP_SENTENCE: Record<Chip, { en: string; es: string }> = {
  headphones: { en: 'It can be loud. I can wear my headphones.', es: 'Puede haber mucho ruido. Puedo ponerme mis audífonos.' },
  break_card: { en: 'If I need a break, I can show my break card.', es: 'Si necesito un descanso, puedo mostrar mi tarjeta de descanso.' },
  two_minute_warning: { en: 'My buddy tells me two minutes before it changes.', es: 'Mi compañero me avisa dos minutos antes de que cambie.' },
  quiet_seat: { en: 'I can sit in a quiet seat.', es: 'Puedo sentarme en un lugar tranquilo.' },
  aac_board: { en: 'I can use my talking board to say what I need.', es: 'Puedo usar mi tablero para decir lo que necesito.' },
  snack_check: { en: 'My buddy checks that my snack is safe for me.', es: 'Mi compañero revisa que mi merienda sea segura para mí.' },
  accessible_spot: { en: 'There is a spot where I can move easily.', es: 'Hay un lugar donde puedo moverme con facilidad.' },
  stay_close: { en: 'I stay close to my buddy.', es: 'Me quedo cerca de mi compañero.' },
};
const CLOSING = { en: 'Then my grown-up picks me up.', es: 'Luego mi adulto viene a recogerme.' };

/** Every sentence this module can emit, for tests. */
export const SOCIAL_STORY_TABLE = { segments: SEGMENT_SENTENCE, leads: LEAD, chips: CHIP_SENTENCE, closing: CLOSING } as const;

/** One sentence per step, each chip's sentence once (after the first step it applies to), then the closing line. */
export function socialStory(steps: readonly Step[], chips: readonly Adaptation[], lang: Lang): string[] {
  const out: string[] = [];
  const said = new Set<Chip>();
  steps.forEach((s, i) => {
    out.push(`${(i === 0 ? LEAD.first : LEAD.then)[lang]} ${SEGMENT_SENTENCE[s.segment][lang]}.`);
    for (const c of chips) {
      if (c.stepKey !== s.key || said.has(c.chip)) continue;
      said.add(c.chip);
      out.push(CHIP_SENTENCE[c.chip][lang]);
    }
  });
  out.push(CLOSING[lang]);
  return out;
}
