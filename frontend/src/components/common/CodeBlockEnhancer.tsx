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
      } else if (block.classList.contains('jz-code-plantuml')) {
        void hydratePlantuml(block);
      }

      cleanups.push(attachCodeCopyHandler(pre, () => getCodePlainTextFromBlock(block)));

      const handlers: Array<[HTMLButtonElement, (ev: Event) => void]> = [];
      for (const btn of block.querySelectorAll<HTMLButtonElement>('.jz-code-btn')) {
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

function toggleMermaidSource(block: HTMLElement, btn: HTMLButtonElement) {
  const showingSource = !block.classList.contains('jz-mermaid-show-source');
  block.classList.toggle('jz-mermaid-show-source', showingSource);
  const pre = block.querySelector<HTMLElement>('.jz-mermaid-source');
  const canvas = block.querySelector<HTMLElement>('.jz-mermaid-canvas');
  if (pre) pre.hidden = !showingSource;
  if (canvas) canvas.style.display = showingSource ? 'none' : '';
  btn.textContent = showingSource ? '图表' : '源码';
  btn.title = showingSource ? '返回图表预览' : '查看 Mermaid 源码';
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
