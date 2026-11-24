// The landing's three marks, drawn as in the approved prototype.

/** The half-open door: the brand mark. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M.625 8V.625h14.75V8" stroke="currentColor" strokeWidth="1.25" />
      <rect x=".625" y="8" width="14.75" height="7.375" fill="currentColor" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function ArrowRight() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function LockMark() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2.4" y="5.4" width="7.2" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4.1 5.4V4a1.9 1.9 0 0 1 3.8 0v1.4" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function PauseMark() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="2" width="2.4" height="8" rx=".6" />
      <rect x="7.1" y="2" width="2.4" height="8" rx=".6" />
    </svg>
  );
}

export function PlayMark() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M3.2 1.8v8.4L10 6z" />
    </svg>
  );
}
