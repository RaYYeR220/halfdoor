import type { Tag } from '@/lib/card/schema';
import type { Step } from './segments';

export type Chip =
  | 'headphones' | 'break_card' | 'two_minute_warning' | 'quiet_seat'
  | 'aac_board' | 'snack_check' | 'accessible_spot' | 'stay_close';

export type Adaptation = { stepKey: string; chip: Chip; label: { en: string; es: string } };

export const CHIP_LABEL: Record<Chip, { en: string; es: string }> = {
  headphones: { en: 'Offer headphones', es: 'Ofrece audífonos' },
  break_card: { en: 'Break card ready', es: 'Tarjeta de descanso lista' },
  two_minute_warning: { en: '2-minute warning', es: 'Aviso de 2 minutos' },
  quiet_seat: { en: 'Quiet seat', es: 'Lugar tranquilo' },
  aac_board: { en: 'Talking board with them', es: 'Tablero de comunicación a mano' },
  snack_check: { en: 'Check the snack', es: 'Revisa la merienda' },
  accessible_spot: { en: 'Accessible spot', es: 'Lugar accesible' },
  stay_close: { en: 'Stay close', es: 'Quédate cerca' },
};

/** Rule table, not AI: which supports from the card's tags go on which steps. */
export function adaptationsFor(tags: readonly Tag[], steps: readonly Step[]): Adaptation[] {
  const has = (t: Tag) => tags.includes(t);
  const out: Adaptation[] = [];
  const add = (s: Step, chip: Chip) => out.push({ stepKey: s.key, chip, label: CHIP_LABEL[chip] });
  steps.forEach((s, i) => {
    if (has('noise_sensitive') && s.sensoryLoad === 'high') add(s, 'headphones');
    if (has('crowds_hard') && s.segment === 'worship') add(s, 'quiet_seat');
    if (has('transitions_hard') && i > 0) add(s, 'two_minute_warning');
    if (has('needs_breaks') && (s.sensoryLoad === 'med' || s.sensoryLoad === 'high')) add(s, 'break_card');
    if (has('nonverbal_or_aac')) add(s, 'aac_board');
    if (has('food_allergy') && s.segment === 'snack') add(s, 'snack_check');
    if (has('mobility_aid') && (s.segment === 'craft' || s.segment === 'play')) add(s, 'accessible_spot');
    if (has('elopement_risk') && (s.segment === 'transition' || s.segment === 'pickup')) add(s, 'stay_close');
  });
  return out;
}
