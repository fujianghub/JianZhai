import { useEffect } from 'react';
import { renderMermaid } from '@/utils/mermaid';

const FONT_STEP = 1;
const FONT_MIN = 11;
const FONT_MAX = 22;
const STORAGE_KEY = 'jz-code-font-size';

const LINE_STEP = 0.1;
const LINE_MIN = 1.0;
const LINE_MAX = 2.4;
const LINE_DEFAULT = 1.0;
const LINE_STORAGE_KEY = 'jz-code-line-height';

function loadFontSize(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(v) && v >= FONT_MIN && v <= FONT_MAX) return v;
  } catch {
    /* ignore */
  }
  return 14;
}

function saveFontSize(v: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

function loadLineHeight(): number {
  try {
    const v = Number(localStorage.getItem(LINE_STORAGE_KEY));
    if (Number.isFinite(v) && v >= LINE_MIN && v <= LINE_MAX) return v;
  } catch {
    /* ignore */
  }
  return LINE_DEFAULT;
}

function saveLineHeight(v: number) {
  try {
    localStorage.setItem(LINE_STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/**
 * Hook that wires up the per-code-block toolbar (copy / wrap / font-size)
 * rendered by ``renderCodeBlock`` in utils/markdown.ts.
 *
 * Mount it once at the top of any view that renders trusted Markdown (the
 * PostDetail page, the editor preview, the file-preview Markdown body, etc.).
 * It scopes itself to ``containerSelector`` and re-binds whenever the
 * referenced ``html`` content changes.
 *
 * Font-size is persisted globally so the reader's preference travels across
 * pages instead of resetting every time they click a new doc.
 */
export function useCodeBlockEnhancer(
  containerSelector: string,
  /** Anything serialised — we use it as a re-bind cue (e.g. the rendered HTML
   * or the post id). */
  bindKey: unknown
) {
  useEffect(() => {
    const root = document.querySelector(containerSelector);
    if (!root) return;
    const fontSize = loadFontSize();
    const lineHeight = loadLineHeight();
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('.jz-code-block'));
    if (blocks.length === 0) return;

    // Apply persisted font-size + line-height to every block.
    for (const b of blocks) {
      const pre = b.querySelector<HTMLElement>('.jz-code-pre');
      if (pre) {
        pre.style.fontSize = `${fontSize}px`;
        pre.style.lineHeight = String(lineHeight);
      }
    }

    const cleanups: Array<() => void> = [];

    for (const block of blocks) {
      const pre = block.querySelector<HTMLElement>('.jz-code-pre');
      const code = block.querySelector<HTMLElement>('code');
      if (!pre || !code) continue;

      // Mermaid blocks render asynchronously; kick off the SVG render in the
      // background and let the toolbar fall through to the wiring below.
      if (block.classList.contains('jz-code-mermaid')) {
        void hydrateMermaid(block);
      }

      const handlers: Array<[HTMLButtonElement, () => void]> = [];
      const buttons = Array.from(block.querySelectorAll<HTMLButtonElement>('.jz-code-btn'));
      for (const btn of buttons) {
        const action = btn.dataset.action;
        if (action === 'copy') {
          handlers.push([btn, () => copyToClipboard(code.innerText, btn)]);
        } else if (action === 'wrap') {
          handlers.push([btn, () => toggleWrap(block, btn)]);
        } else if (action === 'font-up') {
          handlers.push([btn, () => bumpFont(+FONT_STEP, containerSelector)]);
        } else if (action === 'font-down') {
          handlers.push([btn, () => bumpFont(-FONT_STEP, containerSelector)]);
        } else if (action === 'line-loose') {
          handlers.push([btn, () => bumpLineHeight(+LINE_STEP, containerSelector)]);
        } else if (action === 'line-tight') {
          handlers.push([btn, () => bumpLineHeight(-LINE_STEP, containerSelector)]);
        } else if (action === 'mermaid-source') {
          handlers.push([btn, () => toggleMermaidSource(block, btn)]);
        }
      }

      for (const [btn, fn] of handlers) {
        btn.addEventListener('click', fn);
      }
      cleanups.push(() => {
        for (const [btn, fn] of handlers) btn.removeEventListener('click', fn);
      });
    }

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
      '<div class="jz-mermaid-error">' +
      'Mermaid 渲染失败：<br/><code>' +
      escapeHtml(msg) +
      '</code>' +
      '</div>';
  }
}

function toggleMermaidSource(block: HTMLElement, btn: HTMLButtonElement) {
  const showingSource = !block.classList.contains('jz-mermaid-show-source');
  block.classList.toggle('jz-mermaid-show-source', showingSource);
  const pre = block.querySelector<HTMLElement>('.jz-mermaid-source');
  const canvas = block.querySelector<HTMLElement>('.jz-mermaid-canvas');
  if (pre) pre.hidden = !showingSource;
  if (canvas) canvas.style.display = showingSource ? 'none' : '';
  btn.textContent = showingSource ? '图表' : '源码';
}

function decodeBase64UTF8(b64: string): string {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const bin = window.atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyToClipboard(text: string, btn: HTMLButtonElement) {
  const original = btn.textContent;
  const ok = () => {
    btn.classList.add('is-success');
    btn.textContent = '已复制';
    window.setTimeout(() => {
      btn.classList.remove('is-success');
      btn.textContent = original ?? '⧉';
    }, 1500);
  };
  const fail = () => {
    btn.classList.add('is-error');
    btn.textContent = '失败';
    window.setTimeout(() => {
      btn.classList.remove('is-error');
      btn.textContent = original ?? '⧉';
    }, 1500);
  };
  // Prefer the async clipboard API; fall back to the legacy execCommand path
  // (still works in iframes/insecure contexts where the modern API throws).
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(ok, () => legacyCopy(text) ? ok() : fail());
  } else if (legacyCopy(text)) {
    ok();
  } else {
    fail();
  }
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function toggleWrap(block: HTMLElement, btn: HTMLButtonElement) {
  const next = !block.classList.contains('is-wrapped');
  block.classList.toggle('is-wrapped', next);
  btn.classList.toggle('is-active', next);
  btn.setAttribute('aria-pressed', String(next));
}

/** Bump the font-size on every visible code block + persist for next time. */
function bumpFont(delta: number, containerSelector: string) {
  const root = document.querySelector(containerSelector);
  if (!root) return;
  const cur = loadFontSize();
  const next = Math.max(FONT_MIN, Math.min(FONT_MAX, cur + delta));
  if (next === cur) return;
  saveFontSize(next);
  root.querySelectorAll<HTMLElement>('.jz-code-pre').forEach((pre) => {
    pre.style.fontSize = `${next}px`;
  });
}

/** Bump the line-height on every visible code block + persist. */
function bumpLineHeight(delta: number, containerSelector: string) {
  const root = document.querySelector(containerSelector);
  if (!root) return;
  const cur = loadLineHeight();
  // Snap to one-decimal to avoid 1.40000000000001 ish noise.
  const next = Math.round(Math.max(LINE_MIN, Math.min(LINE_MAX, cur + delta)) * 10) / 10;
  if (next === cur) return;
  saveLineHeight(next);
  root.querySelectorAll<HTMLElement>('.jz-code-pre').forEach((pre) => {
    pre.style.lineHeight = String(next);
  });
}

/** Convenience wrapper so callers can drop a one-line component instead of
 * importing the hook themselves. */
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
