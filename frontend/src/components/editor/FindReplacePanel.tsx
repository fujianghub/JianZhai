import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Space, Tooltip } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  RetweetOutlined,
} from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import { findReplaceKey, getFindState } from './findReplace';
import type { EditorSurfaceHandle } from './surface/EditorSurface';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tiptap mode — when present, all operations go through editor commands. */
  editor?: Editor | null;
  /** Markdown(CM)/HTML(textarea) 模式：统一经 EditorSurface 做选区高亮与滚动。 */
  surface?: EditorSurfaceHandle | null;
  /** Markdown 模式：替换需要改 value 并通过这个回调上报 */
  source?: string;
  onSourceChange?: (next: string) => void;
}

/**
 * 浮动查找/替换面板。两种数据后端：
 *   - Tiptap：走 `findReplace` 扩展，匹配位 Decoration 高亮。
 *   - EditorSurface（CM / textarea）：选区跳转 + JS 字符串替换。
 *
 * 触发：Ctrl/⌘+F 打开；ESC 关闭。
 */
export default function FindReplacePanel({
  open,
  onClose,
  editor,
  surface,
  source,
  onSourceChange,
}: Props) {
  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  // For textarea mode we track the indexOf cursor ourselves.
  const [taMatches, setTaMatches] = useState<{ matches: number[]; current: number }>({
    matches: [],
    current: -1,
  });
  const inputRef = useRef<{ focus: () => void; select: () => void } | null>(null);
  const [, forceRerender] = useState(0);

  // Re-render when the Tiptap plugin state changes (for current/total counts)
  useEffect(() => {
    if (!editor) return;
    const handler = () => forceRerender((n) => n + 1);
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  // Open / close side-effects
  useEffect(() => {
    if (open) {
      // 立即聚焦输入框；微任务里跑避免和 antd Modal/Drawer 的 focus trap 抢
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
      // 关闭时清掉 Tiptap 的高亮
      editor?.chain().clearFind().run();
      setTaMatches({ matches: [], current: -1 });
    }
  }, [open, editor]);

  // 输入 query 时自动执行查找
  useEffect(() => {
    if (!open) return;
    if (editor) {
      editor.chain().findInDoc(query, { caseSensitive }).run();
    } else if (surface && source !== undefined) {
      setTaMatches(computeTaMatches(source, query, caseSensitive));
    }
  }, [query, caseSensitive, open, editor, surface, source]);

  // surface 模式：当前匹配位变化时选中并滚到对应位置
  useEffect(() => {
    if (editor || !surface) return;
    const { matches, current } = taMatches;
    if (current < 0 || matches[current] === undefined) return;
    const pos = matches[current];
    surface.setSelection(pos, pos + query.length);
    surface.scrollToPos(pos);
  }, [taMatches, query, surface, editor, source]);

  const handleFindNext = useCallback(() => {
    if (editor) {
      editor.chain().findNext().run();
      const s = getFindState(editor);
      if (s && s.matches[s.current]) {
        const m = s.matches[s.current];
        editor.chain().setTextSelection(m.from).scrollIntoView().run();
        editor.view.dispatch(
          editor.state.tr.setMeta(findReplaceKey, { current: s.current }),
        );
      }
    } else {
      setTaMatches((prev) => {
        if (prev.matches.length === 0) return prev;
        return { matches: prev.matches, current: (prev.current + 1) % prev.matches.length };
      });
    }
  }, [editor]);

  const handleFindPrev = useCallback(() => {
    if (editor) {
      editor.chain().findPrev().run();
      const s = getFindState(editor);
      if (s && s.matches[s.current]) {
        const m = s.matches[s.current];
        editor.chain().setTextSelection(m.from).scrollIntoView().run();
      }
    } else {
      setTaMatches((prev) => {
        if (prev.matches.length === 0) return prev;
        return {
          matches: prev.matches,
          current: (prev.current - 1 + prev.matches.length) % prev.matches.length,
        };
      });
    }
  }, [editor]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleFindPrev();
      } else if (e.key === 'Enter') {
        if ((e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          handleFindNext();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, handleFindNext, handleFindPrev]);

  function handleReplace() {
    if (editor) {
      // 只跑 replaceCurrent —— 插件在 docChanged 路径上自动重算匹配并把
      // current 夹紧到新数量（被替换的匹配消失后，同下标正好是下一个）。
      // 以前这里链了一个 findInDoc(query)，它把 current 重置成 0，于是
      // 「逐个替换」每替换一次都跳回第 1 个匹配。
      editor.chain().replaceCurrent(replaceWith).run();
      const s = getFindState(editor);
      if (s && s.matches[s.current]) {
        const m = s.matches[s.current];
        editor.chain().setTextSelection(m.from).scrollIntoView().run();
      }
    } else if (surface && source !== undefined && onSourceChange) {
      const { matches, current } = taMatches;
      if (current < 0 || !matches[current]) return;
      const pos = matches[current];
      const next = source.slice(0, pos) + replaceWith + source.slice(pos + query.length);
      onSourceChange(next);
      // 重新计算匹配，指针留在「被替换处之后的下一个匹配」而不是回到 0
      queueMicrotask(() => {
        const recomputed = computeTaMatches(next, query, caseSensitive);
        const nextIdx = recomputed.matches.findIndex((p) => p >= pos);
        setTaMatches({
          matches: recomputed.matches,
          current: recomputed.matches.length ? (nextIdx === -1 ? 0 : nextIdx) : -1,
        });
      });
    }
  }

  function handleReplaceAll() {
    if (editor) {
      editor.chain().replaceAllInDoc(replaceWith).run();
    } else if (surface && source !== undefined && onSourceChange) {
      if (!query) return;
      const re = new RegExp(escapeRegex(query), caseSensitive ? 'g' : 'gi');
      const next = source.replace(re, replaceWith);
      onSourceChange(next);
      setTaMatches({ matches: [], current: -1 });
    }
  }

  const total = editor ? getFindState(editor)?.matches.length ?? 0 : taMatches.matches.length;
  const idx = editor ? getFindState(editor)?.current ?? -1 : taMatches.current;
  const counter = total === 0 ? '0 / 0' : `${idx + 1} / ${total}`;

  if (!open) return null;

  return (
    <div className="jz-find-panel" role="dialog" aria-label="查找替换">
      <Space.Compact style={{ width: '100%' }}>
        <Input
          ref={(el: { focus: () => void; select: () => void } | null) => {
            inputRef.current = el;
          }}
          placeholder="查找…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          size="small"
          style={{ flex: 1 }}
        />
        <Tooltip title="区分大小写">
          <Button
            size="small"
            type={caseSensitive ? 'primary' : 'default'}
            onClick={() => setCaseSensitive((v) => !v)}
            aria-pressed={caseSensitive}
            style={{ fontFamily: 'serif', fontWeight: 700 }}
          >
            Aa
          </Button>
        </Tooltip>
      </Space.Compact>
      <Space size={4} style={{ marginTop: 6 }}>
        <span style={{ minWidth: 56, fontSize: 12, color: 'var(--jz-text-muted)' }}>
          {counter}
        </span>
        <Tooltip title="上一个 (Ctrl+Enter)">
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={total === 0}
            onClick={handleFindPrev}
          />
        </Tooltip>
        <Tooltip title="下一个 (Enter)">
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={total === 0}
            onClick={handleFindNext}
          />
        </Tooltip>
        <Tooltip title={showReplace ? '收起替换' : '展开替换'}>
          <Button
            size="small"
            icon={<RetweetOutlined />}
            type={showReplace ? 'primary' : 'default'}
            onClick={() => setShowReplace((v) => !v)}
          />
        </Tooltip>
        <Tooltip title="关闭 (Esc)">
          <Button size="small" icon={<CloseOutlined />} onClick={onClose} />
        </Tooltip>
      </Space>
      {showReplace && (
        <div style={{ marginTop: 6 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="替换为…"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              size="small"
              style={{ flex: 1 }}
            />
            <Button size="small" disabled={total === 0} onClick={handleReplace}>
              替换
            </Button>
            <Button size="small" disabled={total === 0} onClick={handleReplaceAll}>
              全部
            </Button>
          </Space.Compact>
        </div>
      )}
    </div>
  );
}

function computeTaMatches(
  source: string,
  query: string,
  caseSensitive: boolean,
): { matches: number[]; current: number } {
  if (!query) return { matches: [], current: -1 };
  const hay = caseSensitive ? source : source.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: number[] = [];
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    out.push(i);
    i += Math.max(1, query.length);
  }
  return { matches: out, current: out.length > 0 ? 0 : -1 };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
