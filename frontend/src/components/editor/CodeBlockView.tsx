import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dropdown, Input, Select, Tooltip } from 'antd';
import {
  CaretDownOutlined,
  CaretRightOutlined,
  CheckOutlined,
  CopyOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { languageLabel, normalizeLanguage, UNIQUE_CODE_LANGUAGES } from '@/utils/codeBlocks';
import {
  attachCodeCopyHandler,
  getCodePlainTextFromPmNode,
  writeCodeToClipboard,
} from '@/utils/codeClipboard';
import {
  autoIndentCodeBlock,
  syncCodeBlockStyleAndLanguageToDocument,
  syncCodeBlockStyleToDocument,
} from '@/utils/codeBlockEditorActions';
import {
  broadcastPrefsChange,
  CODE_PREFS_CHANGE_EVENT,
  loadCodeBlockPrefs,
  saveCodeBlockPrefs,
  type CodeBlockPrefs,
  type CodeThemeId,
} from '@/utils/codeBlockPrefs';
import { message } from '@/utils/notify';
import { renderMermaid } from '@/utils/mermaid';
import { fetchPlantumlSvg } from '@/utils/plantuml';
import CodeBlockMoreMenu from './CodeBlockMoreMenu';
import CodeBlockThemeSelect from './CodeBlockThemeSelect';

export default function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const lang = normalizeLanguage((node.attrs.language as string | null) ?? '');
  const title = (node.attrs.title as string | null) ?? '';
  const collapsed = Boolean(node.attrs.collapsed);

  const [prefs, setPrefs] = useState<CodeBlockPrefs>(loadCodeBlockPrefs);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const isMermaid = lang === 'mermaid';
  const isPlantuml = lang === 'plantuml';
  const isDiagram = isMermaid || isPlantuml;
  const [showPreview, setShowPreview] = useState<boolean>(isDiagram);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewError, setPreviewError] = useState<string>('');
  const previewSourceRef = useRef<string>('');

  const langLabel = languageLabel(lang);
  const displayTitle = title.trim() || `${langLabel} · 代码块`;

  useEffect(() => {
    setShowPreview(isDiagram);
    previewSourceRef.current = '';
    setPreviewHtml('');
    setPreviewError('');
  }, [isDiagram, isMermaid, isPlantuml]);

  const diagramSource = isDiagram ? (node.textContent ?? '') : '';
  const debouncedSource = useDebouncedValue(diagramSource, isPlantuml ? 600 : 300);
  useEffect(() => {
    if (!isDiagram || !showPreview || collapsed) return;
    if (!debouncedSource.trim()) {
      setPreviewHtml('');
      setPreviewError('');
      return;
    }
    if (previewSourceRef.current === debouncedSource) return;
    previewSourceRef.current = debouncedSource;
    let cancelled = false;
    const renderFn = isMermaid ? renderMermaid : fetchPlantumlSvg;
    renderFn(debouncedSource)
      .then((svg) => {
        if (cancelled) return;
        setPreviewHtml(svg);
        setPreviewError('');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPreviewError(e instanceof Error ? e.message : '渲染失败');
        setPreviewHtml('');
        previewSourceRef.current = '';
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSource, isDiagram, isMermaid, showPreview, collapsed]);

  useEffect(() => {
    const refreshPrefs = () => setPrefs(loadCodeBlockPrefs());
    const onStorage = (e: StorageEvent) => {
      if (
        e.key?.startsWith('jz-code-') ||
        e.key === 'jz-code-prefs-touch'
      ) {
        refreshPrefs();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CODE_PREFS_CHANGE_EVENT, refreshPrefs);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CODE_PREFS_CHANGE_EVENT, refreshPrefs);
    };
  }, []);

  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;
    return attachCodeCopyHandler(pre, () => getCodePlainTextFromPmNode(node));
  }, [node]);

  const patchPrefs = useCallback((partial: Partial<CodeBlockPrefs>) => {
    saveCodeBlockPrefs(partial);
    broadcastPrefsChange();
    setPrefs(loadCodeBlockPrefs());
  }, []);

  const handleCopy = () => {
    writeCodeToClipboard(getCodePlainTextFromPmNode(node))
      .then(() => setCopied('ok'))
      .catch(() => setCopied('fail'));
    window.setTimeout(() => setCopied(null), 1500);
  };

  const handleAutoIndent = useCallback(() => {
    autoIndentCodeBlock(editor, getPos, node, prefs.indentMode, prefs.indentWidth);
  }, [editor, getPos, node, prefs.indentMode, prefs.indentWidth]);

  useEffect(() => {
    if (!editor.isEditable) return;
    const onKey = (e: KeyboardEvent) => {
      if (!editor.isActive('codeBlock')) return;
      if (e.ctrlKey && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        handleAutoIndent();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editor, handleAutoIndent]);

  const handleSyncStyle = () => {
    syncCodeBlockStyleToDocument(editor, prefs);
    message.success('已同步样式到全文');
    setMoreOpen(false);
  };

  const handleSyncStyleAndLang = () => {
    syncCodeBlockStyleAndLanguageToDocument(editor, lang);
    message.success('已同步样式与语言到全文');
    setMoreOpen(false);
  };

  const blockClass =
    'jz-code-block jz-code-block-editable' +
    (prefs.wrap ? ' is-wrapped' : '') +
    (collapsed ? ' is-collapsed' : '');

  return (
    <NodeViewWrapper
      className={blockClass}
      data-lang={lang}
      data-code-theme={prefs.theme}
    >
      <div className="jz-code-toolbar" contentEditable={false}>
        <button
          type="button"
          className="jz-code-collapse-btn"
          aria-label={collapsed ? '展开' : '折叠'}
          onClick={() => updateAttributes({ collapsed: !collapsed })}
        >
          {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </button>

        <div className="jz-code-title-area">
          <Input
            className="jz-code-title-input"
            size="small"
            bordered={false}
            value={title}
            placeholder={displayTitle}
            disabled={!editor.isEditable}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <span className="jz-code-toolbar-spacer" />

        <Select
          size="small"
          value={lang}
          onChange={(v) => updateAttributes({ language: v })}
          onClick={(e) => e.stopPropagation()}
          styles={{ popup: { root: { minWidth: 180 } } }}
          options={UNIQUE_CODE_LANGUAGES.map((l) => ({ value: l.slug, label: l.label }))}
          showSearch
          optionFilterProp="label"
          className="jz-code-lang-select"
          disabled={!editor.isEditable}
        />

        <span className="jz-code-toolbar-divider" aria-hidden />

        <span className="jz-code-theme-trigger-wrap">
          <CodeBlockThemeSelect
            value={prefs.theme}
            onChange={(v: CodeThemeId) => patchPrefs({ theme: v })}
            disabled={!editor.isEditable}
          />
        </span>

        <span className="jz-code-toolbar-divider" aria-hidden />

        <div className="jz-code-toolbar-actions">
          <Tooltip title={copied === 'ok' ? '已复制' : copied === 'fail' ? '失败' : '复制'}>
            <Button
              size="small"
              type="text"
              className="jz-code-toolbar-icon"
              icon={copied === 'ok' ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopy}
            />
          </Tooltip>
          <Dropdown
            open={moreOpen}
            onOpenChange={setMoreOpen}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="jz-code-dropdown"
            dropdownRender={() => (
              <CodeBlockMoreMenu
                prefs={prefs}
                onPrefsChange={patchPrefs}
                onAutoIndent={handleAutoIndent}
                onSyncStyle={handleSyncStyle}
                onSyncStyleAndLang={handleSyncStyleAndLang}
                isDiagram={isDiagram}
                showPreview={showPreview}
                onTogglePreview={() => setShowPreview((v) => !v)}
              />
            )}
          >
            <Button
              size="small"
              type="text"
              className="jz-code-toolbar-icon"
              icon={<MoreOutlined />}
              aria-label="更多"
            />
          </Dropdown>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className={`jz-code-body-wrap${prefs.lineNumbers ? ' has-line-numbers' : ''}`}>
            {prefs.lineNumbers && (
              <div
                className="jz-line-numbers"
                contentEditable={false}
                aria-hidden
                style={{ fontSize: `${prefs.fontSize}px`, lineHeight: prefs.lineHeight }}
              >
                {(node.textContent ?? '').split('\n').map((_, i) => (
                  <div key={i} className="jz-line-number-row">
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <pre
              ref={preRef}
              className="jz-code-pre hljs"
              spellCheck={false}
              style={{
                fontSize: `${prefs.fontSize}px`,
                lineHeight: prefs.lineHeight,
                tabSize: prefs.indentWidth,
              }}
            >
              <NodeViewContent
                as={'code' as unknown as 'div'}
                className={`hljs language-${lang}`}
              />
            </pre>
          </div>

          {isDiagram && showPreview && (
            <div className="jz-codeblock-mermaid-preview" contentEditable={false}>
              {previewError ? (
                <div className="jz-mermaid-error">
                  渲染失败：<code>{previewError}</code>
                </div>
              ) : previewHtml ? (
                <div
                  className="jz-mermaid-canvas"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="jz-mermaid-loading">
                  {isPlantuml ? '正在向 PlantUML 服务请求…' : '等待源码…'}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}
