// A card's safety lines, always first and always in the parent's exact words: red ink on pale red (AA). A line
// may carry a translation under it; the original stays the line.
import { cx } from '@/lib/cx';
import { Icon } from '@/components/ui/Icon';

export type SafetyLine = { id: string; text: string; lang?: string; translation?: { text: string; lang: string } | null };

type Props = {
  lines: readonly SafetyLine[];
  title: string;
  /** "The parent's exact words". */
  note: string;
  headingId: string;
  /** 'lg' on the buddy's phone (17px lines), 'md' in the room grid. */
  size?: 'md' | 'lg';
  className?: string;
};

export function SafetyBanner({ lines, title, note, headingId, size = 'lg', className }: Props) {
  return (
    <section aria-labelledby={headingId} className={cx('rounded-sharp border border-danger-line bg-danger-bg px-4 pt-3 pb-3.5 text-danger-ink', className)}>
      <h3 id={headingId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-15 font-semibold">
        <Icon name="alert" size={14} className="-mt-px shrink-0" />
        <span>{title}</span>
        <span className="text-13 font-normal">· {note}</span>
      </h3>
      <ul className="mt-2 flex flex-col">
        {lines.map((l) => (
          <li key={l.id} className="border-t border-danger-line py-2 first:border-t-0 first:pt-0.5 last:pb-0">
            <p lang={l.lang} className={cx('text-pretty', size === 'lg' ? 'text-17 leading-[1.5]' : 'text-15 leading-[1.45]')}>
              {l.text}
            </p>
            {l.translation && (
              <p lang={l.translation.lang} className="mt-0.5 text-15 leading-[1.45] text-danger-ink/85 text-pretty">
                {l.translation.text}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
