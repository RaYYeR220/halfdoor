// The handful of line icons the app uses: 1.4px strokes on a 14px grid, currentColor, decorative by default.
import type { SVGProps } from 'react';

const PATHS = {
  arrowRight: <path d="M2 7h10M8 3l4 4-4 4" />,
  check: <path d="M2.75 7.25l2.75 2.75 5.75-6.25" />,
  chevronDown: <path d="M3.5 5.25L7 8.75l3.5-3.5" />,
  chevronUp: <path d="M3.5 8.75L7 5.25l3.5 3.5" />,
  chevronRight: <path d="M5.25 3.5L8.75 7l-3.5 3.5" />,
  close: <path d="M3.75 3.75l6.5 6.5M10.25 3.75l-6.5 6.5" />,
  lock: (
    <>
      <rect x="2.9" y="6.3" width="8.2" height="5.7" rx="1" />
      <path d="M4.8 6.3V4.6a2.2 2.2 0 0 1 4.4 0v1.7" />
    </>
  ),
  reset: <path d="M2.75 7a4.25 4.25 0 1 0 1.25-3M2.75 1.75V4.5H5.5" />,
  alert: (
    <>
      <path d="M7 1.9l5.6 9.8H1.4z" />
      <path d="M7 5.6v2.6M7 9.6v.1" />
    </>
  ),
  panelRight: (
    <>
      <rect x="1.75" y="2.25" width="10.5" height="9.5" rx="1" />
      <path d="M8.75 2.25v9.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & { name: IconName; size?: number; label?: string };

export function Icon({ name, size = 14, label, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      className="shrink-0"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
