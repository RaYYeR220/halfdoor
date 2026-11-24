import type { MessageKey, Translate } from '@/lib/i18n';

type Plural = 'parent.review.lines' | 'parent.review.left' | 'parent.review.questions' | 'parent.draft.kept';

/** "1 line" / "3 lines": each counted phrase has a `.one` and an `.other` key (English and Spanish agree on that split). */
export const plural = (t: Translate, base: Plural, count: number) => t(`${base}.${count === 1 ? 'one' : 'other'}` as MessageKey, { count });
