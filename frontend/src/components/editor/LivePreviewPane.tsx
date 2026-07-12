import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse } from 'antd';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';
import TableEnhancer from '@/components/common/TableEnhancer';
import ImageLightboxEnhancer from '@/hooks/useImageLightbox';
import { renderMarkdownForEditor, renderMarkdownWithToc } from '@/utils/markdown';
import { paperClassName } from '@/utils/paper';
import { buildHtmlPreviewSrcdoc } from '@/utils/htmlPreview';

export type LivePreviewKind = 'markdown' | 'html';

interface Props {
  source: string;
  kind: LivePreviewKind;
  paperStyle?: string;
  /** Yuque-style hierarchical heading numbering (display-only). */
  numbering?: boolean;
  /** Show heading TOC when markdown has headings. */
  showToc?: boolean;
  className?: string;
  /** Scroll container for synced scroll with the editor (markdown only). */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Fired when the markdown scroll container mounts or unmounts. */
  onScrollContainerReady?: (el: HTMLDivElement | null) => void;
  /**
   * Editor mode: render with ``data-line`` anchors (line-level scroll sync).
   * Never set from the blog reader — annotated HTML is editor-only.
   */
  sourceMap?: boolean;
  /** Scroll events from the preview container (for editor scroll sync). */
  onScroll?: (el: HTMLDivElement) => void;
}

export default function LivePreviewPane({
  source,
  kind,
  paperStyle,
  numbering = false,
  showToc = true,
  className,
  scrollRef,
  onScrollContainerReady,
  sourceMap = false,
  onScroll,
}: Props) {
  const [debouncedSource, setDebouncedSource] = useState(source);
  const innerScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSource(source), 200);
    return () => window.clearTimeout(t);
  }, [source]);

  const setScrollEl = (el: HTMLDivElement | null) => {
    innerScrollRef.current = el;
    if (scrollRef) {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
    onScrollContainerReady?.(el);
  };

  useEffect(() => {
    if (kind !== 'markdown') return;
    return () => onScrollContainerReady?.(null);
  }, [kind, onScrollContainerReady]);

  const htmlSrcdoc = useMemo(
    () => buildHtmlPreviewSrcdoc(debouncedSource),
    [debouncedSource],
  );

  const { html, toc } = useMemo(() => {
    if (kind !== 'markdown') return { html: '', toc: [] };
    return sourceMap
      ? renderMarkdownForEditor(debouncedSource, { numbering })
      : renderMarkdownWithToc(debouncedSource, { numbering });
  }, [debouncedSource, kind, sourceMap, numbering]);

  if (kind === 'html') {
    return (
      <div className={`jz-doc-preview-col jz-doc-preview-html ${className ?? ''}`}>
        <iframe
          title="HTML 阅读预览"
          srcDoc={htmlSrcdoc}
          sandbox="allow-scripts allow-popups allow-forms"
          className="jz-doc-preview-iframe"
        />
      </div>
    );
  }

  return (
    <div
      ref={setScrollEl}
      className={`jz-doc-preview-col jz-doc-live-preview-scroll ${className ?? ''}`}
      onScroll={onScroll ? (e) => onScroll(e.currentTarget) : undefined}
    >
      {showToc && toc.length > 0 && (
        <Collapse
          size="small"
          className="jz-doc-preview-toc"
          items={[
            {
              key: 'toc',
              label: `目录 (${toc.length})`,
              children: (
                <nav className="jz-doc-preview-toc-list" aria-label="预览目录">
                  {toc.map((entry) => (
                    <a
                      key={entry.id}
                      href={`#${entry.id}`}
                      className="jz-doc-preview-toc-item"
                      style={{ paddingLeft: (entry.level - 1) * 12 + 8 }}
                      onClick={(e) => {
                        e.preventDefault();
                        // CSS.escape: 数字开头的标题 id（如 "1-概述"）会让
                        // 裸 #selector 抛 SyntaxError，整个 TOC 点击崩掉。
                        const el = innerScrollRef.current?.querySelector(
                          `#${CSS.escape(entry.id)}`,
                        );
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {entry.text}
                    </a>
                  ))}
                </nav>
              ),
            },
          ]}
        />
      )}
      <div
        className={`markdown-preview jz-post-article jz-doc-live-preview paper ${paperClassName(paperStyle)}`}
        style={{ lineHeight: 1.85, fontSize: 16 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CodeBlockEnhancer selector=".jz-doc-live-preview" bindKey={html} />
      <TableEnhancer selector=".jz-doc-live-preview" bindKey={html} />
      <ImageLightboxEnhancer selector=".jz-doc-live-preview" bindKey={html} />
    </div>
  );
}
