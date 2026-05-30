/**
 * Shared diagram fullscreen overlay — mouse-wheel zoom, drag-to-pan,
 * copy SVG, download SVG / PNG, keyboard shortcuts (Esc / 0 / + / -).
 *
 * Both the editor (Tiptap CodeBlockView) and the blog reader
 * (CodeBlockEnhancer) call this with different inputs:
 *   - editor: a raw SVG string from React state (``previewHtml``)
 *   - blog:   a live ``SVGSVGElement`` already in the DOM
 *
 * The two callers don't share a render path, but they share what the user
 * sees once the overlay is open. Keeping the modal logic in one place
 * means we only have to fix bugs / restyle once.
 */

export interface DiagramFullscreenOptions {
  /** Used as the download-filename prefix (``mermaid-…``, ``plantuml-…``). */
  lang?: string;
  /** Whether the source is mermaid/plantuml; affects file naming only. */
}

/** Open the overlay from a live ``<svg>`` element. The blog reader uses
 *  this — the SVG already lives in the document, so we clone it into the
 *  overlay rather than re-parsing markup. */
export function openDiagramFullscreen(
  svg: SVGSVGElement,
  opts: DiagramFullscreenOptions = {},
): void {
  mountFullscreenOverlay(svg, opts);
}

/** Open the overlay from raw SVG markup. The editor's CodeBlockView uses
 *  this — its preview state is a string, not a mounted DOM node, so we
 *  parse it into an SVG element first. Returns silently if the markup
 *  doesn't contain a parseable ``<svg>``. */
export function openDiagramFullscreenFromHtml(
  svgHtml: string,
  opts: DiagramFullscreenOptions = {},
): void {
  if (!svgHtml || !/<svg[\s>]/i.test(svgHtml)) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = svgHtml;
  const svg = tmp.querySelector('svg');
  if (!svg) return;
  mountFullscreenOverlay(svg as SVGSVGElement, opts);
}

/** Serialise an SVG element to a self-contained XML string. Mermaid omits
 *  xmlns when emitting inline SVG (the host document provides it) but
 *  downloaded / data-URI'd files need it explicitly or browsers refuse to
 *  render them. */
function serializeDiagramSvg(svg: SVGSVGElement): { xml: string; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const vb = (clone.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const width = clone.viewBox?.baseVal?.width || vb[2] || svg.clientWidth || 800;
  const height = clone.viewBox?.baseVal?.height || vb[3] || svg.clientHeight || 600;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  return { xml, width, height };
}

/** ``<a href>``-triggered blob download. SVG/PNG MIME types don't trip
 *  Chrome's "insecure download" heuristic the way ``text/html`` does, so
 *  this stays blob-based even on LAN-IP HTTP. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function svgToPngBlob(xml: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas context unavailable'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas → blob failed'));
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('image load failed'));
    const b64 = btoa(unescape(encodeURIComponent(xml)));
    img.src = `data:image/svg+xml;base64,${b64}`;
  });
}

function flashToolbarFeedback(btn: HTMLElement, text: string, isError = false): void {
  const original = btn.textContent;
  btn.classList.toggle('is-success', !isError);
  btn.classList.toggle('is-error', isError);
  btn.textContent = text;
  window.setTimeout(() => {
    btn.classList.remove('is-success', 'is-error');
    btn.textContent = original;
  }, 1200);
}

function mountFullscreenOverlay(svg: SVGSVGElement, opts: DiagramFullscreenOptions): void {
  const overlay = document.createElement('div');
  overlay.className = 'jz-lightbox jz-diagram-fullscreen';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '图表全屏预览');

  // ── Stage holds the SVG; transforms apply to .jz-diagram-fullscreen-inner
  const stage = document.createElement('div');
  stage.className = 'jz-diagram-fullscreen-stage';
  const inner = document.createElement('div');
  inner.className = 'jz-diagram-fullscreen-inner';
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('style');
  clone.setAttribute('width', '100%');
  clone.setAttribute('height', '100%');
  inner.appendChild(clone);
  stage.appendChild(inner);
  overlay.appendChild(stage);

  // ── Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'jz-diagram-fullscreen-toolbar';
  const lang = opts.lang || 'diagram';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseFilename = `${lang}-${ts}`;
  toolbar.innerHTML = `
    <button type="button" data-fs-action="zoom-out" title="缩小（滚轮）" aria-label="缩小">−</button>
    <span class="jz-diagram-fullscreen-zoom" aria-live="polite">100%</span>
    <button type="button" data-fs-action="zoom-in" title="放大（滚轮）" aria-label="放大">+</button>
    <button type="button" data-fs-action="fit" title="适应窗口（数字键 0）">⤢</button>
    <span class="jz-diagram-fullscreen-sep" aria-hidden></span>
    <button type="button" data-fs-action="copy-svg" title="复制 SVG（剪贴板）">⧉ SVG</button>
    <button type="button" data-fs-action="download-svg" title="下载 SVG">⤓ SVG</button>
    <button type="button" data-fs-action="download-png" title="下载 PNG（2x 高清）">⤓ PNG</button>
    <span class="jz-diagram-fullscreen-sep" aria-hidden></span>
    <button type="button" data-fs-action="close" title="关闭 (Esc)" aria-label="关闭">✕</button>
  `;
  overlay.appendChild(toolbar);

  // ── Transform state
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const zoomLabel = toolbar.querySelector('.jz-diagram-fullscreen-zoom') as HTMLElement;
  function apply() {
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }
  function clampScale(s: number) {
    return Math.max(0.2, Math.min(8, s));
  }
  function fit() {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  }

  // ── Wheel zoom, anchored on cursor so the diagram zooms "around" the pointer
  stage.addEventListener('wheel', (e) => {
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
  }, { passive: false });

  // ── Drag to pan
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

  // ── Toolbar actions
  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-fs-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.fsAction;
    switch (action) {
      case 'close':
        close();
        break;
      case 'zoom-in': {
        const next = clampScale(scale * 1.25);
        if (next !== scale) {
          scale = next;
          apply();
        }
        break;
      }
      case 'zoom-out': {
        const next = clampScale(scale / 1.25);
        if (next !== scale) {
          scale = next;
          apply();
        }
        break;
      }
      case 'fit':
        fit();
        break;
      case 'copy-svg': {
        const { xml } = serializeDiagramSvg(svg);
        navigator.clipboard.writeText(xml).then(
          () => flashToolbarFeedback(btn, '已复制'),
          () => flashToolbarFeedback(btn, '复制失败', true),
        );
        break;
      }
      case 'download-svg': {
        const { xml } = serializeDiagramSvg(svg);
        triggerBlobDownload(
          new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], {
            type: 'image/svg+xml;charset=utf-8',
          }),
          `${baseFilename}.svg`,
        );
        flashToolbarFeedback(btn, '已下载');
        break;
      }
      case 'download-png': {
        const { xml, width, height } = serializeDiagramSvg(svg);
        svgToPngBlob(xml, width, height, 2).then(
          (blob) => {
            triggerBlobDownload(blob, `${baseFilename}.png`);
            flashToolbarFeedback(btn, '已下载');
          },
          () => flashToolbarFeedback(btn, '导出失败', true),
        );
        break;
      }
    }
  });

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    else if (e.key === '0') {
      e.preventDefault();
      fit();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const next = clampScale(scale * 1.25);
      if (next !== scale) {
        scale = next;
        apply();
      }
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      const next = clampScale(scale / 1.25);
      if (next !== scale) {
        scale = next;
        apply();
      }
    }
  }
  // Backdrop click closes; stage click (even on empty SVG whitespace) does
  // NOT — otherwise initiating a pan from a blank area feels jumpy.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  apply();
}
