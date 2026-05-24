import { useEffect, useState } from 'react';
import { Empty } from 'antd';
import type { Editor } from '@tiptap/core';

interface Heading {
  level: number;
  text: string;
  /** Tiptap mode: ProseMirror doc position. Markdown mode: char offset in source. */
  pos: number;
}

interface Props {
  /** Tiptap editor — preferred when available; we subscribe to ``update``. */
  editor?: Editor | null;
  /** Markdown / HTML source — used when there's no editor. */
  source?: string;
  /** Source content kind. Defaults to 'markdown'. */
  sourceKind?: 'markdown' | 'html';
  /** Markdown/HTML mode: parent supplies a callback to scroll/seek the textarea. */
  onSeek?: (pos: number) => void;
}

/**
 * 文档大纲面板。两种数据源：
 *   - Tiptap：遍历 ProseMirror 文档拿 heading 节点 + position；点击 setTextSelection + scrollIntoView。
 *   - Markdown 源码：regex 抽取 ``^#{1,6} ...`` 行；点击交给 onSeek 让父组件把 textarea 滚到对应位置。
 *
 * 渲染：每个标题一行按钮，按 level 缩进；空文档显示 Empty。
 */
export default function DocumentOutline({ editor, source, sourceKind = 'markdown', onSeek }: Props) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activePos, setActivePos] = useState<number | null>(null);

  // Tiptap：editor.on('update') 重新抽取
  useEffect(() => {
    if (!editor) return;
    const recompute = () => {
      const hs = extractTiptapHeadings(editor);
      setHeadings(hs);
      const anchor = editor.state.selection.anchor;
      let best: number | null = null;
      for (const h of hs) {
        if (h.pos <= anchor) best = h.pos;
        else break;
      }
      setActivePos(best);
    };
    recompute();
    editor.on('update', recompute);
    editor.on('selectionUpdate', recompute);
    return () => {
      editor.off('update', recompute);
      editor.off('selectionUpdate', recompute);
    };
  }, [editor]);

  // Markdown / HTML：value 变就重新解析
  useEffect(() => {
    if (editor) return;
    if (!source) {
      setHeadings([]);
      return;
    }
    setHeadings(
      sourceKind === 'html'
        ? extractHtmlHeadings(source)
        : extractMarkdownHeadings(source),
    );
  }, [editor, source, sourceKind]);

  function handleClick(h: Heading) {
    if (editor) {
      editor.chain().focus().setTextSelection(h.pos + 1).scrollIntoView().run();
    } else if (onSeek) {
      onSeek(h.pos);
    }
  }

  if (headings.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="文档暂无标题" />
      </div>
    );
  }

  return (
    <nav className="jz-outline" aria-label="文档大纲">
      {headings.map((h, i) => (
        <button
          key={`${h.pos}-${i}`}
          type="button"
          className={`jz-outline-item jz-outline-level-${h.level}${h.pos === activePos ? ' jz-outline-item--active' : ''}`}
          onClick={() => handleClick(h)}
          title={h.text}
          aria-current={h.pos === activePos ? 'true' : undefined}
        >
          <span className="jz-outline-bullet" aria-hidden>
            {h.level === 1 ? '●' : h.level === 2 ? '○' : '·'}
          </span>
          <span className="jz-outline-text">{h.text || '(无标题文字)'}</span>
        </button>
      ))}
    </nav>
  );
}

function extractTiptapHeadings(editor: Editor): Heading[] {
  const out: Heading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      out.push({
        level: (node.attrs.level as number) ?? 1,
        text: node.textContent,
        pos,
      });
    }
  });
  return out;
}

/** Scan raw HTML for <h1>…<h6> opening tags. We return character offsets
 *  (not pos in any parsed tree) so the host can scroll a textarea to roughly
 *  the right spot. Works for hand-authored HTML and most Yuque exports. */
function extractHtmlHeadings(source: string): Heading[] {
  const out: Heading[] = [];
  const re = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const tag = m[1].toLowerCase();
    const level = Number(tag.slice(1));
    if (level >= 1 && level <= 6) {
      const text = m[2]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      out.push({ level, text, pos: m.index });
    }
  }
  return out;
}

function extractMarkdownHeadings(source: string): Heading[] {
  const out: Heading[] = [];
  const lines = source.split('\n');
  let inFence = false;
  let offset = 0;
  for (const line of lines) {
    // Skip fenced code blocks so ``#`` inside code isn't treated as heading
    if (/^```/.test(line)) {
      inFence = !inFence;
      offset += line.length + 1;
      continue;
    }
    if (!inFence) {
      const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) {
        out.push({ level: m[1].length, text: m[2].trim(), pos: offset });
      }
    }
    offset += line.length + 1;
  }
  return out;
}
