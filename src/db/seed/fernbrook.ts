// Fixture for the fictional "Fernbrook Community Church" (sample data, nobody real).
// The parent stories live ONLY here, for seeding: createSandbox runs the deterministic verifier on
// them and stores just the verified items (with their quotes). The server never stores a raw story.
import type { DraftCard } from '@/lib/card/schema';

export const FERNBROOK_NAME = 'Fernbrook Community Church';
export const FERNBROOK_TZ = 'America/Chicago';
export const SERVICE_ROOM = 'Kids Room B';

type PersonSeed = {
  key: string;
  role: 'child' | 'buddy' | 'director' | 'parent';
  firstName: string;
  lastInitial?: string;
  lang?: 'en' | 'es';
  gender?: 'f' | 'm';
  grade?: string;
  skills?: string[];
  langs?: string[];
  /** Buddy training: days before sandbox creation, or an absolute date. */
  trainingDaysAgo?: number;
  trainingAt?: string;
  backgroundExpiresAt?: string;
};

const CURRENT_BACKGROUND = '2027-06-30T00:00:00Z';

export const PEOPLE: PersonSeed[] = [
  { key: 'leo', role: 'child', firstName: 'Leo', gender: 'm', grade: '2nd grade' },
  { key: 'ana', role: 'child', firstName: 'Ana', gender: 'f', grade: 'Kindergarten', lang: 'es' },
  { key: 'malik', role: 'child', firstName: 'Malik', gender: 'm', grade: '4th grade' },
  { key: 'theo', role: 'child', firstName: 'Theo', gender: 'm', grade: 'Pre-K' },
  { key: 'ivy', role: 'child', firstName: 'Ivy', gender: 'f', grade: '5th grade' },
  { key: 'sam', role: 'child', firstName: 'Sam', grade: '1st grade' },

  { key: 'priya', role: 'buddy', firstName: 'Priya', gender: 'f', skills: ['aac'], trainingDaysAgo: 40, backgroundExpiresAt: CURRENT_BACKGROUND },
  { key: 'marco', role: 'buddy', firstName: 'Marco', gender: 'm', langs: ['en', 'es'], trainingDaysAgo: 75, backgroundExpiresAt: CURRENT_BACKGROUND },
  { key: 'ruth', role: 'buddy', firstName: 'Ruth', gender: 'f', skills: ['medical'], trainingDaysAgo: 30, backgroundExpiresAt: CURRENT_BACKGROUND },
  { key: 'dana', role: 'buddy', firstName: 'Dana', gender: 'f', skills: ['aac'], trainingAt: '2025-10-02T00:00:00Z', backgroundExpiresAt: CURRENT_BACKGROUND },
  { key: 'ben', role: 'buddy', firstName: 'Ben', gender: 'm', trainingDaysAgo: 60, backgroundExpiresAt: '2026-11-20T00:00:00Z' },
  { key: 'grace', role: 'buddy', firstName: 'Grace', gender: 'f', trainingDaysAgo: 20, backgroundExpiresAt: CURRENT_BACKGROUND },
  { key: 'tom', role: 'buddy', firstName: 'Tom', gender: 'm', trainingDaysAgo: 90, backgroundExpiresAt: CURRENT_BACKGROUND },
  { key: 'leah', role: 'buddy', firstName: 'Leah', gender: 'f', trainingDaysAgo: 50, backgroundExpiresAt: CURRENT_BACKGROUND },
  { key: 'joel', role: 'buddy', firstName: 'Joel', gender: 'm', trainingDaysAgo: 100, backgroundExpiresAt: CURRENT_BACKGROUND },

  { key: 'hannah', role: 'director', firstName: 'Hannah', gender: 'f' },

  { key: 'maria', role: 'parent', firstName: 'Maria', gender: 'f' },
  { key: 'lucia', role: 'parent', firstName: 'Lucía', gender: 'f', lang: 'es' },
  { key: 'jordan', role: 'parent', firstName: 'Jordan' },
];

/** parent key -> child key */
export const HOUSEHOLDS: [string, string][] = [['maria', 'leo'], ['lucia', 'ana'], ['jordan', 'sam']];

export type CardSeed = {
  story: string;
  draft: DraftCard;
  status: 'acknowledged' | 'parent_approved';
  supportLevel: 'all_morning' | 'parts' | 'none';
};

const LEO_STORY =
  'Leo is 7. He loves trains and the color yellow. Loud music hurts his ears so he wears his blue headphones during worship. When he starts humming loudly and covering his face he needs a quiet break. He used to be allergic to eggs but he outgrew it last year. He IS allergic to peanuts - he has an EpiPen in his backpack. His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.';

const ANA_STORY =
  'Ana tiene 5 años. A Ana le encanta cantar. En casa hablamos español. No le gustan los lugares con mucha gente. Cuando se pone nerviosa me agarra la mano y deja de hablar. Solo yo o su abuela pueden recogerla.';

const MALIK_STORY =
  'Malik is 9. He loves drawing maps and he is really good with numbers. He needs a 2-minute warning before every change, like going from the story to snack. When the warning gets skipped he gets very upset and goes quiet and stiff. A small sand timer on the table helps him see the time passing.';

const THEO_STORY =
  'Theo is 4. He loves dinosaurs and he is very proud of his green T. rex. He has type 1 diabetes. Please check his snack with me before he eats anything. His insulin pump is clipped under his shirt, so please keep rough play away from his belly. If he looks shaky or pale, tell me right away.';

const IVY_STORY =
  'Ivy is 10. She is funny and she loves horses. She uses a wheelchair and an AAC tablet to talk. Give her a few extra seconds to answer on her tablet. Please do not finish her sentences. She needs help in the bathroom, so a buddy who is comfortable with that would be great.';

export const CARDS: Record<string, CardSeed> = {
  leo: {
    story: LEO_STORY,
    status: 'acknowledged',
    supportLevel: 'all_morning',
    draft: {
      items: [
        { section: 'loves', text: 'Trains and the color yellow', quotes: ['He loves trains and the color yellow.'] },
        { section: 'hard', text: 'Loud music hurts his ears', quotes: ['Loud music hurts his ears'] },
        { section: 'helps', text: 'Blue headphones during worship', quotes: ['he wears his blue headphones during worship'] },
        { section: 'signs', text: 'Humming loudly and covering his face means he needs a quiet break', quotes: ['When he starts humming loudly and covering his face he needs a quiet break.'] },
        { section: 'safety', text: 'He IS allergic to peanuts - he has an EpiPen in his backpack.', quotes: ['He IS allergic to peanuts - he has an EpiPen in his backpack.'] },
        { section: 'safety', text: 'His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.', quotes: ['His dad is NOT allowed to pick him up, only me (Maria) or his grandma Rosa.'] },
        { section: 'safety', text: 'He used to be allergic to eggs but he outgrew it last year.', quotes: ['He used to be allergic to eggs but he outgrew it last year.'] },
      ],
      tags: [
        { tag: 'noise_sensitive', item: 1 },
        { tag: 'needs_breaks', item: 3 },
        { tag: 'food_allergy', item: 4 },
        { tag: 'pickup_restriction', item: 5 },
      ],
    },
  },
  ana: {
    story: ANA_STORY,
    status: 'acknowledged',
    supportLevel: 'parts',
    draft: {
      items: [
        { section: 'loves', text: 'A Ana le encanta cantar.', quotes: ['A Ana le encanta cantar.'] },
        { section: 'hard', text: 'No le gustan los lugares con mucha gente.', quotes: ['No le gustan los lugares con mucha gente.'] },
        { section: 'signs', text: 'Cuando se pone nerviosa me agarra la mano y deja de hablar.', quotes: ['Cuando se pone nerviosa me agarra la mano y deja de hablar.'] },
        { section: 'safety', text: 'Solo yo o su abuela pueden recogerla.', quotes: ['Solo yo o su abuela pueden recogerla.'] },
      ],
      tags: [
        { tag: 'crowds_hard', item: 1 },
        { tag: 'pickup_restriction', item: 3 },
        { tag: 'spanish_home', item: 0 },
      ],
    },
  },
  malik: {
    story: MALIK_STORY,
    status: 'parent_approved',
    supportLevel: 'parts',
    draft: {
      items: [
        { section: 'loves', text: 'He loves drawing maps and he is really good with numbers.', quotes: ['He loves drawing maps and he is really good with numbers.'] },
        { section: 'needs', text: 'He needs a 2-minute warning before every change, like going from the story to snack.', quotes: ['He needs a 2-minute warning before every change, like going from the story to snack.'] },
        { section: 'signs', text: 'When the warning gets skipped he gets very upset and goes quiet and stiff.', quotes: ['When the warning gets skipped he gets very upset and goes quiet and stiff.'] },
        { section: 'helps', text: 'A small sand timer on the table helps him see the time passing.', quotes: ['A small sand timer on the table helps him see the time passing.'] },
      ],
      tags: [
        { tag: 'transitions_hard', item: 1 },
        { tag: 'needs_visual_schedule', item: 3 },
      ],
    },
  },
  theo: {
    story: THEO_STORY,
    status: 'acknowledged',
    supportLevel: 'none',
    draft: {
      items: [
        { section: 'loves', text: 'He loves dinosaurs and he is very proud of his green T. rex.', quotes: ['He loves dinosaurs and he is very proud of his green T. rex.'] },
        { section: 'safety', text: 'He has type 1 diabetes.', quotes: ['He has type 1 diabetes.'] },
        { section: 'safety', text: 'Please check his snack with me before he eats anything.', quotes: ['Please check his snack with me before he eats anything.'] },
        { section: 'safety', text: 'His insulin pump is clipped under his shirt, so please keep rough play away from his belly.', quotes: ['His insulin pump is clipped under his shirt, so please keep rough play away from his belly.'] },
        { section: 'safety', text: 'If he looks shaky or pale, tell me right away.', quotes: ['If he looks shaky or pale, tell me right away.'] },
      ],
      tags: [
        { tag: 'medical_plan', item: 1 },
      ],
    },
  },
  ivy: {
    story: IVY_STORY,
    status: 'acknowledged',
    supportLevel: 'all_morning',
    draft: {
      items: [
        { section: 'loves', text: 'She is funny and she loves horses.', quotes: ['She is funny and she loves horses.'] },
        { section: 'communicates', text: 'She uses a wheelchair and an AAC tablet to talk.', quotes: ['She uses a wheelchair and an AAC tablet to talk.'] },
        { section: 'helps', text: 'Give her a few extra seconds to answer on her tablet.', quotes: ['Give her a few extra seconds to answer on her tablet.'] },
        { section: 'avoid', text: 'Please do not finish her sentences.', quotes: ['Please do not finish her sentences.'] },
        { section: 'needs', text: 'She needs help in the bathroom, so a buddy who is comfortable with that would be great.', quotes: ['She needs help in the bathroom, so a buddy who is comfortable with that would be great.'] },
      ],
      tags: [
        { tag: 'nonverbal_or_aac', item: 1 },
        { tag: 'mobility_aid', item: 1 },
        { tag: 'bathroom_help', item: 4 },
      ],
    },
  },
};

export const LESSON = {
  title: 'Waiting with hope',
  verseRef: 'Isaiah 9:6',
  // Original text for the demo, not taken from any published curriculum.
  bigIdea: 'Waiting is easier when we know someone good is coming.',
  sourceText:
    'This is the first Sunday of Advent, and our theme is waiting with hope. Waiting is hard for everybody, and it is especially hard for kids who just want it to be Christmas already. Long ago, God\'s people waited a very long time for a promised king. Waiting is easier when we know someone good is coming. Today the kids will hear about that promise, sing about it, and make something to remind them that hope can be patient and glad at the same time.',
  // Verbatim from the Bible SDK (BSB), stored so the demo shows the verse offline.
  verseText:
    ['For unto us a child is born,', 'unto us a son is given,', 'and the government will be upon His shoulders.', 'And He will be called', 'Wonderful Counselor, Mighty God,', 'Everlasting Father, Prince of Peace.'].join(String.fromCharCode(10)),
  steps: [
    { key: 'arrive', label: 'Arrive', labelEs: 'Llegada', segment: 'arrive', sensoryLoad: 'low', minutes: 5 },
    { key: 'worship', label: 'Worship', labelEs: 'Alabanza', segment: 'worship', sensoryLoad: 'high', minutes: 15 },
    { key: 'story', label: 'Bible story', labelEs: 'Historia bíblica', segment: 'story', sensoryLoad: 'med', minutes: 15 },
    { key: 'snack', label: 'Snack', labelEs: 'Merienda', segment: 'snack', sensoryLoad: 'med', minutes: 10 },
    { key: 'craft', label: 'Craft', labelEs: 'Manualidad', segment: 'craft', sensoryLoad: 'low', minutes: 15 },
    { key: 'pickup', label: 'Pickup', labelEs: 'Hora de irse', segment: 'pickup', sensoryLoad: 'med', minutes: 5 },
  ],
};

/** Last weeks' lesson: same shape, so past services resolve their steps (patterns, moments). */
export const PAST_LESSON_TITLE = 'God keeps his promises';
