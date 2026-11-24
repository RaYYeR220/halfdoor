'use client';
// Lines the enclave proposed that did not survive the check against the parent's words, with the reason in
// plain words. They are not on the card.
import type { DroppedItem } from '@/lib/card/schema';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { Pill } from '@/components/ui/Pill';
import { SECTION_LABEL } from './CardLines';

const REASON: Record<DroppedItem['reason'], MessageKey> = {
  quote_not_found: 'parent.leftOut.quote_not_found',
  unsaid_label: 'parent.leftOut.unsaid_label',
  invalid_shape: 'parent.leftOut.invalid_shape',
};

export function LeftOutList({ dropped, lang, headingId }: { dropped: readonly DroppedItem[]; lang?: string; headingId: string }) {
  const t = useT();
  if (dropped.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="rounded-sharp border border-hairline-strong bg-surface-2 px-4 py-4 sm:px-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-17 font-medium text-ink">
          {t('parent.leftOut.title')}
        </h2>
        <Pill tone="quiet" size="sm">
          {dropped.length}
        </Pill>
      </div>
      <p className="mt-1 text-15 text-ink-muted text-pretty">{t('parent.leftOut.lede')}</p>
      <ul className="mt-3 flex flex-col">
        {dropped.map((d, i) => (
          <li key={i} className="border-t border-hairline py-3 first:border-t-0">
            {d.section && <p className="text-13 font-medium text-ink-muted">{t(SECTION_LABEL[d.section])}</p>}
            {d.text && (
              <p lang={lang} className="mt-0.5 text-15 text-ink-muted line-through decoration-hairline-emphasis text-pretty">
                {d.text}
              </p>
            )}
            <p className="mt-1 text-15 text-ink-2">{t(REASON[d.reason])}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
