'use client';

import { useEffect } from 'react';

/**
 * Below the fold: one quiet rise per section (.rv). Content is visible by default; it is hidden only while an
 * IntersectionObserver is live, and the reveal-failsafe drops the hidden state if the observer never reports or the
 * page is printed. Anything already on screen when this runs is shown at once, so nothing blinks.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...document.querySelectorAll<HTMLElement>('.lp .rv')];
    for (const el of els) if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in');
    root.classList.add('lp-io');
    let fired = false;
    const io = new IntersectionObserver(
      (es) => {
        fired = true;
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
    );
    els.forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });
    const failsafe = setTimeout(() => { if (!fired) root.classList.remove('lp-io'); }, 2000);
    const onPrint = () => root.classList.remove('lp-io');
    addEventListener('beforeprint', onPrint);
    return () => {
      io.disconnect();
      clearTimeout(failsafe);
      removeEventListener('beforeprint', onPrint);
      root.classList.remove('lp-io');
    };
  }, []);
  return null;
}
