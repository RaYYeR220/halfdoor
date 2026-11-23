// Lesson-step segments: what kind of stretch of the morning a step is. Patterns group moments by these.
export const SEGMENTS = ['arrive', 'worship', 'story', 'snack', 'craft', 'play', 'prayer', 'pickup', 'transition'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SENSORY_LOADS = ['low', 'med', 'high'] as const;
export type SensoryLoad = (typeof SENSORY_LOADS)[number];

/** A step of a lesson as stored and shown: explicit segment and sensory load. */
export type Step = { key: string; label: string; segment: Segment; sensoryLoad: SensoryLoad; minutes: number };

/**
 * Curated ARASAAC pictogram per segment, pinned (id: ARASAAC keyword). Each was checked to return a 200 PNG.
 * Pictograms: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC BY-NC-SA. Owner: Government of Aragón (Spain).
 */
export const SEGMENT_PICTOGRAM: Record<Segment, number> = {
  arrive: 6491, // enter / come in
  worship: 6960, // sing
  story: 26539, // Bible
  snack: 28206, // mid-morning snack
  craft: 7794, // handicrafts / arts and crafts
  play: 23392, // play
  prayer: 24368, // pray
  pickup: 6028, // goodbye / see you later
  transition: 37360, // change / exchange
};
