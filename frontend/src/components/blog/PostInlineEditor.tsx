import { useCallback, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { Link } from 'react-router-dom';
import RichTextEditor from '@/components/editor/RichTextEditor';
import HtmlEditor from '@/components/editor/HtmlEditor';
import type { EditorSaveHandle } from '@/components/editor/editorSaveLifecycle';
import { paperClassName } from '@/utils/paper';
import { patchDocumentRawContent } from '@/utils/documentSave';
import type { DocFormat, DocumentDetail, PublicPostDetail } from '@/types';
import { attachmentAbsoluteUrl } from '@/api/attachments';

interface Props {
  doc: DocumentDetail;
  post: PublicPostDetail;
  primaryUrl?: string | null;
  fullEditHref: string;
  onDocChange: (next: DocumentDetail) => void;
  onSaveReady: (handle: EditorSaveHandle | null) => void;
  forceSyncRevision?: number;
}

const BINARY_INLINE = new Set<DocFormat>(['pdf', 'image']);

/** Whether the post body can be edited inline on the reader page. */
export function canInlineEditBody(
  format: DocFormat,
  publishedContent: string,
  hasPrimaryAttachment: boolean,
): boolean {
  if (BINARY_INLINE.has(format)) return false;
  if (format === 'html') return true;
  const body = (publishedContent || '').trim();
  if (body) return true;
  if (format === 'docx' && hasPrimaryAttachment) return false;
  return !hasPrimaryAttachment;
}

export default function PostInlineEditor({
  doc,
  post,
  primaryUrl,
  fullEditHref,
  onDocChange,
  onSaveReady,
  forceSyncRevision = 0,
}: Props) {
  const docRef = useRef(doc);
  docRef.current = doc;
  const [conflictRevision, setConflictRevision] = useState(0);

  const onConflict = useCallback(
    (live: DocumentDetail | undefined) => {
      if (live) {
        onDocChange(live);
        setConflictRevision((n) => n + 1);
      }
    },
    [onDocChange],
  );

  const handleAutoSave = useCallback(
    async (content: string) => {
      const updated = await patchDocumentRawContent(docRef.current, content, onConflict);
      onDocChange({ ...docRef.current, ...updated });
    },
    [onDocChange, onConflict],
  );

  const handleChange = useCallback(
    (next: string) => {
      onDocChange({ ...docRef.current, raw_content: next });
    },
    [onDocChange],
  );

  const syncRevision = forceSyncRevision + conflictRevision;
  const paper = post.paper_style || doc.paper_style || '';

  if (!canInlineEditBody(post.doc_format, post.published_content, !!post.primary_attachment)) {
    return (
      <Alert
        type="info"
        showIcon
        message="此类型文档需在完整编辑页修改"
        description={
          <Link to={fullEditHref}>
            <Button type="primary" size="small" style={{ marginTop: 8 }}>
              打开完整编辑
            </Button>
          </Link>
        }
      />
    );
  }

  if (post.doc_format === 'html') {
    const legacyUrl =
      !doc.raw_content?.trim() && primaryUrl && doc.doc_format === 'html'
        ? primaryUrl
        : null;
    return (
      <div className={`paper ${paperClassName(paper)} jz-post-inline-editor jz-post-inline-html`}>
        <HtmlEditor
          key={`inline-html-${doc.id}-${syncRevision}`}
          value={doc.raw_content}
          onChange={handleChange}
          onAutoSave={handleAutoSave}
          documentId={doc.id}
          legacyAttachmentUrl={legacyUrl}
          onSaveReady={onSaveReady}
          showPreviewPane
        />
      </div>
    );
  }

  return (
    <div className={`paper ${paperClassName(paper)} jz-post-inline-editor jz-post-inline-rich`}>
      <RichTextEditor
        key={`inline-rich-${doc.id}-${syncRevision}`}
        value={doc.raw_content}
        onChange={handleChange}
        onAutoSave={handleAutoSave}
        documentId={doc.id}
        paperStyle={paper}
        forceSyncRevision={syncRevision}
        onSaveReady={onSaveReady}
      />
    </div>
  );
}

/** Resolve primary attachment URL for HTML legacy hydration. */
export function resolvePostPrimaryUrl(post: PublicPostDetail): string | null {
  const att = post.primary_attachment;
  if (!att?.url) return null;
  return attachmentAbsoluteUrl(att.url);
}
