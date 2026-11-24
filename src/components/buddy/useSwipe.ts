'use client';
// Horizontal swipe on an element (pointer events, so touch, pen and mouse drag all work). Vertical scrolling stays
// the browser's: the element should carry `touch-action: pan-y`.
import { useRef, type PointerEvent } from 'react';

const MIN_DX = 40;

export function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) onNext();
      else onPrev();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
