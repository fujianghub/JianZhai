import { useEffect, useState } from 'react';
import { Button, Select, Tooltip } from 'antd';
import {
  CheckOutlined,
  ColumnHeightOutlined,
  CopyOutlined,
  FontSizeOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { normalizeLanguage, UNIQUE_CODE_LANGUAGES } from '@/utils/codeBlocks';

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
 * NodeView for Tiptap code-block — gives the in-editor code block the same
 * Yuque-flavoured chrome the rendered preview has:
 *   - language picker (drives the fenced-code hint when serialised to Markdown)
 *   - font-size +/- (shared with the preview via localStorage)
 *   - wrap toggle
 *   - copy button
 *
 * The actual editable content is rendered by ``<NodeViewContent />``, so
 * Tiptap continues to own selection, undo, and Markdown serialisation.
 */
export default function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const lang = normalizeLanguage((node.attrs.language as string | null) ?? '');
  const [fontSize, setFontSize] = useState<number>(loadFontSize);
  const [lineHeight, setLineHeight] = useState<number>(loadLineHeight);
  const [wrap, setWrap] = useState<boolean>(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  /** Listen for font-size / line-height changes coming from sibling code
   * blocks (incl. the rendered Markdown preview). They write to the same
   * localStorage keys, and we react to the cross-tab ``storage`` event so the
   * active block updates immediately without waiting for a re-render. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const v = Number(e.newValue);
        if (Number.isFinite(v) && v >= FONT_MIN && v <= FONT_MAX) setFontSize(v);
      } else if (e.key === LINE_STORAGE_KEY && e.newValue) {
        const v = Number(e.newValue);
        if (Number.isFinite(v) && v >= LINE_MIN && v <= LINE_MAX) setLineHeight(v);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function bumpFont(delta: number) {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    if (next === fontSize) return;
    saveFontSize(next);
    setFontSize(next);
  }

  function bumpLineHeight(delta: number) {
    const next = Math.round(Math.max(LINE_MIN, Math.min(LINE_MAX, lineHeight + delta)) * 10) / 10;
    if (next === lineHeight) return;
    saveLineHeight(next);
    setLineHeight(next);
  }

  function handleCopy() {
    const text = (node.textContent ?? '') as string;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => setCopied('ok'))
        .catch(() => setCopied('fail'));
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied('ok');
      } catch {
        setCopied('fail');
      }
    }
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <NodeViewWrapper
      className={'jz-code-block jz-code-block-editable' + (wrap ? ' is-wrapped' : '')}
      data-lang={lang}
    >
      <div className="jz-code-toolbar" contentEditable={false}>
        <Select
          size="small"
          value={lang}
          onChange={(v) => updateAttributes({ language: v })}
          // Don't propagate clicks into the editor — picking from the dropdown
          // would otherwise blur and immediately re-select the code block.
          onClick={(e) => e.stopPropagation()}
          dropdownStyle={{ minWidth: 180 }}
          options={UNIQUE_CODE_LANGUAGES.map((l) => ({ value: l.slug, label: l.label }))}
          showSearch
          optionFilterProp="label"
          style={{ width: 150 }}
          disabled={!editor.isEditable}
        />
        <span className="jz-code-toolbar-spacer" />
        <Tooltip title="缩小字号">
          <Button
            size="small"
            type="text"
            icon={<FontSizeOutlined />}
            onClick={() => bumpFont(-FONT_STEP)}
          >
            −
          </Button>
        </Tooltip>
        <span className="jz-code-fontsize" aria-live="polite">{fontSize}</span>
        <Tooltip title="放大字号">
          <Button
            size="small"
            type="text"
            icon={<FontSizeOutlined />}
            onClick={() => bumpFont(+FONT_STEP)}
          >
            ＋
          </Button>
        </Tooltip>
        <Tooltip title="缩小行距">
          <Button
            size="small"
            type="text"
            icon={<ColumnHeightOutlined />}
            onClick={() => bumpLineHeight(-LINE_STEP)}
          >
            −
          </Button>
        </Tooltip>
        <span className="jz-code-fontsize" aria-live="polite">{lineHeight.toFixed(1)}</span>
        <Tooltip title="放大行距">
          <Button
            size="small"
            type="text"
            icon={<ColumnHeightOutlined />}
            onClick={() => bumpLineHeight(+LINE_STEP)}
          >
            ＋
          </Button>
        </Tooltip>
        <Tooltip title={wrap ? '取消换行（横向滚动）' : '自动换行'}>
          <Button
            size="small"
            type={wrap ? 'primary' : 'text'}
            icon={<MenuOutlined rotate={wrap ? 0 : 90} />}
            onClick={() => setWrap((v) => !v)}
            aria-pressed={wrap}
          />
        </Tooltip>
        <Tooltip title={copied === 'ok' ? '已复制' : copied === 'fail' ? '失败' : '复制'}>
          <Button
            size="small"
            type="text"
            icon={copied === 'ok' ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopy}
          />
        </Tooltip>
      </div>
      <pre
        className="jz-code-pre hljs"
        style={{ fontSize: `${fontSize}px`, lineHeight }}
      >
        {/* Tiptap's CodeBlock schema serialises content as a <code>; the
            element here is the rendered shell, NodeViewContent injects the
            actual editable text into a <div> by default which the schema
            tolerates. Override with the ``as`` prop typed loosely so TS
            accepts "code" (a valid intrinsic). */}
        <NodeViewContent
          as={'code' as unknown as 'div'}
          className={`hljs language-${lang}`}
        />
      </pre>
    </NodeViewWrapper>
  );
}
