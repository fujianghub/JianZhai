import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, Spin, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { renderMarkdown, sanitizeHtml } from '@/utils/markdown';
import { convertDocxToHtml } from '@/utils/docx';
import CodeBlockEnhancer from '@/components/common/CodeBlockEnhancer';
import ImageLightboxEnhancer from '@/hooks/useImageLightbox';
import { attachmentAbsoluteUrl, previewKind, type Attachment } from '@/api/attachments';
import PdfCanvas from './LazyPdfCanvas';
import FullscreenableIframe from './FullscreenableIframe';

const { Text } = Typography;

interface Props {
  open: boolean;
  attachment: Attachment | null;
  onClose: () => void;
}

export default function FilePreview({ open, attachment, onClose }: Props) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(98vw, 1600px)"
      destroyOnHidden
      style={{ top: 16 }}
      styles={{ body: { padding: 16 } }}
      title={
        attachment ? (
          <span>
            预览：<Text strong>{attachment.original_filename}</Text>{' '}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {(attachment.size / 1024).toFixed(1)} KB · {attachment.mime_type || '未知类型'}
            </Text>
          </span>
        ) : (
          '预览'
        )
      }
    >
      {attachment && (
        <div>
          <div style={{ marginBottom: 12, textAlign: 'right' }}>
            <Button
              icon={<DownloadOutlined />}
              href={attachmentAbsoluteUrl(attachment.url)}
              target="_blank"
              rel="noreferrer"
            >
              在新窗口打开 / 下载
            </Button>
          </div>
          <PreviewBody attachment={attachment} />
        </div>
      )}
    </Modal>
  );
}

function PreviewBody({ attachment }: { attachment: Attachment }) {
  const kind = previewKind(attachment);
  const url = attachmentAbsoluteUrl(attachment.url);
  // PDF / HTML previews now claim the full modal height (modal is sized at
  // top: 16 + ~chrome) so they no longer feel cramped next to the markdown
  // preview.
  const frameHeight = 'min(88vh, 1100px)';

  if (kind === 'pdf') {
    return <PdfCanvas url={url} height={frameHeight} />;
  }

  if (kind === 'image') {
    return (
      <div style={{ textAlign: 'center' }}>
        <img
          src={url}
          alt={attachment.original_filename}
          style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 6 }}
        />
      </div>
    );
  }

  if (kind === 'docx') return <DocxPreview url={url} />;
  if (kind === 'md') return <MarkdownTextPreview url={url} />;
  if (kind === 'html') return <HtmlPreview url={url} height={frameHeight} />;
  if (kind === 'text') return <PlainTextPreview url={url} />;

  return (
    <Alert
      type="info"
      showIcon
      message="不支持在线预览此格式"
      description="请下载文件后用本地软件打开。"
    />
  );
}

function DocxPreview({ url }: { url: string }) {
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
      .then((buf) => convertDocxToHtml(buf))
      .then((value) => {
        if (!cancelled) setHtml(sanitizeHtml(value));
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || '解析失败');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (err) return <Alert type="error" message={`DOCX 预览失败：${err}`} />;
  if (html === null) return <Centered><Spin /></Centered>;
  return (
    <div
      className="markdown-preview"
      style={{
        maxHeight: '85vh',
        overflow: 'auto',
        padding: 16,
        border: '1px solid var(--jz-border)',
        borderRadius: 6,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MarkdownTextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setErr(null);
    fetch(url, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t))
      .catch((e) => !cancelled && setErr(e?.message || '加载失败'));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const html = useMemo(() => (text ? renderMarkdown(text) : ''), [text]);
  if (err) return <Alert type="error" message={`Markdown 预览失败：${err}`} />;
  if (text === null) return <Centered><Spin /></Centered>;
  return (
    <>
      <div
        className="markdown-preview jz-file-preview-md"
        style={{
          maxHeight: '85vh',
          overflow: 'auto',
          padding: 16,
          border: '1px solid var(--jz-border)',
          borderRadius: 6,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CodeBlockEnhancer selector=".jz-file-preview-md" bindKey={html} />
      <ImageLightboxEnhancer selector=".jz-file-preview-md" bindKey={html} />
    </>
  );
}

function HtmlPreview({ url, height }: { url: string; height: string }) {
  return (
    <FullscreenableIframe
      title="HTML 预览"
      src={url}
      inlineStyle={{ width: '100%', height, border: '1px solid var(--jz-border)', borderRadius: 6 }}
    />
  );
}

function PlainTextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (text === null) return <Centered><Spin /></Centered>;
  return (
    <pre
      style={{
        maxHeight: '85vh',
        overflow: 'auto',
        padding: 16,
        border: '1px solid var(--jz-border)',
        borderRadius: 6,
        background: 'var(--jz-surface-2)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </pre>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>{children}</div>;
}
