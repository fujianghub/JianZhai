import { useEffect, useState } from 'react';

/**
 * rAF-throttled window-scroll flag — true once the page has scrolled past
 * `threshold` px. Drives the header's "is-scrolled" elevation state.
 */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(
    () => typeof window !== 'undefined' && window.scrollY > threshold,
  );

  useEffect(() => {
    let raf = 0;
    function check() {
      raf = 0;
      setScrolled(window.scrollY > threshold);
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(check);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    check();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold]);

  return scrolled;
}
