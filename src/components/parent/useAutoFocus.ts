'use client';
import { useCallback, useRef } from 'react';

/**
 * A ref callback that focuses its element once per `token` (0 = never). The page bumps the token when the parent
 * moves to a new state, so the new state's heading (tabIndex -1) takes focus and screen readers start there.
 */
export function useAutoFocus<T extends HTMLElement>(token: number) {
  const last = useRef(0);
  return useCallback(
    (el: T | null) => {
      if (!el || token === 0 || last.current === token) return;
      last.current = token;
      el.focus();
    },
    [token],
  );
}
