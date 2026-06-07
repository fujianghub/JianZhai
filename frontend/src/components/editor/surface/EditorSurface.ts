/**
 * EditorSurface — 编辑区抽象层。
 *
 * 让 DocEditorPage / FindReplacePanel 等外围组件不再直接摸
 * `HTMLTextAreaElement`：Markdown 模式由 CodeMirror 包装组件实现该接口，
 * HTML 模式用 {@link textareaSurface} 把现有 textarea 包成同一接口。
 * 所有坐标统一为「字符偏移」(offset)，与 source 字符串索引一致。
 */
export interface EditorSurfaceHandle {
  /** 当前选区 [from, to)。 */
  getSelection(): { from: number; to: number };
  /** 设定选区并聚焦（不强制滚动到可视区）。 */
  setSelection(from: number, to?: number): void;
  /**
   * 把 [from, to) 替换为 text，光标落在 from + (cursorOffset ?? text.length)。
   * 返回最终光标偏移。
   */
  insertAt(from: number, to: number, text: string, cursorOffset?: number): number;
  /** 用 before/after 包裹当前选区；无选区时插入 placeholder 并选中之。 */
  wrapSelection(before: string, after: string, placeholder?: string): void;
  /** 光标跳到 offset，并把所在行滚到视口约 1/4 处（大纲/查找跳转）。 */
  seekTo(offset: number): void;
  /** 仅滚动让 offset 可见（停在视口约 1/4 处），不改选区。 */
  scrollToPos(offset: number): void;
  focus(): void;
  /** 当前光标的视口坐标（斜杠菜单 / 浮动工具条定位）；不可用时返回 null。 */
  coordsAtCursor(): { left: number; top: number; bottom: number; right: number } | null;
  /** 当前完整文本（绕过 React 受控值的回写延迟）。 */
  getValue(): string;
}

/** 把 offset 换算成行号（0-based），按 \n 计。 */
function lineIndexAt(source: string, offset: number): number {
  let n = 0;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) if (source.charCodeAt(i) === 10) n++;
  return n;
}

/** 按行高估算把 textarea 滚到目标行停在视口 1/4 处（原 seekTextarea 逻辑）。 */
function scrollTextareaToOffset(ta: HTMLTextAreaElement, offset: number, source: string) {
  const lineIndex = lineIndexAt(source, offset);
  const style = getComputedStyle(ta);
  const lh = parseFloat(style.lineHeight || '20') || 20;
  ta.scrollTop = Math.max(0, lineIndex * lh - ta.clientHeight / 4);
}

/**
 * 把原生 textarea 包成 EditorSurfaceHandle（HTML 编辑模式用）。
 * `getSource` 取最新源文本 —— textarea.value 与 React 受控值一致，
 * 但行号换算需要与外部状态同源，故由调用方提供。
 */
export function textareaSurface(
  ta: HTMLTextAreaElement,
  getSource: () => string,
): EditorSurfaceHandle {
  const clamp = (n: number) => Math.max(0, Math.min(n, ta.value.length));
  return {
    getSelection: () => ({ from: ta.selectionStart ?? 0, to: ta.selectionEnd ?? 0 }),
    setSelection: (from, to = from) => {
      ta.focus();
      ta.setSelectionRange(clamp(from), clamp(to));
    },
    insertAt: (from, to, text, cursorOffset) => {
      const start = clamp(from);
      const end = clamp(Math.max(to, from));
      const next = ta.value.slice(0, start) + text + ta.value.slice(end);
      // 走原生 setter 触发 React 受控 onChange
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(ta, next);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const caret = start + (cursorOffset ?? text.length);
      ta.focus();
      ta.setSelectionRange(caret, caret);
      return caret;
    },
    wrapSelection: (before, after, placeholder = '内容') => {
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const selected = ta.value.slice(start, end) || placeholder;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(ta, ta.value.slice(0, start) + before + selected + after + ta.value.slice(end));
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    },
    seekTo: (offset) => {
      ta.focus();
      ta.setSelectionRange(clamp(offset), clamp(offset));
      scrollTextareaToOffset(ta, offset, getSource());
    },
    scrollToPos: (offset) => {
      scrollTextareaToOffset(ta, offset, getSource());
    },
    focus: () => ta.focus(),
    coordsAtCursor: () => null, // textarea 无法精确取 caret 坐标
    getValue: () => ta.value,
  };
}
