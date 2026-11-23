import type { Chip } from './adapt';
import { SEGMENT_PICTOGRAM } from './segments';

/**
 * Pictograms for support chips, pinned (id: ARASAAC keyword). Each was checked to return a 200 PNG.
 * Pictograms: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC BY-NC-SA. Owner: Government of Aragón (Spain).
 */
export const CHIP_PICTOGRAM: Record<Chip, number> = {
  headphones: 5915, // headphones / earphones
  break_card: 3299, // rest / have a rest
  two_minute_warning: 7230, // clock / analog clock
  quiet_seat: 3155, // chair
  aac_board: 6222, // communication board
  snack_check: 5372, // allergy
  accessible_spot: 6212, // wheelchair
  stay_close: 13024, // hand in hand / take hand
};

/** The only ids the proxy will fetch. */
export const PINNED_PICTOGRAMS: ReadonlySet<number> = new Set([...Object.values(SEGMENT_PICTOGRAM), ...Object.values(CHIP_PICTOGRAM)]);

export const isPinnedPictogram = (id: number): boolean => PINNED_PICTOGRAMS.has(id);
export const pictogramUrl = (id: number): string => `/api/pictogram/${id}`;
export const upstreamPictogramUrl = (id: number): string => `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;
