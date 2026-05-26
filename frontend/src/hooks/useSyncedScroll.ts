import { useEffect, useRef } from 'react';

/**
 * Keeps two scrollable elements at the same relative scroll position (0–1 ratio).
 */
export function useSyncedScroll(
  sourceEl: HTMLElement | null,
  targetEl: HTMLElement | null,
  enabled: boolean,
) {
  const lockRef = useRef(false);

  useEffect(() => {
    if (!enabled || !sourceEl || !targetEl) return;

    const sync = (from: HTMLElement, to: HTMLElement) => {
      if (lockRef.current) return;
      const maxFrom = Math.max(1, from.scrollHeight - from.clientHeight);
      const ratio = from.scrollTop / maxFrom;
      lockRef.current = true;
      const maxTo = Math.max(1, to.scrollHeight - to.clientHeight);
      to.scrollTop = ratio * maxTo;
      requestAnimationFrame(() => {
        lockRef.current = false;
      });
    };

    const onSourceScroll = () => sync(sourceEl, targetEl);
    const onTargetScroll = () => sync(targetEl, sourceEl);

    sourceEl.addEventListener('scroll', onSourceScroll, { passive: true });
    targetEl.addEventListener('scroll', onTargetScroll, { passive: true });
    return () => {
      sourceEl.removeEventListener('scroll', onSourceScroll);
      targetEl.removeEventListener('scroll', onTargetScroll);
    };
  }, [sourceEl, targetEl, enabled]);
}
