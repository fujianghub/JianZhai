import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import mammoth from 'mammoth';
import { renderMarkdown } from '@/utils/markdown';
import {
  attachmentAbsoluteUrl,
  listDocumentAttachments,
  previewKind,
  type Attachment,
} from '@/api/attachments';
import PdfCanvas from './PdfCanvas';
import FullscreenableIframe from './FullscreenableIframe';

interface Props {
  documentId: number;
  /** Re-run the lookup whenever this changes (e.g., a new upload completes). */
  reloadKey?: unknown;
}

/**
 * Embedded preview of a document's first attachment — used for docs that were
 * imported from a file (PDF/DOCX/HTML/MD) so the user lands on a viewer instead
 * of an empty editor.
 */
export default function AttachmentInlinePreview({ documentId, reloadKey }: Props) {
  const [att, setAtt] = useState<Attachment | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setAtt(undefined);
    listDocumentAttachments(documentId)
      .then((list) => {
        if (!cancelled) setAtt(list[0] ?? null);
      })
      .catch(() => !cancelled && setAtt(null));
    return () => {
      cancelled = true;
    };
  }, [documentId, reloadKey]);

  if (att === undefined) {
    return <Spin />;
  }
  if (!att) {
    return <Empty description="未找到可预览的附件" />;
  }
  return <Body att={att} />;
}

function Body({ att }: { att: Attachment }) {
  const url = attachmentAbsoluteUrl(att.url);
  const kind = previewKind(att);
  const baseStyle: React.CSSProperties = {
    width: '100%',
    height: 'min(70vh, 640px)',
    border: '1px solid var(--jz-border)',
    borderRadius: 8,
    background: 'var(--jz-surface)',
  };

  const dl = (
    <Button
      size="small"
      icon={<DownloadOutlined />}
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
    >
      下载
    </Button>
  );

  if (kind === 'pdf') {
    return <PdfCanvas url={url} height="min(70vh, 640px)" />;
  }
  if (kind === 'image') {
    return (
      <div style={{ position: 'relative', textAlign: 'center' }}>
        {dl}
        <img
          src={url}
          alt={att.original_filename}
          style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }}
        />
      </div>
    );
  }
  if (kind === 'docx') return <DocxInline url={url} />;
  if (kind === 'html') {
    const dlInline = (
      <Button
        size="small"
        icon={<DownloadOutlined />}
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        下载
      </Button>
    );
    return (
      <FullscreenableIframe
        title={att.original_filename}
        src={url}
        inlineStyle={baseStyle}
        extraControls={dlInline}
      />
    );
  }
  if (kind === 'md') return <MarkdownInline url={url} />;
  if (kind === 'text')
    return (
      <div style={{ position: 'relative' }}>
        {dl}
        <PlainInline url={url} />
      </div>
    );
  return (
    <Alert
      type="info"
      showIcon
      message={`${att.original_filename}`}
      description={
        <Button icon={<DownloadOutlined />} href={url} target="_blank" rel="noreferrer">
          下载文件
        </Button>
      }
    />
  );
}

function DocxInline({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setErr(null);
    fetch(url, { credentials: 'include' })
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
  if (err) return <Alert type="error" message={`DOCX 解析失败：${err}`} />;
  if (html === null) return <Spin />;
  return (
    <div
      className="markdown-preview"
      style={{
        maxHeight: '70vh',
        overflow: 'auto',
        padding: 20,
        border: '1px solid var(--jz-border)',
        borderRadius: 8,
        background: 'var(--jz-surface)',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MarkdownInline({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setText(null);
    fetch(url, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (text === null) return <Spin />;
  return (
    <div
      className="markdown-preview"
      style={{
        maxHeight: '70vh',
        overflow: 'auto',
        padding: 20,
        border: '1px solid var(--jz-border)',
        borderRadius: 8,
        background: 'var(--jz-surface)',
      }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

function PlainInline({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setText(null);
    fetch(url, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (text === null) return <Spin />;
  return (
    <pre
      style={{
        maxHeight: '70vh',
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
  );
}
