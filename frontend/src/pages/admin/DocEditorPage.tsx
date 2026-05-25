import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Modal,
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
  CloudUploadOutlined,
  CompressOutlined,
  DeleteOutlined,
  EllipsisOutlined,
  ExportOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  UnorderedListOutlined,
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
import HtmlEditor from '@/components/editor/HtmlEditor';
import DocumentOutline from '@/components/editor/DocumentOutline';
import FindReplacePanel from '@/components/editor/FindReplacePanel';
import type { Editor as TiptapEditor } from '@tiptap/core';
import PdfCanvas from '@/components/common/PdfCanvas';
import BacklinkPanel from '@/components/common/BacklinkPanel';
import TagPicker from '@/components/common/TagPicker';
import CommentsPanel from '@/components/common/CommentsPanel';
import AttachmentPanel from '@/components/common/AttachmentPanel';
import VersionsDrawer from './VersionsDrawer';
import PublishCheckModal, {
  buildPublishChecks,
  hasPublishBlockers,
} from '@/components/admin/PublishCheckModal';
import ExportDialog from '@/components/common/ExportDialog';
import { AdminBackButton } from '@/components/admin/AdminPageHeader';
import { SelectionAI } from '@/components/common/SelectionAI';
import { DocAIPanel } from '@/components/common/DocAIPanel';
import { DocStatsPanel } from '@/components/common/DocStatsPanel';
import {
  JzOutlineIcon,
  JzBacklinkIcon,
  JzCommentIcon,
  JzAttachmentIcon,
} from '@/components/common/JzIcon';
import { PAPER_STYLES } from '@/utils/paper';
import type { DocFormat, DocumentDetail, KnowledgeBase, Visibility } from '@/types';

type EditorMode = 'markdown' | 'rich' | 'html' | 'pdf';
const EDITOR_MODE_KEY = 'jianzhai:editorMode';

function defaultModeFor(
  format: DocFormat | undefined,
  fallback: EditorMode,
  rawContent?: string,
): EditorMode {
  switch (format) {
    case 'pdf':
      return 'pdf';
    case 'html':
      return 'html';
    case 'docx':
      // When DOCX extraction succeeded → rich (best WYSIWYG fidelity).
      // When the backend returned no body (mammoth missing, malformed file)
      // → markdown so the user lands in a writable surface (HTML mode would
      // hand them an empty source pane and a static iframe with nothing).
      return rawContent?.trim() ? 'rich' : 'markdown';
    default:
      return fallback;
  }
}

const { Text } = Typography;

export type DocEditorShell = 'admin' | 'blog';

export interface DocEditorPageProps {
  kbIdOverride?: number;
  docIdOverride?: number;
  returnToOverride?: string;
  shell?: DocEditorShell;
}

export default function DocEditorPage({
  kbIdOverride,
  docIdOverride,
  returnToOverride,
  shell = 'admin',
}: DocEditorPageProps = {}) {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const [searchParams] = useSearchParams();
  /** Blog edit uses `returnToOverride`; admin may pass `?return=/posts/<slug>`. */
  const returnTo = returnToOverride ?? searchParams.get('return');
  const modeFromUrl = searchParams.get('mode');
  const kbId = kbIdOverride ?? Number(id);
  const documentId = docIdOverride ?? Number(docId);
  const navigate = useNavigate();
  const isBlogShell = shell === 'blog';
  const glassClass = isBlogShell
    ? 'jz-blog-glass jz-glass jz-doc-shell-blog'
    : 'jz-admin-glass jz-glass';

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
  const [publishCheckOpen, setPublishCheckOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingPrimary, setUploadingPrimary] = useState(false);
  // 大纲面板（右侧）。editor / textarea 由编辑器组件通过 onReady 回调上抬。
  const [outlineOpen, setOutlineOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('jz-outline-open') !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('jz-outline-open', String(outlineOpen));
    } catch {
      /* localStorage unavailable */
    }
  }, [outlineOpen]);

  type SidebarTab = 'outline' | 'backlinks' | 'comments' | 'attachments';
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => {
    const saved = localStorage.getItem('jz-sidebar-tab');
    return (saved === 'outline' || saved === 'backlinks' || saved === 'comments' || saved === 'attachments') ? saved : 'outline';
  });
  useEffect(() => {
    try { localStorage.setItem('jz-sidebar-tab', sidebarTab); } catch { /* noop */ }
  }, [sidebarTab]);

  const hasPendingChangesRef = useRef(false);

  const [richEditor, setRichEditor] = useState<TiptapEditor | null>(null);
  const [mdTextarea, setMdTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [htmlTextarea, setHtmlTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Ctrl/⌘+F → 唤起查找面板；F9 → 切换专注写作模式
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        if (mode === 'rich' || mode === 'markdown' || mode === 'html') {
          e.preventDefault();
          setFindOpen(true);
        }
      }
      if (e.key === 'F9') {
        e.preventDefault();
        setFocusMode((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // Escape 退出专注模式（避免干扰编辑器内的 Escape 处理，只在 focusMode 时挂载）
  useEffect(() => {
    if (!focusMode) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setFocusMode(false);
    }
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [focusMode]);

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
          if (modeFromUrl === 'html') {
            setMode('html');
          } else {
            setMode(
              defaultModeFor(
                d.doc_format,
                (localStorage.getItem(EDITOR_MODE_KEY) as EditorMode) || 'markdown',
                d.raw_content,
              ),
            );
          }
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

  // Warn before navigating away if there are unsaved changes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasPendingChangesRef.current) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []); // empty deps — the ref always has the latest value

  const saveGenRef = useRef(0);

  const handleAutoSave = useCallback(
    async (content: string) => {
      if (!doc) return;
      const gen = ++saveGenRef.current;
      try {
        const updated = await docsApi.updateDocument(doc.id, {
          raw_content: content,
          expected_version: doc.version,
        });
        if (gen !== saveGenRef.current) return;
        setDoc((prev) => (prev ? { ...prev, ...updated } : updated));
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { code?: string; document?: DocumentDetail; current_version?: number } } };
        if (e?.response?.status === 409 && e.response.data?.code === 'version_conflict') {
          const live = e.response.data.document;
          message.warning('文档已被其他端修改，已加载最新版本');
          if (live) setDoc(live);
          throw new Error('version_conflict');
        }
        throw err;
      }
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
    if (doc.status === 'published') {
      try {
        const next = await docsApi.unpublishDocument(doc.id);
        setDoc(next);
        message.success('已撤回发布');
      } catch (err) {
        message.error(formatApiError(err, '操作失败'));
      }
      return;
    }
    setPublishCheckOpen(true);
  }

  async function confirmPublish() {
    if (!doc) return;
    const checks = buildPublishChecks(doc, kb);
    if (hasPublishBlockers(checks)) return;
    setPublishing(true);
    try {
      const next = await docsApi.publishDocument(doc.id);
      setDoc(next);
      message.success('已发布');
      setPublishCheckOpen(false);
    } catch (err) {
      message.error(formatApiError(err, '操作失败'));
    } finally {
      setPublishing(false);
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
      setMode(defaultModeFor(fresh.doc_format, mode, fresh.raw_content));
      message.success(`${file.name} 已附加`);
    } catch (err) {
      message.error(formatApiError(err, '上传失败'));
    } finally {
      setUploadingPrimary(false);
    }
  }

  if (notFound) {
    return (
      <div className={glassClass} style={{ padding: 24 }}>
        <Alert type="error" message="文档不存在或已删除" />
        <div style={{ marginTop: 12 }}>
          {returnTo ? (
            <AdminBackButton backTo={returnTo} backLabel="文章" backTitle="返回文章" size="compact" />
          ) : (
            <AdminBackButton
              backTo={`/admin/kbs/${kbId}`}
              backLabel="知识库"
              backTitle="返回知识库"
              size="compact"
            />
          )}
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

  const docAccentStyle = {
    ['--jz-doc-accent' as string]: kb?.accent_color || 'var(--jz-accent)',
  } as React.CSSProperties;

  const kbPublicHref =
    kb && isBlogShell
      ? `/kb/${encodeURIComponent(kb.slug)}`
      : kb
        ? `/admin/kbs/${kb.id}`
        : '#';

  return (
    <div
      className={focusMode ? (isBlogShell ? 'jz-blog-glass jz-glass jz-doc-shell-blog' : undefined) : glassClass}
      style={{
        ...docAccentStyle,
        ...(focusMode
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 999,
              background: 'var(--jz-bg-app)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }
          : {
              display: 'flex',
              flexDirection: 'column',
              minHeight: 'calc(100vh - 120px)',
            }),
      }}
    >
      {/* 专注模式顶栏 */}
      {focusMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 24px',
            borderBottom: '1px solid var(--jz-border)',
            background: 'var(--jz-surface)',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <Typography.Title level={4} style={{ margin: 0, flex: 1, fontSize: 16 }}>
            {doc.title}
          </Typography.Title>
          <Tag color={doc.status === 'published' ? 'green' : 'default'}>
            {doc.status === 'published' ? '已发布' : '草稿'}
          </Tag>
          <Tooltip title="退出专注写作模式 (Esc / F9)">
            <Button icon={<CompressOutlined />} onClick={() => setFocusMode(false)}>
              退出专注
            </Button>
          </Tooltip>
        </div>
      )}

      {/* HEADER ROW — sticky 顶栏，滚动时保持在视图顶端 */}
      <div
        className={focusMode ? '' : 'jz-doc-header-bar'}
        style={{
          display: focusMode ? 'none' : 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {returnTo || isBlogShell ? (
          <AdminBackButton
            backLabel={isBlogShell ? '文章' : '博客'}
            backTitle={isBlogShell ? '返回文章阅读页' : '返回博客视图'}
            onBack={() => navigate(returnTo || '/')}
          />
        ) : (
          <AdminBackButton
            backLabel="知识库"
            backTitle="返回知识库"
            onBack={() => navigate(`/admin/kbs/${kbId}`)}
          />
        )}
        {kb && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            <Link to={kbPublicHref}>{kb.name}</Link>
            <span style={{ margin: '0 6px', opacity: 0.5 }}>/</span>
          </Text>
        )}
        <div className="jz-doc-header-title-wrap">
          <Typography.Title
            level={2}
            editable={{ onChange: handleRename, triggerType: ['text', 'icon'] }}
            className="jz-doc-header-title"
          >
            {doc.title}
          </Typography.Title>
          <div className="jz-doc-header-meta">
            <Tag color={doc.status === 'published' ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>
              {doc.status === 'published' ? '已发布' : '草稿'}
            </Tag>
            <span className="jz-doc-header-meta-divider" aria-hidden>·</span>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>公开</Text>
              <Switch
                size="small"
                checked={doc.visibility === 'public'}
                onChange={(checked) => handleVisibilityChange(checked ? 'public' : 'private')}
              />
            </Space>
            <span className="jz-doc-header-meta-divider" aria-hidden>·</span>
            <Tooltip title="纸张样式">
              <Select
                size="small"
                style={{ minWidth: 108 }}
                value={doc.paper_style || ''}
                onChange={(v) => handlePaperStyleChange(v)}
                variant="borderless"
                options={PAPER_STYLES.map((p) => ({ value: p.key, label: `${p.label}` }))}
              />
            </Tooltip>
          </div>
        </div>

        <Space wrap size={8}>
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => {
              setMode(v as EditorMode);
              setModeTouched(true);
            }}
            options={[
              { label: 'MD', value: 'markdown' },
              { label: '富文本', value: 'rich' },
              { label: 'HTML', value: 'html' },
              { label: 'PDF', value: 'pdf' },
            ]}
          />
          <Tooltip title={outlineOpen ? '隐藏大纲' : '显示大纲'}>
            <Button
              icon={<UnorderedListOutlined />}
              type={outlineOpen ? 'primary' : 'text'}
              className="jz-toolbar-btn"
              onClick={() => setOutlineOpen((v) => !v)}
              aria-pressed={outlineOpen}
            />
          </Tooltip>
          <Tooltip title="专注写作模式 (F9)">
            <Button icon={<FullscreenOutlined />} onClick={() => setFocusMode(true)} />
          </Tooltip>
          <Button
            type={doc.status === 'published' ? 'default' : 'primary'}
            icon={doc.status === 'published' ? <StopOutlined /> : <RocketOutlined />}
            onClick={handlePublishToggle}
          >
            {doc.status === 'published' ? '撤回发布' : '发布'}
          </Button>
          <Dropdown
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'history',
                  icon: <HistoryOutlined />,
                  label: '版本历史',
                  onClick: () => setVersionsOpen(true),
                },
                {
                  key: 'export',
                  icon: <ExportOutlined />,
                  label: '导出文档',
                  onClick: () => setExportOpen(true),
                },
                { type: 'divider' as const },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除文档',
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: '确认删除该文档？',
                      content: '文档将进入回收站，可在回收站中恢复。',
                      okType: 'danger',
                      okText: '删除',
                      cancelText: '取消',
                      onOk: handleDelete,
                    });
                  },
                },
              ],
            }}
            popupRender={(menu) => (
              <div className="jz-doc-more-dropdown">
                {menu}
                <div className="jz-doc-more-divider" />
                <DocStatsPanel documentId={doc.id} />
              </div>
            )}
          >
            <Button icon={<EllipsisOutlined />} />
          </Dropdown>
        </Space>
      </div>

      {!focusMode && (
        <div className="jz-doc-tags-bar">
          <TagPicker key={doc.id} target={{ kind: 'document', id: doc.id }} />
        </div>
      )}

      <div
        className={focusMode ? '' : 'jz-doc-body'}
        style={{
          ['--jz-doc-accent' as string]: kb?.accent_color || 'var(--jz-accent)',
          ...(focusMode
            ? {
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                maxWidth: isBlogShell ? 'min(1400px, 96vw)' : 800,
                width: '100%',
                margin: '0 auto',
                padding: '16px 24px 40px',
                minWidth: 0,
              }
            : {
                flex: 1,
                minHeight: 480,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }),
        }}
      >
        <div className="jz-doc-editor-col" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <EditorSurface
            mode={mode}
            doc={doc}
            primaryUrl={primaryUrl}
            onChange={(next) => {
              hasPendingChangesRef.current = true;
              setDoc((prev) => (prev ? { ...prev, raw_content: next } : prev));
            }}
            onAutoSave={async (content) => {
              await handleAutoSave(content);
              hasPendingChangesRef.current = false;
            }}
            onSwitchToMarkdown={() => {
              setMode('markdown');
              setModeTouched(true);
            }}
            onUploadPrimary={handlePrimaryUpload}
            uploadingPrimary={uploadingPrimary}
            onRichEditorReady={setRichEditor}
            onMarkdownTextareaReady={setMdTextarea}
            onHtmlTextareaReady={setHtmlTextarea}
          />
        </div>
        {outlineOpen && mode !== 'pdf' && !focusMode && (
          <aside className="jz-editor-sidebar jz-editor-sidebar-floating">
            <div className="jz-editor-sidebar-tabs">
              {([
                { key: 'outline' as const, icon: <JzOutlineIcon />, label: '大纲' },
                { key: 'backlinks' as const, icon: <JzBacklinkIcon />, label: '反链' },
                { key: 'comments' as const, icon: <JzCommentIcon />, label: '评论' },
                { key: 'attachments' as const, icon: <JzAttachmentIcon />, label: '附件' },
              ]).map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={`jz-sidebar-tab${sidebarTab === t.key ? ' is-active' : ''}`}
                  onClick={() => setSidebarTab(t.key)}
                >
                  {t.icon}
                  <span className="jz-sidebar-tab-label">{t.label}</span>
                </button>
              ))}
              <button type="button" className="jz-sidebar-close" onClick={() => setOutlineOpen(false)} aria-label="关闭面板">✕</button>
            </div>
            <div className="jz-editor-sidebar-body">
              {sidebarTab === 'outline' && (
                <DocumentOutline
                  editor={mode === 'rich' ? richEditor : null}
                  source={mode === 'markdown' || mode === 'html' ? doc.raw_content : undefined}
                  sourceKind={mode === 'html' ? 'html' : 'markdown'}
                  onSeek={(pos) => {
                    if (mode === 'html' && htmlTextarea) {
                      seekTextarea(htmlTextarea, pos, doc.raw_content);
                    } else if (mode === 'markdown' && mdTextarea) {
                      seekTextarea(mdTextarea, pos, doc.raw_content);
                    }
                  }}
                />
              )}
              {sidebarTab === 'backlinks' && <BacklinkPanel documentId={doc.id} variant="admin" compact />}
              {sidebarTab === 'comments' && <CommentsPanel key={doc.id} documentId={doc.id} compact />}
              {sidebarTab === 'attachments' && <AttachmentPanel key={`att-${doc.id}`} documentId={doc.id} compact />}
            </div>
          </aside>
        )}
      </div>

      <FindReplacePanel
        open={findOpen}
        onClose={() => setFindOpen(false)}
        editor={mode === 'rich' ? richEditor : null}
        textarea={
          mode === 'markdown' ? mdTextarea : mode === 'html' ? htmlTextarea : null
        }
        source={
          mode === 'markdown' || mode === 'html' ? doc.raw_content : undefined
        }
        onSourceChange={
          mode === 'markdown' || mode === 'html'
            ? (next) => setDoc((prev) => (prev ? { ...prev, raw_content: next } : prev))
            : undefined
        }
      />

      <PublishCheckModal
        open={publishCheckOpen}
        items={buildPublishChecks(doc, kb)}
        loading={publishing}
        onConfirm={() => void confirmPublish()}
        onCancel={() => setPublishCheckOpen(false)}
      />

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

      {/* AI 助手 — 选区 ✨ + 右下角浮窗，覆盖所有编辑模式 (md/rich/html) */}
      <SelectionAI contextProvider={() => doc.raw_content} />
      {(mode === 'markdown' || mode === 'rich' || mode === 'html') && (
        <DocAIPanel content={doc.raw_content} title={doc.title} />
      )}
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
  /** Outline / find-replace want the live editor instance — lift it. */
  onRichEditorReady?: (editor: TiptapEditor | null) => void;
  onMarkdownTextareaReady?: (el: HTMLTextAreaElement | null) => void;
  onHtmlTextareaReady?: (el: HTMLTextAreaElement | null) => void;
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
  onRichEditorReady,
  onMarkdownTextareaReady,
  onHtmlTextareaReady,
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
    // 新文档：允许直接进入空编辑器（用户从 0 写 HTML）；老文档：若 raw_content
    // 为空但有 .html 附件，把附件 URL 传给 HtmlEditor，由它自动 fetch + 解码
    // 后写回 raw_content。
    const legacyUrl =
      !doc.raw_content && primaryUrl && doc.doc_format === 'html' ? primaryUrl : null;
    return (
      <HtmlEditor
        key={`html-${doc.id}`}
        value={doc.raw_content}
        onChange={onChange}
        onAutoSave={onAutoSave}
        documentId={doc.id}
        legacyAttachmentUrl={legacyUrl}
        onTextareaReady={onHtmlTextareaReady}
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
        documentId={doc.id}
        onEditorReady={onRichEditorReady}
        paperStyle={doc.paper_style}
      />
    );
  }
  return (
    <MarkdownEditor
      key={`md-${doc.id}`}
      value={doc.raw_content}
      onChange={onChange}
      onAutoSave={onAutoSave}
      documentId={doc.id}
      onTextareaReady={onMarkdownTextareaReady}
      paperStyle={doc.paper_style}
    />
  );
}

/** Move the textarea selection to ``pos`` and scroll the line into view. */
function seekTextarea(ta: HTMLTextAreaElement, pos: number, source: string) {
  ta.focus();
  ta.setSelectionRange(pos, pos);
  const before = source.slice(0, pos);
  const lineIndex = before.split('\n').length - 1;
  const style = getComputedStyle(ta);
  const lh = parseFloat(style.lineHeight || '20') || 20;
  // 让目标行大约停在视口的 1/4 处，比贴顶更舒服
  ta.scrollTop = Math.max(0, lineIndex * lh - ta.clientHeight / 4);
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
