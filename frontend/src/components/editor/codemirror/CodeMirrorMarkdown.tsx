import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { bracketMatching } from '@codemirror/language';
import { jzCmTheme, jzCmHighlight } from './cmTheme';
import type { EditorSurfaceHandle } from '../surface/EditorSurface';

export interface CodeMirrorMarkdownProps {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** 文档或选区变化（含光标移动）。用于斜杠菜单 / @ 触发检测。 */
  onUpdate?: (info: { docChanged: boolean; selectionSet: boolean; view: EditorView }) => void;
  /** 编辑区滚动（来自用户手势或程序滚动）。 */
  onScroll?: (view: EditorView) => void;
  /**
   * keydown 路由：返回 true 表示已消费（preventDefault + 阻止 CM 处理）。
   * 用于斜杠菜单导航 / @ 拦截 / Ctrl+U 等 React 层逻辑。
   * 以高优先级注册，先于 CM keymap 执行；IME 组合期间不调用。
   */
  onKeyDown?: (e: KeyboardEvent, view: EditorView) => boolean;
  /** 粘贴中含图片文件时回调（已 preventDefault）。 */
  onPasteFiles?: (files: File[]) => void;
  /** 拖入图片文件时回调（已 preventDefault）。 */
  onDropFiles?: (files: File[]) => void;
  /** Surface handle 就绪/销毁。 */
  onSurfaceReady?: (handle: EditorSurfaceHandle | null) => void;
  /** 原生 EditorView 就绪/销毁（滚动同步等需要 view 级 API 的场景）。 */
  onViewReady?: (view: EditorView | null) => void;
  /** 额外 CM 扩展（A/B 档的 keymap、浮动工具条监听等从这里注入）。 */
  extraExtensions?: Extension[];
  className?: string;
}

/** 公共前后缀最小 diff —— 外部 value 回写时保 undo 历史的关键。 */
function minimalDiff(curr: string, next: string): { from: number; to: number; insert: string } {
  let start = 0;
  const minLen = Math.min(curr.length, next.length);
  while (start < minLen && curr.charCodeAt(start) === next.charCodeAt(start)) start++;
  let endCurr = curr.length;
  let endNext = next.length;
  while (endCurr > start && endNext > start && curr.charCodeAt(endCurr - 1) === next.charCodeAt(endNext - 1)) {
    endCurr--;
    endNext--;
  }
  return { from: start, to: endCurr, insert: next.slice(start, endNext) };
}

function buildSurface(view: EditorView): EditorSurfaceHandle {
  const clamp = (n: number) => Math.max(0, Math.min(n, view.state.doc.length));
  return {
    getSelection: () => {
      const r = view.state.selection.main;
      return { from: r.from, to: r.to };
    },
    setSelection: (from, to = from) => {
      view.focus();
      view.dispatch({ selection: { anchor: clamp(from), head: clamp(to) } });
    },
    insertAt: (from, to, text, cursorOffset) => {
      const f = clamp(from);
      const t = clamp(Math.max(to, from));
      const caret = f + (cursorOffset ?? text.length);
      view.dispatch({
        changes: { from: f, to: t, insert: text },
        selection: { anchor: Math.min(caret, f + text.length) },
        scrollIntoView: true,
      });
      view.focus();
      return caret;
    },
    wrapSelection: (before, after, placeholder = '内容') => {
      const r = view.state.selection.main;
      const selected = view.state.sliceDoc(r.from, r.to) || placeholder;
      view.dispatch({
        changes: { from: r.from, to: r.to, insert: before + selected + after },
        selection: {
          anchor: r.from + before.length,
          head: r.from + before.length + selected.length,
        },
        scrollIntoView: true,
      });
      view.focus();
    },
    seekTo: (offset) => {
      const pos = clamp(offset);
      view.focus();
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, {
          y: 'start',
          yMargin: view.scrollDOM.clientHeight / 4,
        }),
      });
    },
    scrollToPos: (offset) => {
      view.dispatch({
        effects: EditorView.scrollIntoView(clamp(offset), {
          y: 'start',
          yMargin: view.scrollDOM.clientHeight / 4,
        }),
      });
    },
    focus: () => view.focus(),
    coordsAtCursor: () => {
      const head = view.state.selection.main.head;
      const c = view.coordsAtPos(head);
      return c ? { left: c.left, top: c.top, bottom: c.bottom, right: c.right } : null;
    },
    getValue: () => view.state.doc.toString(),
  };
}

/**
 * CodeMirror 6 受控包装。
 *
 * 受控策略：CM 自管 EditorState；updateListener 把 docChanged 经 onChange
 * 上报；外部 value 变化时与 view 当前文本比较——相等是自我回声跳过，
 * 不等（409 回写 / 版本回滚）用公共前后缀最小 diff dispatch，保 undo 栈。
 */
const CodeMirrorMarkdown = forwardRef<EditorSurfaceHandle, CodeMirrorMarkdownProps>(
  function CodeMirrorMarkdown(props, ref) {
    const {
      value,
      onChange,
      readOnly = false,
      placeholder,
      onUpdate,
      onScroll,
      onKeyDown,
      onPasteFiles,
      onDropFiles,
      onSurfaceReady,
      onViewReady,
      extraExtensions,
      className,
    } = props;

    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const surfaceRef = useRef<EditorSurfaceHandle | null>(null);
    // 最新回调引用 — 扩展闭包只建一次，回调要可热替换
    const cbRef = useRef({ onChange, onUpdate, onScroll, onKeyDown, onPasteFiles, onDropFiles });
    cbRef.current = { onChange, onUpdate, onScroll, onKeyDown, onPasteFiles, onDropFiles };
    const readOnlyCompartment = useRef(new Compartment());

    useImperativeHandle(ref, () => surfaceRef.current as EditorSurfaceHandle, []);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const extensions: Extension[] = [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        bracketMatching(),
        EditorView.lineWrapping,
        // addKeymap:false — 内置 Enter(insertNewlineContinueMarkup) 与我们
        // listKeymap 的续行/退出/自增规则冲突，由 extraExtensions 全权接管
        markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: false }),
        jzCmTheme,
        jzCmHighlight,
        readOnlyCompartment.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        // React 层 keydown 路由：先于 keymap；IME 组合期间放行
        Prec.high(
          EditorView.domEventHandlers({
            keydown: (e, view) => {
              if (e.isComposing || e.keyCode === 229) return false;
              const handler = cbRef.current.onKeyDown;
              if (handler && handler(e, view)) {
                e.preventDefault();
                return true;
              }
              return false;
            },
          }),
        ),
        EditorView.domEventHandlers({
          paste: (e, view) => {
            const items = Array.from(e.clipboardData?.items ?? []);
            const images = items
              .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
              .map((i) => i.getAsFile())
              .filter((f): f is File => !!f);
            if (images.length > 0 && cbRef.current.onPasteFiles) {
              e.preventDefault();
              cbRef.current.onPasteFiles(images);
              return true;
            }
            // 智能链接：选中文字时粘贴 URL → [选区](url)（语雀同款）
            const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
            const sel = view.state.selection.main;
            if (!sel.empty && /^https?:\/\/\S+$/.test(text)) {
              e.preventDefault();
              const selected = view.state.sliceDoc(sel.from, sel.to);
              const insert = `[${selected}](${text})`;
              view.dispatch({
                changes: { from: sel.from, to: sel.to, insert },
                selection: { anchor: sel.from + insert.length },
                userEvent: 'input.paste',
              });
              return true;
            }
            return false;
          },
          drop: (e) => {
            const cb = cbRef.current.onDropFiles;
            if (!cb) return false;
            const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
              f.type.startsWith('image/'),
            );
            if (files.length === 0) return false;
            e.preventDefault();
            cb(files);
            return true;
          },
          dragover: (e) => {
            const items = Array.from(e.dataTransfer?.items ?? []);
            if (items.some((i) => i.kind === 'file')) {
              e.preventDefault();
              return true;
            }
            return false;
          },
          scroll: (_e, view) => {
            cbRef.current.onScroll?.(view);
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            cbRef.current.onChange(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            cbRef.current.onUpdate?.({
              docChanged: update.docChanged,
              selectionSet: update.selectionSet,
              view: update.view,
            });
          }
        }),
        // 自定义 keymap（续列表/格式化）排在 defaultKeymap 之前，确保先于
        // 默认 Enter / 快捷键处理
        ...(extraExtensions ?? []),
        keymap.of([...defaultKeymap, ...historyKeymap]),
      ];
      if (placeholder) extensions.push(cmPlaceholder(placeholder));

      const view = new EditorView({
        state: EditorState.create({ doc: value, extensions }),
        parent: host,
      });
      viewRef.current = view;
      surfaceRef.current = buildSurface(view);
      onSurfaceReady?.(surfaceRef.current);
      onViewReady?.(view);

      return () => {
        onViewReady?.(null);
        onSurfaceReady?.(null);
        surfaceRef.current = null;
        viewRef.current = null;
        view.destroy();
      };
      // 仅挂载一次；value 同步走下方 effect，readOnly 走 compartment
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // readOnly 热切换
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: readOnlyCompartment.current.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    }, [readOnly]);

    // 外部 value 同步（最小 diff，保 undo 历史）
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const curr = view.state.doc.toString();
      if (curr === value) return; // 自我回声
      const diff = minimalDiff(curr, value);
      view.dispatch({ changes: diff });
    }, [value]);

    return <div ref={hostRef} className={`jz-cm-host ${className ?? ''}`} />;
  },
);

export default CodeMirrorMarkdown;
