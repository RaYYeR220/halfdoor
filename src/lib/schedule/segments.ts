// Lesson-step segments: what kind of stretch of the morning a step is. Patterns group moments by these.
export const SEGMENTS = ['arrive', 'worship', 'story', 'snack', 'craft', 'play', 'prayer', 'pickup', 'transition'] as const;
export type Segment = (typeof SEGMENTS)[number];
