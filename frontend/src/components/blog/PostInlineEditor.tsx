import { useCallback, useRef, useState } from 'react';
import { Alert, Button, Switch, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import RichTextEditor from '@/components/editor/RichTextEditor';
import HtmlEditor from '@/components/editor/HtmlEditor';
import type { EditorSaveHandle } from '@/components/editor/editorSaveLifecycle';
import { paperClassName } from '@/utils/paper';
import { patchDocumentBody } from '@/utils/documentSave';
import { updateDocument } from '@/api/docs';
import type { DocFormat, DocumentDetail, PublicPostDetail } from '@/types';

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
      // Write both copies so the edit ships to the blog (published_content) and
      // keeps the private working copy (raw_content) in sync.
      const updated = await patchDocumentBody(docRef.current, content, onConflict);
      onDocChange({ ...docRef.current, ...updated });
    },
    [onDocChange, onConflict],
  );

  const handleChange = useCallback(
    (next: string) => {
      onDocChange({ ...docRef.current, raw_content: next, published_content: next });
    },
    [onDocChange],
  );

  // Toggle Yuque-style heading numbering (same per-document flag as the full
  // editor). We must write the returned doc — including its bumped ``version``
  // — back via onDocChange so the next raw_content autosave doesn't 409 on a
  // stale version.
  const handleNumberingChange = useCallback(
    async (heading_numbering: boolean) => {
      const next = await updateDocument(docRef.current.id, { heading_numbering });
      // Keep the live (possibly-unsaved) body in both copies — the server echo is
      // only as fresh as the last autosave — but adopt the bumped ``version`` so
      // the next body autosave doesn't 409.
      onDocChange({
        ...next,
        raw_content: docRef.current.raw_content,
        published_content: docRef.current.published_content,
      });
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
      <div className="jz-post-inline-toolbar">
        <Tooltip title="章节标题自动编号（1 / 1.1 / 1.1.1，仅显示不改源码；与完整编辑页同步）">
          <span>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>
              编号
            </Typography.Text>
            <Switch
              size="small"
              checked={doc.heading_numbering}
              onChange={(checked) => void handleNumberingChange(checked)}
            />
          </span>
        </Tooltip>
      </div>
      <RichTextEditor
        key={`inline-rich-${doc.id}-${syncRevision}`}
        value={doc.raw_content}
        onChange={handleChange}
        onAutoSave={handleAutoSave}
        documentId={doc.id}
        paperStyle={paper}
        headingNumbering={doc.heading_numbering}
        forceSyncRevision={syncRevision}
        onSaveReady={onSaveReady}
      />
    </div>
  );
}
