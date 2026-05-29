import { useEffect } from 'react';
import { renderMermaid } from '@/utils/mermaid';
import { fetchPlantumlSvg } from '@/utils/plantuml';
import {
  attachCodeCopyHandler,
  decodeBase64UTF8,
  getCodePlainTextFromBlock,
  writeCodeToClipboard,
} from '@/utils/codeClipboard';
import { applyPrefsInContainer, togglePreviewSettingsPanel } from '@/utils/codeBlockPreviewPanel';
import { CODE_PREFS_CHANGE_EVENT } from '@/utils/codeBlockPrefs';

/**
 * Hook that wires up the per-code-block toolbar rendered by renderCodeBlock.
 */
export function useCodeBlockEnhancer(containerSelector: string, bindKey: unknown) {
  useEffect(() => {
    const root = document.querySelector(containerSelector);
    if (!root) return;

    applyPrefsInContainer(containerSelector);

    const cleanups: Array<() => void> = [];
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('.jz-code-block'));

    for (const block of blocks) {
      const pre = block.querySelector<HTMLElement>('.jz-code-pre');
      const code = block.querySelector<HTMLElement>('code');
      if (!pre || !code) continue;

      if (block.classList.contains('jz-code-mermaid')) {
        void hydrateMermaid(block);
        cleanups.push(wireCanvasClickToSource(block));
      } else if (block.classList.contains('jz-code-plantuml')) {
        void hydratePlantuml(block);
        cleanups.push(wireCanvasClickToSource(block));
      }

      cleanups.push(attachCodeCopyHandler(pre, () => getCodePlainTextFromBlock(block)));

      const handlers: Array<[HTMLButtonElement, (ev: Event) => void]> = [];
      // Pick up both the legacy ``.jz-code-btn`` toolbar buttons and the new
      // Yuque-style ``.jz-diagram-action`` floating action row. Same data-
      // action contract on either; we don't care which surface produced it.
      const buttons = block.querySelectorAll<HTMLButtonElement>(
        '.jz-code-btn, .jz-diagram-action',
      );
      for (const btn of buttons) {
        const action = btn.dataset.action;
        if (action === 'copy') {
          handlers.push([btn, () => copyBlockToClipboard(block, btn)]);
        } else if (action === 'more') {
          handlers.push([
            btn,
            (ev) => {
              ev.stopPropagation();
              togglePreviewSettingsPanel(btn, containerSelector);
            },
          ]);
        } else if (action === 'mermaid-source' || action === 'plantuml-source') {
          // Stop propagation so clicks on the source-toggle button don't also
          // hit the canvas's "click to view source" handler (which would
          // otherwise toggle the state twice and feel broken).
          handlers.push([
            btn,
            (ev) => {
              ev.stopPropagation();
              toggleMermaidSource(block, btn);
            },
          ]);
        } else if (action === 'diagram-fullscreen') {
          handlers.push([
            btn,
            (ev) => {
              ev.stopPropagation();
              openDiagramFullscreen(block);
            },
          ]);
        } else if (action === 'diagram-download') {
          handlers.push([
            btn,
            (ev) => {
              ev.stopPropagation();
              downloadDiagramSvg(block, btn);
            },
          ]);
        }
      }

      for (const [btn, fn] of handlers) {
        btn.addEventListener('click', fn);
      }
      cleanups.push(() => {
        for (const [btn, fn] of handlers) btn.removeEventListener('click', fn);
      });
    }

    const refreshPrefs = () => applyPrefsInContainer(containerSelector);
    window.addEventListener('storage', refreshPrefs);
    window.addEventListener(CODE_PREFS_CHANGE_EVENT, refreshPrefs);
    cleanups.push(() => {
      window.removeEventListener('storage', refreshPrefs);
      window.removeEventListener(CODE_PREFS_CHANGE_EVENT, refreshPrefs);
    });

    return () => {
      for (const c of cleanups) c();
    };
  }, [containerSelector, bindKey]);
}

async function hydrateMermaid(block: HTMLElement) {
  const canvas = block.querySelector<HTMLElement>('.jz-mermaid-canvas');
  if (!canvas) return;
  const b64 = block.dataset.source ?? '';
  let source = '';
  try {
    source = decodeBase64UTF8(b64);
  } catch {
    canvas.innerHTML = '<div class="jz-mermaid-error">无法解析图表源码</div>';
    return;
  }
  try {
    const svg = await renderMermaid(source);
    canvas.innerHTML = svg;
  } catch (err) {
    const msg = (err as Error)?.message ?? '渲染失败';
    canvas.innerHTML =
      '<div class="jz-mermaid-error">Mermaid 渲染失败：<br/><code>' +
      escapeHtml(msg) +
      '</code></div>';
  }
}

async function hydratePlantuml(block: HTMLElement) {
  const canvas = block.querySelector<HTMLElement>('.jz-mermaid-canvas');
  if (!canvas) return;
  const b64 = block.dataset.source ?? '';
  let source = '';
  try {
    source = decodeBase64UTF8(b64);
  } catch {
    canvas.innerHTML = '<div class="jz-mermaid-error">无法解析 PlantUML 源码</div>';
    return;
  }
  try {
    const svg = await fetchPlantumlSvg(source);
    canvas.innerHTML = svg;
  } catch (err) {
    const msg = (err as Error)?.message ?? '渲染失败';
    canvas.innerHTML =
      '<div class="jz-mermaid-error">PlantUML 渲染失败：<br/><code>' +
      escapeHtml(msg) +
      '</code></div>';
  }
}

function toggleMermaidSource(block: HTMLElement, _btn: HTMLButtonElement) {
  // Delegate to the shared state applier; it patches every visible source-
  // toggle button in the block (legacy code-toolbar + new diagram-actions)
  // so all surfaces stay in sync regardless of which one was clicked.
  const showingSource = !block.classList.contains('jz-mermaid-show-source');
  applyDiagramSourceState(block, showingSource);
}

/** Shared low-level toggler used by both the toolbar button and the
 * "click on canvas to inspect source" affordance on the blog reader. */
function applyDiagramSourceState(block: HTMLElement, showingSource: boolean): void {
  block.classList.toggle('jz-mermaid-show-source', showingSource);
  const pre = block.querySelector<HTMLElement>('.jz-mermaid-source');
  const canvas = block.querySelector<HTMLElement>('.jz-mermaid-canvas');
  if (pre) pre.hidden = !showingSource;
  if (canvas) canvas.style.display = showingSource ? 'none' : '';
  // Re-label every source-toggle button in this block (legacy ``.jz-code-btn``
  // + new ``.jz-diagram-action``). When the button has a ``.jz-diagram-
  // action-label`` child we surgically replace just that text; otherwise
  // (legacy single-text-node button) we fall back to ``textContent``.
  const toggles = block.querySelectorAll<HTMLButtonElement>(
    '[data-action="mermaid-source"], [data-action="plantuml-source"]'
  );
  for (const t of toggles) {
    const labelEl = t.querySelector<HTMLElement>('.jz-diagram-action-label');
    if (labelEl) {
      labelEl.textContent = showingSource ? '图表' : '源码';
    } else {
      t.textContent = showingSource ? '图表' : '源码';
    }
    t.title = showingSource ? '返回图表预览' : '查看源代码';
    t.setAttribute('aria-label', t.title);
  }
}

/** Make the rendered diagram clickable: single-click flips to source, single-
 * click again returns to the picture. Keyboard accessible via Enter / Space.
 * Used in the blog/public reader where there's no inline toolbar. */
function wireCanvasClickToSource(block: HTMLElement): () => void {
  const canvas = block.querySelector<HTMLElement>('.jz-mermaid-canvas');
  if (!canvas) return () => {};
  canvas.classList.add('is-clickable');
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('title', '点击查看源码');
  canvas.setAttribute('aria-label', '点击查看源码');
  const onClick = (ev: MouseEvent) => {
    // Don't fire when the user clicks an SVG anchor / link inside the diagram.
    const t = ev.target as HTMLElement | null;
    if (t && (t.closest('a') || t.tagName === 'A')) return;
    const showingSource = !block.classList.contains('jz-mermaid-show-source');
    applyDiagramSourceState(block, showingSource);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const showingSource = !block.classList.contains('jz-mermaid-show-source');
      applyDiagramSourceState(block, showingSource);
    }
  };
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('keydown', onKey);
  };
}

function copyBlockToClipboard(block: HTMLElement, btn: HTMLButtonElement) {
  const text = getCodePlainTextFromBlock(block);
  const original = btn.textContent;
  const ok = () => {
    btn.classList.add('is-success');
    btn.textContent = '✓';
    window.setTimeout(() => {
      btn.classList.remove('is-success');
      btn.textContent = original ?? '⧉';
    }, 1500);
  };
  const fail = () => {
    btn.classList.add('is-error');
    btn.textContent = '×';
    window.setTimeout(() => {
      btn.classList.remove('is-error');
      btn.textContent = original ?? '⧉';
    }, 1500);
  };
  writeCodeToClipboard(text).then(ok, fail);
}

/** Read the live <svg> out of a diagram block's canvas. Returns null if the
 *  block hasn't finished hydrating (or has rendered an error message). */
function getDiagramSvg(block: HTMLElement): SVGSVGElement | null {
  return block.querySelector<HTMLElement>('.jz-mermaid-canvas')?.querySelector('svg') ?? null;
}

/** Save the currently-rendered diagram as a standalone .svg file. */
function downloadDiagramSvg(block: HTMLElement, btn: HTMLButtonElement): void {
  const svg = getDiagramSvg(block);
  if (!svg) return;
  // Clone so we can attach an xmlns (mermaid omits it in inline mode) and
  // strip mermaid's internal generated id from the filename.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const lang = block.dataset.lang || 'diagram';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${lang}-${ts}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const original = btn.textContent;
  btn.classList.add('is-success');
  btn.textContent = '✓';
  window.setTimeout(() => {
    btn.classList.remove('is-success');
    btn.textContent = original ?? '⤓';
  }, 1200);
}

/** Open the diagram in a centered overlay sized to the viewport. ESC or
 *  click-outside closes. Reuses the same lightbox aesthetic as the inline
 *  image zoom (.jz-lightbox styles in reader.css). */
function openDiagramFullscreen(block: HTMLElement): void {
  const svg = getDiagramSvg(block);
  if (!svg) return;

  const overlay = document.createElement('div');
  overlay.className = 'jz-lightbox jz-diagram-fullscreen';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '图表全屏预览');

  const stage = document.createElement('div');
  stage.className = 'jz-diagram-fullscreen-stage';
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('style');
  stage.appendChild(clone);
  overlay.appendChild(stage);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'jz-lightbox-close';
  closeBtn.setAttribute('aria-label', '关闭预览');
  closeBtn.textContent = '✕';
  overlay.appendChild(closeBtn);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === closeBtn) close();
  });

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function CodeBlockEnhancer({
  selector,
  bindKey,
}: {
  selector: string;
  bindKey: unknown;
}) {
  useCodeBlockEnhancer(selector, bindKey);
  return null;
}
