/**
 * Renders an imported document's primary attachment (PDF / DOCX / HTML / MD /
 * image / text) inline on the public PostDetail page. Mirrors
 * AttachmentInlinePreview but takes a single Attachment payload directly so we
 * don't need to hit the authenticated /documents/<id>/attachments/ endpoint.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import mammoth from 'mammoth';
import { renderMarkdown } from '@/utils/markdown';
import { attachmentAbsoluteUrl, previewKind } from '@/api/attachments';
import type { PublicAttachment } from '@/types';
import PdfCanvas from './PdfCanvas';
import FullscreenableIframe from './FullscreenableIframe';
import CodeBlockEnhancer from './CodeBlockEnhancer';

export default function PublicAttachmentPreview({ att }: { att: PublicAttachment }) {
  const url = attachmentAbsoluteUrl(att.url);
  const kind = previewKind(att);

  const dl = (
    <div style={{ textAlign: 'right', marginBottom: 8 }}>
      <Button
        size="small"
        icon={<DownloadOutlined />}
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        下载原文件
      </Button>
    </div>
  );

  // Earlier we capped the preview height at 720px which left a lot of empty
  // page below on tall monitors. We now scale with the viewport so the file
  // gets the same vertical footprint the Markdown reader enjoys.
  const frameStyle: React.CSSProperties = {
    width: '100%',
    height: 'min(85vh, calc(100vh - 120px))',
    minHeight: 720,
    border: '1px solid var(--glass-border, var(--jz-border))',
    borderRadius: 12,
  };

  if (kind === 'pdf') {
    return <PdfCanvas url={url} />;
  }
  if (kind === 'image') {
    return (
      <div>
        {dl}
        <div style={{ textAlign: 'center' }}>
          <img
            src={url}
            alt={att.original_filename}
            style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 12 }}
          />
        </div>
      </div>
    );
  }
  if (kind === 'docx') return <DocxInline url={url} dl={dl} />;
  if (kind === 'html')
    return (
      <div>
        {dl}
        <FullscreenableIframe
          title={att.original_filename}
          src={url}
          inlineStyle={frameStyle}
        />
      </div>
    );
  if (kind === 'md') return <MarkdownInline url={url} dl={dl} />;
  if (kind === 'text') return <TextInline url={url} dl={dl} />;
  return (
    <Alert
      type="info"
      showIcon
      message={att.original_filename}
      description={
        <Button icon={<DownloadOutlined />} href={url} target="_blank" rel="noreferrer">
          下载文件
        </Button>
      }
    />
  );
}

function DocxInline({ url, dl }: { url: string; dl: React.ReactNode }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => mammoth.convertToHtml({ arrayBuffer: buf }))
      .then((r) => !cancelled && setHtml(r.value))
      .catch((e) => !cancelled && setErr(e?.message || '解析失败'));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (err) return <Alert type="error" message={`DOCX 预览失败：${err}`} />;
  if (html === null) return <Spin />;
  return (
    <>
      {dl}
      <div
        className="markdown-preview"
        style={{
          maxHeight: 'calc(100vh - 200px)',
          overflow: 'auto',
          padding: 20,
          border: '1px solid var(--jz-border)',
          borderRadius: 8,
          background: 'var(--jz-surface-2)',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

function MarkdownInline({ url, dl }: { url: string; dl: React.ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [url]);
  const html = useMemo(() => (text ? renderMarkdown(text) : ''), [text]);
  if (text === null) return <Spin />;
  return (
    <>
      {dl}
      <div
        className="markdown-preview jz-att-md"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ lineHeight: 1.8, fontSize: 16 }}
      />
      <CodeBlockEnhancer selector=".jz-att-md" bindKey={html} />
    </>
  );
}

function TextInline({ url, dl }: { url: string; dl: React.ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (text === null) return <Spin />;
  return (
    <>
      {dl}
      <pre
        style={{
          maxHeight: 'calc(100vh - 200px)',
          overflow: 'auto',
          padding: 16,
          border: '1px solid var(--jz-border)',
          borderRadius: 8,
          background: 'var(--jz-surface-2)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </pre>
    </>
  );
}
