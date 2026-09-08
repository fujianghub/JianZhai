/**
 * Cross-page text selection for pdf.js text layers (port of the private
 * `TextLayerBuilder#bindMouse` + global selection listener in
 * pdfjs-dist/web/pdf_viewer.mjs, which we don't import — the whole viewer
 * module is far heavier than the two helpers we need).
 *
 * Why it exists: each page's text layer is a stack of absolutely positioned,
 * transparent spans. When the pointer drags below the last span the browser
 * has nothing to extend the selection into and the drag stops at the end of
 * that line. pdf.js solves it with an `.endOfContent` element that normally
 * sits *below* the layer (inset: 100% 0 0) and, while a selection is in
 * progress (`.selecting`), is stretched over the whole page so the selection
 * can flow through the blank area and on to the next page. This module keeps
 * the registry of live text layers and toggles that class from the document
 * level selection events.
 */

const layers = new Map<HTMLElement, HTMLElement>();
let abort: AbortController | null = null;

function reset(end: HTMLElement, layer: HTMLElement) {
  layer.append(end);
  end.style.width = '';
  end.style.height = '';
  layer.classList.remove('selecting');
}

function resetAll() {
  layers.forEach(reset);
}

function installGlobalListeners() {
  if (abort) return;
  abort = new AbortController();
  const { signal } = abort;
  let pointerDown = false;
  document.addEventListener('pointerdown', () => { pointerDown = true; }, { signal });
  document.addEventListener('pointerup', () => { pointerDown = false; resetAll(); }, { signal });
  window.addEventListener('blur', () => { pointerDown = false; resetAll(); }, { signal });
  document.addEventListener('keyup', () => { if (!pointerDown) resetAll(); }, { signal });
  document.addEventListener(
    'selectionchange',
    () => {
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) {
        resetAll();
        return;
      }
      const active = new Set<HTMLElement>();
      for (let i = 0; i < sel.rangeCount; i++) {
        const range = sel.getRangeAt(i);
        for (const layer of layers.keys()) {
          if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
        }
      }
      for (const [layer, end] of layers) {
        if (active.has(layer)) layer.classList.add('selecting');
        else reset(end, layer);
      }
    },
    { signal },
  );
}

/** Register a rendered text layer. `end` must be its `.endOfContent` child. */
export function registerTextLayer(layer: HTMLElement, end: HTMLElement): void {
  layer.addEventListener('mousedown', () => layer.classList.add('selecting'));
  layers.set(layer, end);
  installGlobalListeners();
}

export function unregisterTextLayer(layer: HTMLElement): void {
  layers.delete(layer);
  if (layers.size === 0 && abort) {
    abort.abort();
    abort = null;
  }
}

/** Test hook: how many layers are currently registered. */
export function registeredTextLayerCount(): number {
  return layers.size;
}

/** Whether the document-level listeners are installed (test hook). */
export function textSelectionListenersActive(): boolean {
  return abort !== null;
}
