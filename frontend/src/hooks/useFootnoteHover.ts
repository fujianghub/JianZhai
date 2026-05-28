import { useEffect, type RefObject } from 'react';
import DOMPurify from 'dompurify';

/**
 * markdown-it-footnote renders footnotes as
 *   <sup class="footnote-ref"><a href="#fn-1" id="fnref-1">[1]</a></sup>
 *   …
 *   <li id="fn-1">…<a class="footnote-backref" href="#fnref-1">↩</a></li>
 *
 * This hook wires hover/focus on a footnote ref inside `containerRef.current`
 * to a floating tooltip that mirrors the matching <li>'s HTML — so readers
 * don't have to scroll to the bottom and back to read a one-liner.
 *
 * Tooltip is a single shared DIV appended to <body> so it isn't clipped by the
 * post column's overflow / transforms.
 */
export function useFootnoteHover(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tip = document.createElement('div');
    tip.className = 'jz-footnote-tip';
    tip.setAttribute('role', 'tooltip');
    tip.style.display = 'none';
    document.body.appendChild(tip);

    let hideTimer = 0;
    function show(target: HTMLAnchorElement) {
      const href = target.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      const id = decodeURIComponent(href.slice(1));
      const li = container?.querySelector<HTMLElement>(`li#${CSS.escape(id)}`);
      if (!li) return;
      // Copy the footnote content but strip the back-jump arrow. The post body
      // is already DOMPurified server-side, but assigning to innerHTML deserves
      // its own sanitize pass — defense in depth keeps this safe even if the
      // upstream allow-list ever loosens.
      const clone = li.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.footnote-backref').forEach((el) => el.remove());
      tip.innerHTML = DOMPurify.sanitize(clone.innerHTML, {
        ALLOWED_TAGS: ['a', 'strong', 'em', 'code', 'span', 'p', 'br', 'sup', 'sub'],
        ALLOWED_ATTR: ['href', 'title', 'class'],
      });
      const rect = target.getBoundingClientRect();
      // Position above the ref, fall back to below if there's no room above.
      tip.style.display = 'block';
      const tipRect = tip.getBoundingClientRect();
      const margin = 8;
      let top = rect.top - tipRect.height - margin;
      if (top < 8) top = rect.bottom + margin;
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
      tip.style.top = `${Math.round(top + window.scrollY)}px`;
      tip.style.left = `${Math.round(left)}px`;
    }
    function hide() {
      tip.style.display = 'none';
    }
    function onOver(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest('.footnote-ref a') as HTMLAnchorElement | null;
      if (!a) return;
      window.clearTimeout(hideTimer);
      show(a);
    }
    function onOut(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest('.footnote-ref a');
      if (!a) return;
      // Tiny grace period so users can mouse into the tooltip without losing it.
      hideTimer = window.setTimeout(hide, 80);
    }
    function onTipEnter() {
      window.clearTimeout(hideTimer);
    }
    function onTipLeave() {
      hide();
    }
    function onScroll() {
      hide();
    }

    container.addEventListener('mouseover', onOver);
    container.addEventListener('mouseout', onOut);
    tip.addEventListener('mouseenter', onTipEnter);
    tip.addEventListener('mouseleave', onTipLeave);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('mouseover', onOver);
      container.removeEventListener('mouseout', onOut);
      tip.removeEventListener('mouseenter', onTipEnter);
      tip.removeEventListener('mouseleave', onTipLeave);
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(hideTimer);
      tip.remove();
    };
  }, [containerRef]);
}
