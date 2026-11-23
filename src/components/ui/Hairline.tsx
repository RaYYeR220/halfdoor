import { cx } from '@/lib/cx';

type Props = { strength?: 'default' | 'strong'; vertical?: boolean; className?: string };

/** A 1px rule. Horizontal is an <hr>; vertical is a decorative divider between inline groups. */
export function Hairline({ strength = 'default', vertical, className }: Props) {
  const color = strength === 'strong' ? 'bg-hairline-strong' : 'bg-hairline';
  if (vertical) return <span aria-hidden className={cx('inline-block h-5 w-px shrink-0 self-center', color, className)} />;
  return <hr className={cx('h-px w-full border-0', color, className)} />;
}
