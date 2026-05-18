import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Empty,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import {
  ArrowLeftOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  ExportOutlined,
  HistoryOutlined,
  RocketOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/notify';
import { formatApiError } from '@/api/client';
import * as docsApi from '@/api/docs';
import * as kbsApi from '@/api/kbs';
import * as attApi from '@/api/attachments';
import { attachmentAbsoluteUrl } from '@/api/attachments';
import MarkdownEditor from '@/components/editor/MarkdownEditor';
import RichTextEditor from '@/components/editor/RichTextEditor';
import PdfCanvas from '@/components/common/PdfCanvas';
import FullscreenableIframe from '@/components/common/FullscreenableIframe';
import BacklinkPanel from '@/components/common/BacklinkPanel';
import TagPicker from '@/components/common/TagPicker';
import CommentsPanel from '@/components/common/CommentsPanel';
import AttachmentPanel from '@/components/common/AttachmentPanel';
import VersionsDrawer from './VersionsDrawer';
import ExportDialog from '@/components/common/ExportDialog';
import { PAPER_STYLES } from '@/utils/paper';
import type { DocFormat, DocumentDetail, KnowledgeBase, Visibility } from '@/types';

type EditorMode = 'markdown' | 'rich' | 'html' | 'pdf';
const EDITOR_MODE_KEY = 'jianzhai:editorMode';

function defaultModeFor(format: DocFormat | undefined, fallback: EditorMode): EditorMode {
  switch (format) {
    case 'pdf':
      return 'pdf';
    case 'html':
      return 'html';
    case 'docx':
      return 'html'; // viewer surface; user can switch to markdown to edit body
    default:
      return fallback;
  }
}

const { Text } = Typography;

export default function DocEditorPage() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const [searchParams] = useSearchParams();
  /** When the editor was opened from a blog post via the inline-edit button,
   * a `?return=/posts/<slug>` is appended so we can offer a one-click jump
   * back to the public view instead of staying inside the admin UI. */
  const returnTo = searchParams.get('return');
  const kbId = Number(id);
  const documentId = Number(docId);
  const navigate = useNavigate();

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<EditorMode>(() => {
    const saved = localStorage.getItem(EDITOR_MODE_KEY);
    return saved === 'rich' ? 'rich' : 'markdown';
  });
  const [modeTouched, setModeTouched] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [uploadingPrimary, setUploadingPrimary] = useState(false);

  useEffect(() => {
    void kbsApi.getKB(kbId).then(setKb);
  }, [kbId]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    docsApi
      .getDocument(documentId)
      .then((d) => {
        setDoc(d);
        if (!modeTouched) {
          setMode(
            defaultModeFor(d.doc_format, (localStorage.getItem(EDITOR_MODE_KEY) as EditorMode) || 'markdown')
          );
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    // Reset the touched flag when switching docs so format-derived mode applies.
    setModeTouched(false);
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'markdown' || mode === 'rich') {
      localStorage.setItem(EDITOR_MODE_KEY, mode);
    }
  }, [mode]);

  const handleAutoSave = useCallback(
    async (content: string) => {
      if (!doc) return;
      const updated = await docsApi.updateDocument(doc.id, { raw_content: content });
      setDoc((prev) => (prev ? { ...prev, ...updated } : updated));
    },
    [doc]
  );

  async function handleDelete() {
    if (!doc) return;
    try {
      await docsApi.deleteDocument(doc.id);
      message.success('文档已删除');
      navigate(`/admin/kbs/${kbId}`);
    } catch (err) {
      message.error(formatApiError(err, '删除失败'));
    }
  }

  async function handlePublishToggle() {
    if (!doc) return;
    try {
      const next =
        doc.status === 'published'
          ? await docsApi.unpublishDocument(doc.id)
          : await docsApi.publishDocument(doc.id);
      setDoc(next);
      message.success(doc.status === 'published' ? '已撤回发布' : '已发布');
    } catch (err) {
      message.error(formatApiError(err, '操作失败'));
    }
  }

  async function handleVisibilityChange(visibility: Visibility) {
    if (!doc) return;
    const next = await docsApi.updateDocument(doc.id, { visibility });
    setDoc(next);
  }

  async function handlePaperStyleChange(paper_style: string) {
    if (!doc) return;
    const next = await docsApi.updateDocument(doc.id, { paper_style });
    setDoc(next);
  }

  async function handleRename(title: string) {
    if (!doc || !title.trim()) return;
    const next = await docsApi.updateDocument(doc.id, { title: title.trim() });
    setDoc(next);
  }

  async function handlePrimaryUpload(file: File) {
    if (!doc) return;
    setUploadingPrimary(true);
    try {
      await attApi.uploadFile(file, doc.id);
      const fresh = await docsApi.getDocument(doc.id);
      setDoc(fresh);
      // Snap the viewer to whatever format the upload produced.
      setMode(defaultModeFor(fresh.doc_format, mode));
      message.success(`${file.name} 已附加`);
    } catch (err) {
      message.error(formatApiError(err, '上传失败'));
    } finally {
      setUploadingPrimary(false);
    }
  }

  if (notFound) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" message="文档不存在或已删除" />
        <div style={{ marginTop: 12 }}>
          <Link to={`/admin/kbs/${kbId}`}>← 返回知识库</Link>
        </div>
      </div>
    );
  }
  if (loading || !doc) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 400 }}>
        <Spin />
      </div>
    );
  }

  const primary = doc.primary_attachment;
  const primaryUrl = primary ? attachmentAbsoluteUrl(primary.url) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
      {/* HEADER ROW — runs full width, single line, title left-aligned with controls flowing to the right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 12,
          borderBottom: '1px solid var(--jz-border)',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        {returnTo ? (
          <Tooltip title="返回博客视图">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(returnTo)}
            />
          </Tooltip>
        ) : (
          <Tooltip title="返回知识库">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/admin/kbs/${kbId}`)}
            />
          </Tooltip>
        )}
        {kb && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            <Link to={`/admin/kbs/${kb.id}`}>{kb.name}</Link>
            <span style={{ margin: '0 6px', opacity: 0.5 }}>/</span>
          </Text>
        )}
        <Typography.Title
          level={3}
          editable={{ onChange: handleRename, triggerType: ['text', 'icon'] }}
          style={{ margin: 0, flex: 1, minWidth: 220 }}
        >
          {doc.title}
        </Typography.Title>

        <Space wrap size={8}>
          <Segmented
            value={mode}
            onChange={(v) => {
              setMode(v as EditorMode);
              setModeTouched(true);
            }}
            options={[
              { label: 'Markdown', value: 'markdown' },
              { label: '富文本', value: 'rich' },
              { label: 'HTML', value: 'html' },
              { label: 'PDF', value: 'pdf' },
            ]}
          />
          <Select
            style={{ minWidth: 130 }}
            value={doc.paper_style || ''}
            onChange={(v) => handlePaperStyleChange(v)}
            options={PAPER_STYLES.map((p) => ({ value: p.key, label: `纸张：${p.label}` }))}
          />
          <Tag color={doc.status === 'published' ? 'green' : 'default'}>
            {doc.status === 'published' ? '已发布' : '草稿'}
          </Tag>
          <Space size={4}>
            <Text type="secondary">公开</Text>
            <Switch
              size="small"
              checked={doc.visibility === 'public'}
              onChange={(checked) => handleVisibilityChange(checked ? 'public' : 'private')}
            />
          </Space>
          <Button icon={<HistoryOutlined />} onClick={() => setVersionsOpen(true)}>
            历史
          </Button>
          <Button icon={<ExportOutlined />} onClick={() => setExportOpen(true)}>
            导出
          </Button>
          <Button
            type={doc.status === 'published' ? 'default' : 'primary'}
            icon={doc.status === 'published' ? <StopOutlined /> : <RocketOutlined />}
            onClick={handlePublishToggle}
          >
            {doc.status === 'published' ? '撤回发布' : '发布'}
          </Button>
          <Popconfirm title="删除该文档？" onConfirm={handleDelete}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>

      <div style={{ marginBottom: 12 }}>
        <TagPicker key={doc.id} target={{ kind: 'document', id: doc.id }} />
      </div>

      <div style={{ flex: 1, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
        <EditorSurface
          mode={mode}
          doc={doc}
          primaryUrl={primaryUrl}
          onChange={(next) =>
            setDoc((prev) => (prev ? { ...prev, raw_content: next } : prev))
          }
          onAutoSave={handleAutoSave}
          onSwitchToMarkdown={() => {
            setMode('markdown');
            setModeTouched(true);
          }}
          onUploadPrimary={handlePrimaryUpload}
          uploadingPrimary={uploadingPrimary}
        />
      </div>

      <BacklinkPanel documentId={doc.id} variant="admin" />
      <AttachmentPanel key={`att-${doc.id}`} documentId={doc.id} />
      <CommentsPanel key={doc.id} documentId={doc.id} />

      <VersionsDrawer
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        documentId={doc.id}
        onRestored={async () => {
          const fresh = await docsApi.getDocument(doc.id);
          setDoc(fresh);
        }}
      />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        scope="doc"
        targetId={doc.id}
        targetLabel={doc.title}
        allowSiteFormat={false}
      />
    </div>
  );
}

interface SurfaceProps {
  mode: EditorMode;
  doc: DocumentDetail;
  primaryUrl: string | null;
  onChange: (next: string) => void;
  onAutoSave: (next: string) => Promise<void>;
  onSwitchToMarkdown: () => void;
  onUploadPrimary: (file: File) => Promise<void> | void;
  uploadingPrimary: boolean;
}

function EditorSurface({
  mode,
  doc,
  primaryUrl,
  onChange,
  onAutoSave,
  onSwitchToMarkdown,
  onUploadPrimary,
  uploadingPrimary,
}: SurfaceProps) {
  if (mode === 'pdf') {
    if (!primaryUrl) {
      return (
        <MissingAttachment
          format="PDF"
          accept=".pdf,application/pdf"
          uploading={uploadingPrimary}
          onUpload={onUploadPrimary}
          onSwitchToMarkdown={onSwitchToMarkdown}
        />
      );
    }
    if (doc.doc_format !== 'pdf') {
      return (
        <Empty
          description={
            <span>
              当前文档不是 PDF（主附件为 <code>{doc.primary_attachment?.original_filename}</code>）。
            </span>
          }
        />
      );
    }
    return <PdfCanvas url={primaryUrl} height="min(78vh, 760px)" />;
  }
  if (mode === 'html') {
    if (!primaryUrl) {
      return (
        <MissingAttachment
          format="HTML"
          accept=".html,.htm,text/html"
          uploading={uploadingPrimary}
          onUpload={onUploadPrimary}
          onSwitchToMarkdown={onSwitchToMarkdown}
        />
      );
    }
    return (
      <FullscreenableIframe
        title={doc.primary_attachment?.original_filename ?? doc.title}
        src={primaryUrl}
        inlineStyle={{
          width: '100%',
          height: 'min(calc(100vh - 240px), 1080px)',
          minHeight: 600,
          border: '1px solid var(--jz-border)',
          borderRadius: 8,
          /* Keep a neutral white fallback — the iframe contents are usually
             HTML pages authored against a light background. The container
             border + radius come from the theme, so this still feels native
             on dark palettes. */
          background: '#fff',
        }}
      />
    );
  }
  if (mode === 'rich') {
    return (
      <RichTextEditor
        key={`rich-${doc.id}`}
        value={doc.raw_content}
        onChange={onChange}
        onAutoSave={onAutoSave}
      />
    );
  }
  return (
    <MarkdownEditor
      key={`md-${doc.id}`}
      value={doc.raw_content}
      onChange={onChange}
      onAutoSave={onAutoSave}
    />
  );
}

interface MissingProps {
  format: string;
  accept: string;
  uploading: boolean;
  onUpload: (file: File) => Promise<void> | void;
  onSwitchToMarkdown: () => void;
}

function MissingAttachment({ format, accept, uploading, onUpload, onSwitchToMarkdown }: MissingProps) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: 48,
        border: '1px dashed var(--jz-border)',
        borderRadius: 12,
        background: 'var(--jz-surface-2)',
      }}
    >
      <Space direction="vertical" align="center" size="middle">
        <Text type="secondary">该文档还没有 {format} 主附件</Text>
        <Space>
          <Upload
            accept={accept}
            showUploadList={false}
            beforeUpload={(file) => {
              void onUpload(file);
              return false;
            }}
          >
            <Button type="primary" icon={<CloudUploadOutlined />} loading={uploading}>
              上传 {format} 文件
            </Button>
          </Upload>
          <Button onClick={onSwitchToMarkdown}>回到 Markdown 编辑</Button>
        </Space>
      </Space>
    </div>
  );
}
