import { useEffect, type RefObject } from 'react';

/**
 * Click any <img> inside `containerRef.current` → fullscreen overlay with the
 * original-size image, ESC / outside-click to close. Cheap event delegation;
 * no extra deps, no React tree changes inside the dangerously-set HTML.
 *
 * Skips images explicitly opted out via `data-no-lightbox` or images that are
 * themselves links (parent <a>) — those already navigate somewhere.
 */
export function useImageLightbox(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let overlay: HTMLDivElement | null = null;

    function close() {
      if (!overlay) return;
      overlay.remove();
      overlay = null;
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }

    function open(src: string, alt: string) {
      close(); // ensure no stale overlay
      overlay = document.createElement('div');
      overlay.className = 'jz-lightbox';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', alt || '图片预览');
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt;
      img.className = 'jz-lightbox-img';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'jz-lightbox-close';
      closeBtn.setAttribute('aria-label', '关闭预览');
      closeBtn.textContent = '✕';
      overlay.appendChild(img);
      overlay.appendChild(closeBtn);
      overlay.addEventListener('click', (e) => {
        // Click on backdrop (not the image itself) closes.
        if (e.target === overlay || e.target === closeBtn) close();
      });
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const img = target?.tagName === 'IMG' ? (target as HTMLImageElement) : null;
      if (!img) return;
      if (img.dataset.noLightbox === 'true') return;
      if (img.closest('a')) return; // images wrapping a link already navigate
      // Only handle if the image actually has a usable src
      const src = img.currentSrc || img.src;
      if (!src) return;
      e.preventDefault();
      open(src, img.alt || '');
    }

    container.addEventListener('click', onClick);
    return () => {
      container.removeEventListener('click', onClick);
      close();
    };
  }, [containerRef]);
}
