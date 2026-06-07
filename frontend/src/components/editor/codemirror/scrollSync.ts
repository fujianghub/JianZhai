import type { EditorView } from '@codemirror/view';
import type { LineMap } from './pure/lineMap';

/**
 * 行级滚动同步 —— CodeMirror 编辑区 ↔ Markdown 预览。
 *
 * 预览 HTML 带 `data-line`（预处理后行号）锚点；编辑区行号经
 * {@link LineMap} 换算到预处理行号后，在锚点对之间线性插值。
 * 比例同步在长短不一（大图/代码块）时漂移，这里以行为锚精准对位。
 */

interface Anchor {
  line: number;
  top: number; // 相对滚动容器内容顶部
}

// Anchor positions only change when the preview content reflows (new HTML or a
// width change), not on scroll. Measuring every ``[data-line]`` element with
// getBoundingClientRect on *each* scroll event is layout thrashing; cache the
// computed anchors per preview element and rebuild only when a cheap signature
// (anchor count + scrollHeight + width) changes.
const _anchorCache = new WeakMap<HTMLElement, { sig: string; anchors: Anchor[] }>();

function collectAnchors(container: HTMLElement): Anchor[] {
  const els = container.querySelectorAll<HTMLElement>('[data-line]');
  const sig = `${els.length}:${container.scrollHeight}:${container.clientWidth}`;
  const cached = _anchorCache.get(container);
  if (cached && cached.sig === sig) return cached.anchors;

  const cRect = container.getBoundingClientRect();
  const out: Anchor[] = [];
  els.forEach((el) => {
    const line = Number(el.dataset.line);
    if (Number.isNaN(line)) return;
    const top = el.getBoundingClientRect().top - cRect.top + container.scrollTop;
    out.push({ line, top });
  });
  out.sort((a, b) => a.line - b.line || a.top - b.top);
  _anchorCache.set(container, { sig, anchors: out });
  return out;
}

/** 由（可带小数的）预处理行号求预览 scrollTop，锚点间插值。 */
function previewTopForLine(anchors: Anchor[], line: number): number {
  if (anchors.length === 0) {
    return 0;
  }
  if (line <= anchors[0].line) {
    // 首锚之前按比例贴向 0
    const frac = anchors[0].line > 0 ? line / anchors[0].line : 0;
    return frac * anchors[0].top;
  }
  const last = anchors[anchors.length - 1];
  if (line >= last.line) {
    return last.top;
  }
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].line <= line) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo];
  const b = anchors[hi];
  const span = b.line - a.line;
  const frac = span > 0 ? (line - a.line) / span : 0;
  return a.top + frac * (b.top - a.top);
}

/** 由预览 scrollTop 反求（小数）预处理行号。 */
function lineForPreviewTop(anchors: Anchor[], scrollTop: number): number {
  if (anchors.length === 0) return 0;
  if (scrollTop <= anchors[0].top) {
    const frac = anchors[0].top > 0 ? scrollTop / anchors[0].top : 0;
    return frac * anchors[0].line;
  }
  const last = anchors[anchors.length - 1];
  if (scrollTop >= last.top) return last.line;
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].top <= scrollTop) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo];
  const b = anchors[hi];
  const span = b.top - a.top;
  const frac = span > 0 ? (scrollTop - a.top) / span : 0;
  return a.line + frac * (b.line - a.line);
}

/** 编辑区滚动 → 预览跟随。 */
export function syncEditorToPreview(
  view: EditorView,
  preview: HTMLElement,
  map: LineMap,
): void {
  const scrollTop = view.scrollDOM.scrollTop;
  // 顶部可视行（含块内小数偏移）
  const block = view.lineBlockAtHeight(scrollTop);
  const lineNo = view.state.doc.lineAt(block.from).number - 1; // 0-based
  const frac = block.height > 0 ? Math.max(0, Math.min(1, (scrollTop - block.top) / block.height)) : 0;
  const transLine = map.origToTrans(lineNo + frac);
  const anchors = collectAnchors(preview);
  const target = previewTopForLine(anchors, transLine);
  preview.scrollTop = Math.max(0, Math.min(target, preview.scrollHeight - preview.clientHeight));
}

/** 预览滚动 → 编辑区跟随。 */
export function syncPreviewToEditor(
  preview: HTMLElement,
  view: EditorView,
  map: LineMap,
): void {
  const anchors = collectAnchors(preview);
  const transLine = lineForPreviewTop(anchors, preview.scrollTop);
  const origLine = map.transToOrig(transLine);
  const lineNo = Math.max(0, Math.min(Math.floor(origLine), view.state.doc.lines - 1));
  const frac = origLine - lineNo;
  const line = view.state.doc.line(lineNo + 1);
  const blockInfo = view.lineBlockAt(line.from);
  const target = blockInfo.top + frac * blockInfo.height;
  const dom = view.scrollDOM;
  dom.scrollTop = Math.max(0, Math.min(target, dom.scrollHeight - dom.clientHeight));
}
