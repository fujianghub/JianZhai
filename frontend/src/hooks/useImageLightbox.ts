import { useEffect } from 'react';

/**
 * Double-click any <img> inside the container matched by `selector` → fullscreen
 * lightbox overlay with wheel-zoom / drag-to-pan / Esc(or backdrop / ✕)-to-close.
 *
 * Uses the same `selector + bindKey` "scan the rendered DOM after render" idiom
 * as CodeBlockEnhancer / TableEnhancer. This matters: the post body is injected
 * via `dangerouslySetInnerHTML` *after* an async fetch, so a ref captured at
 * first mount is still `null` (the reader shows a <Spin/> before the article
 * exists). Binding by `[selector, bindKey]` re-runs the effect once the rendered
 * HTML lands (and again when navigating to another post), so the handler is
 * actually attached — a plain `[containerRef]` effect never rebinds and the
 * feature silently no-ops.
 *
 * Skips images explicitly opted out via `data-no-lightbox="true"` and images
 * that are themselves links (parent <a>) — those already navigate somewhere.
 */

/** Pure eligibility check, extracted so it can be unit-tested without a DOM. */
export function shouldOpenLightbox(info: {
  tagName: string;
  noLightbox: boolean;
  insideAnchor: boolean;
  hasSrc: boolean;
}): boolean {
  if (info.tagName !== 'IMG') return false;
  if (info.noLightbox) return false;
  if (info.insideAnchor) return false;
  return info.hasSrc;
}

function clampScale(s: number): number {
  return Math.max(0.2, Math.min(8, s));
}

/**
 * Build + mount the overlay for a single image. Returns a `close()` that is
 * idempotent (safe to call again after the overlay self-closed via Esc/backdrop).
 */
function mountImageLightbox(src: string, alt: string): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'jz-lightbox jz-image-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', alt || '图片预览');

  const stage = document.createElement('div');
  stage.className = 'jz-image-lightbox-stage';
  const inner = document.createElement('div');
  inner.className = 'jz-image-lightbox-inner';
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = 'jz-image-lightbox-img';
  img.draggable = false;
  inner.appendChild(img);
  stage.appendChild(inner);
  overlay.appendChild(stage);

  const toolbar = document.createElement('div');
  toolbar.className = 'jz-diagram-fullscreen-toolbar jz-image-lightbox-toolbar';
  toolbar.innerHTML = `
    <button type="button" data-fs-action="zoom-out" title="缩小（滚轮）" aria-label="缩小">−</button>
    <span class="jz-diagram-fullscreen-zoom" aria-live="polite">100%</span>
    <button type="button" data-fs-action="zoom-in" title="放大（滚轮）" aria-label="放大">+</button>
    <button type="button" data-fs-action="fit" title="适应窗口（数字键 0）">⤢</button>
    <span class="jz-diagram-fullscreen-sep" aria-hidden></span>
    <button type="button" data-fs-action="close" title="关闭 (Esc)" aria-label="关闭">✕</button>
  `;
  overlay.appendChild(toolbar);

  let scale = 1;
  let tx = 0;
  let ty = 0;
  const zoomLabel = toolbar.querySelector('.jz-diagram-fullscreen-zoom') as HTMLElement | null;
  function apply() {
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }
  function fit() {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  }
  function zoomBy(factor: number) {
    const next = clampScale(scale * factor);
    if (next === scale) return;
    scale = next;
    apply();
  }

  // Wheel zoom, anchored on the cursor so the image zooms "around" the pointer.
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = clampScale(scale * factor);
      if (next === scale) return;
      const rect = stage.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      tx = cx - (cx - tx) * (next / scale);
      ty = cy - (cy - ty) * (next / scale);
      scale = next;
      apply();
    },
    { passive: false },
  );

  // Drag to pan.
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startTx = tx;
    startTy = ty;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    apply();
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released — fine */
    }
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-fs-action]') as HTMLElement | null;
    if (!btn) return;
    switch (btn.dataset.fsAction) {
      case 'close':
        close();
        break;
      case 'zoom-in':
        zoomBy(1.25);
        break;
      case 'zoom-out':
        zoomBy(1 / 1.25);
        break;
      case 'fit':
        fit();
        break;
    }
  });

  // Backdrop click closes; clicks that land on the stage/image do not (so a
  // pan started from empty space doesn't dismiss the overlay).
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    else if (e.key === '0') {
      e.preventDefault();
      fit();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(1.25);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(1 / 1.25);
    }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  }

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  apply();
  return close;
}

export function useImageLightbox(selector: string, bindKey: unknown): void {
  useEffect(() => {
    const container = document.querySelector(selector);
    if (!container) return;

    let closeActive: (() => void) | null = null;

    function onDblClick(e: Event) {
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName !== 'IMG') return;
      const img = target as HTMLImageElement;
      const src = img.currentSrc || img.src;
      if (
        !shouldOpenLightbox({
          tagName: img.tagName,
          noLightbox: img.dataset.noLightbox === 'true',
          insideAnchor: !!img.closest('a'),
          hasSrc: !!src,
        })
      ) {
        return;
      }
      e.preventDefault();
      closeActive?.(); // collapse any previous overlay before opening a new one
      closeActive = mountImageLightbox(src, img.alt || '');
    }

    container.addEventListener('dblclick', onDblClick);
    return () => {
      container.removeEventListener('dblclick', onDblClick);
      closeActive?.();
    };
  }, [selector, bindKey]);
}

export default function ImageLightboxEnhancer({
  selector,
  bindKey,
}: {
  selector: string;
  bindKey: unknown;
}) {
  useImageLightbox(selector, bindKey);
  return null;
}
