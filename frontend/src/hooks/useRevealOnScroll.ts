import { useEffect } from 'react';

/**
 * Scroll-reveal for card grids / lists: elements matching `selector` carry the
 * `.jz-reveal` class in markup (CSS hides them); when one enters the viewport
 * it gets `.is-in` and floats up, staggered inside each IntersectionObserver
 * batch so a fresh row cascades instead of popping at once.
 *
 * selector + bindKey paradigm (docs/frontend.md §5): the effect re-runs when
 * `bindKey` changes, so async-loaded content is picked up once it lands —
 * never bind through a containerRef.
 *
 * Reveals instantly (no animation) under prefers-reduced-motion or without
 * IntersectionObserver support.
 */
export function useRevealOnScroll(selector: string, bindKey: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (els.length === 0) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      for (const el of els) el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const el = en.target as HTMLElement;
          // stagger within this batch; cap so a long row never feels laggy
          el.style.setProperty('--jz-reveal-d', `${Math.min(i, 7) * 60}ms`);
          el.classList.add('is-in');
          io.unobserve(el);
          i++;
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
    );
    for (const el of els) {
      if (el.classList.contains('is-in')) continue;
      io.observe(el);
    }
    return () => io.disconnect();
  }, [selector, bindKey]);
}
