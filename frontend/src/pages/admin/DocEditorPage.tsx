import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  InfoCircleOutlined,
  UnorderedListOutlined,
  RocketOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/notify';
import { isAxiosError } from 'axios';
import { formatApiError } from '@/api/client';
import * as docsApi from '@/api/docs';
import {
  patchDocumentRawContent,
  patchPublishedContent,
  type VersionConflictInfo,
} from '@/utils/documentSave';
import * as kbsApi from '@/api/kbs';
import * as attApi from '@/api/attachments';
import { attachmentAbsoluteUrl } from '@/api/attachments';
import MarkdownEditor from '@/components/editor/MarkdownEditor';
import RichTextEditor from '@/components/editor/RichTextEditor';
import HtmlEditor from '@/components/editor/HtmlEditor';
import DocumentOutline from '@/components/editor/DocumentOutline';
import FindReplacePanel from '@/components/editor/FindReplacePanel';
import type { Editor as TiptapEditor } from '@tiptap/core';
import PdfCanvas from '@/components/common/LazyPdfCanvas';
import LazyPptxReader from '@/components/common/LazyPptxReader';
import BacklinkPanel from '@/components/common/BacklinkPanel';
import TagPicker from '@/components/common/TagPicker';
import CommentsPanel from '@/components/common/CommentsPanel';
import AttachmentPanel from '@/components/common/AttachmentPanel';
import VersionsDrawer from './VersionsDrawer';
import DocStatsDrawer from '@/components/admin/DocStatsDrawer';
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
import type { EditorSaveHandle } from '@/components/editor/editorSaveLifecycle';
import {
  textareaSurface,
  type EditorSurfaceHandle,
} from '@/components/editor/surface/EditorSurface';

type EditorMode = 'markdown' | 'rich' | 'html' | 'pdf' | 'pptx';
type ContentSource = 'raw' | 'published';

function editorModeStorageKey(docId: number, source: ContentSource): string {
  return `jianzhai:editorMode:${docId}:${source}`;
}

function loadStoredEditorMode(docId: number, source: ContentSource): EditorMode | null {
  try {
    const v = localStorage.getItem(editorModeStorageKey(docId, source));
    if (v === 'markdown' || v === 'rich' || v === 'html' || v === 'pdf' || v === 'pptx')
      return v;
  } catch {
    /* noop */
  }
  return null;
}

function defaultModeFor(
  format: DocFormat | undefined,
  fallback: EditorMode,
  rawContent?: string,
): EditorMode {
  switch (format) {
    case 'pdf':
      return 'pdf';
    case 'pptx':
      return 'pptx';
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
  const docRef = useRef<DocumentDetail | null>(null);
  const [localEditorBody, setLocalEditorBody] = useState('');
  const kbLoadSeqRef = useRef(0);
  const docLoadSeqRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<EditorMode>('markdown');
  const [modeTouched, setModeTouched] = useState(false);
  const [contentSource, setContentSource] = useState<ContentSource>('raw');
  const contentSourceRef = useRef<ContentSource>('raw');
  const [conflictSyncRevision, setConflictSyncRevision] = useState(0);
  const editorSaveRef = useRef<EditorSaveHandle | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
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

  useEffect(() => {
    contentSourceRef.current = contentSource;
  }, [contentSource]);

  const flushPendingEdits = useCallback(async () => {
    if (mode !== 'pdf' && mode !== 'pptx' && editorSaveRef.current) {
      await editorSaveRef.current.saveNow();
    }
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }
  }, [mode]);

  const registerEditorSave = useCallback((handle: EditorSaveHandle | null) => {
    editorSaveRef.current = handle;
  }, []);

  const [richEditor, setRichEditor] = useState<TiptapEditor | null>(null);
  const [mdSurface, setMdSurface] = useState<EditorSurfaceHandle | null>(null);
  const [htmlTextarea, setHtmlTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // HTML 模式的 textarea 包成 EditorSurface，与 MD(CM) 走同一套 seek / 查找接口
  const editorBodyRef = useRef('');
  useEffect(() => {
    editorBodyRef.current = localEditorBody;
  }, [localEditorBody]);
  const htmlSurface = useMemo(
    () => (htmlTextarea ? textareaSurface(htmlTextarea, () => editorBodyRef.current) : null),
    [htmlTextarea],
  );

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
        const active = document.activeElement;
        const inTitleField =
          active instanceof HTMLInputElement &&
          active.classList.contains('jz-doc-title-input');
        if (!inTitleField) {
          e.preventDefault();
          setFocusMode((v) => !v);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

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
    const seq = ++kbLoadSeqRef.current;
    void kbsApi.getKB(kbId).then((k) => {
      if (seq === kbLoadSeqRef.current) setKb(k);
    });
  }, [kbId]);

  useEffect(() => {
    const seq = ++docLoadSeqRef.current;
    setLoading(true);
    setNotFound(false);
    docsApi
      .getDocument(documentId)
      .then((d) => {
        if (seq !== docLoadSeqRef.current) return;
        setDoc(d);
        setLocalEditorBody(d.raw_content);
        setContentSource('raw');
        contentSourceRef.current = 'raw';
        if (!modeTouched) {
          const stored = loadStoredEditorMode(d.id, 'raw');
          if (modeFromUrl === 'html') {
            setMode('html');
          } else {
            setMode(
              defaultModeFor(d.doc_format, stored || 'markdown', d.raw_content),
            );
          }
        }
      })
      .catch(() => {
        if (seq === docLoadSeqRef.current) setNotFound(true);
      })
      .finally(() => {
        if (seq === docLoadSeqRef.current) setLoading(false);
      });
    setModeTouched(false);
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!doc) return;
    setLocalEditorBody(
      contentSource === 'published' ? doc.published_content : doc.raw_content,
    );
  }, [doc?.id, contentSource, conflictSyncRevision]);

  useEffect(() => {
    if (!doc) return;
    if (mode === 'markdown' || mode === 'rich' || mode === 'html') {
      localStorage.setItem(editorModeStorageKey(doc.id, contentSource), mode);
    }
  }, [mode, doc, contentSource]);

  // Warn before navigating away if there are unsaved changes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasPendingChangesRef.current) {
        e.preventDefault();
        // 部分浏览器（旧 Chrome / Safari）只认 returnValue，不设不弹确认框
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []); // empty deps — the ref always has the latest value

  const saveGenRef = useRef(0);

  /** 冲突对话框「恢复我的编辑」要在恢复后立即重保存，但 handleAutoSave 定义
   *  在 applyVersionConflict 之后 —— 经 ref 打破循环依赖。 */
  const retrySaveRef = useRef<((content: string) => Promise<void>) | null>(null);

  const applyVersionConflict = useCallback(
    (live: DocumentDetail | undefined, info?: VersionConflictInfo) => {
      if (!live) return false;
      richEditor?.commands.blur();
      setConflictSyncRevision((n) => n + 1);
      setDoc(live);
      // 正文类冲突不再静默丢弃本地编辑：先展示服务器版本，同时给用户
      // 「恢复我的编辑」的机会（attempted 已在 documentSave 里备份到本机）。
      if (info && (info.field === 'raw' || info.field === 'published')) {
        const attempted = info.attempted;
        Modal.confirm({
          title: '文档已被其他端修改',
          content:
            '已加载服务器上的最新版本。你可以恢复刚才的本地修改（将基于新版本重新保存，覆盖对方的正文改动），或保留服务器版本。本地修改已在本机备份。',
          okText: '恢复我的编辑',
          cancelText: '使用服务器版本',
          onOk: () => {
            setLocalEditorBody(attempted);
            // 外部同步会把恢复的内容标记为「已保存」，autosave 不会再触发 ——
            // 必须显式走一次保存（此时 docRef 已是新版本，expected_version 匹配）。
            void retrySaveRef.current?.(attempted).catch(() => {
              /* 失败提示已在保存链路内弹出 */
            });
          },
        });
        return true; // 已弹自己的对话框，documentSave 的默认提示不再重复
      }
      return false;
    },
    [richEditor],
  );

  const handleAutoSave = useCallback(
    async (content: string) => {
      const current = docRef.current;
      if (!current) return;
      const gen = ++saveGenRef.current;
      const source = contentSourceRef.current;
      const run = async () => {
        try {
          const updated =
            source === 'published'
              ? await patchPublishedContent(
                  current,
                  content,
                  applyVersionConflict,
                )
              : await patchDocumentRawContent(
                  current,
                  content,
                  applyVersionConflict,
                );
          if (gen !== saveGenRef.current) return;
          setDoc((prev) => (prev ? { ...prev, ...updated } : updated));
        } catch (err: unknown) {
          if (err instanceof Error && err.message === 'version_conflict') {
            throw err;
          }
          if (!isAxiosError(err)) {
            message.error(formatApiError(err, '保存失败'));
          }
          throw err;
        }
      };
      const p = run();
      saveInFlightRef.current = p;
      try {
        await p;
      } finally {
        if (saveInFlightRef.current === p) saveInFlightRef.current = null;
      }
    },
    [doc, applyVersionConflict],
  );

  useEffect(() => {
    retrySaveRef.current = handleAutoSave;
  }, [handleAutoSave]);

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

  async function handleUnpublish() {
    if (!doc) return;
    await flushPendingEdits();
    try {
      const next = await docsApi.unpublishDocument(doc.id, doc.version);
      setDoc(next);
      setContentSource('raw');
      message.success('已撤回发布');
    } catch (err) {
      message.error(formatApiError(err, '操作失败'));
    }
  }

  function handlePublishClick() {
    if (!doc) return;
    setPublishCheckOpen(true);
  }

  async function confirmPublish() {
    if (!doc) return;
    await flushPendingEdits();
    const fresh = await docsApi.getDocument(doc.id).catch(() => doc);
    const checks = buildPublishChecks(fresh, kb, {
      body: (fresh.raw_content || '').trim(),
    });
    if (hasPublishBlockers(checks)) return;
    setPublishing(true);
    try {
      const next = await docsApi.publishDocument(fresh.id, fresh.version);
      setDoc(next);
      message.success('已发布');
      setPublishCheckOpen(false);
    } catch (err) {
      message.error(formatApiError(err, '操作失败'));
    } finally {
      setPublishing(false);
    }
  }

  async function handleSyncPublished() {
    if (!doc) return;
    await flushPendingEdits();
    setPublishing(true);
    try {
      const fresh = await docsApi.getDocument(doc.id);
      const updated = await docsApi.updateDocument(fresh.id, {
        published_content: fresh.raw_content,
        expected_version: fresh.version,
      });
      setDoc(updated);
      message.success('发布版已更新');
    } catch (err) {
      message.error(formatApiError(err, '更新发布失败'));
    } finally {
      setPublishing(false);
    }
  }

  async function changeEditorMode(next: EditorMode) {
    if (next === mode) return;
    // HTML 文档切入富文本/Markdown 会被 tiptap-markdown 重新解析——脚本、
    // 样式、复杂布局被不可逆地压扁，5 秒后自动保存把残骸写回 raw_content。
    // 必须先经用户确认（版本历史是唯一回头路）。
    if (doc?.doc_format === 'html' && mode === 'html' && next !== 'html') {
      const ok = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '切换可能损坏 HTML 文档',
          content:
            '这是一篇 HTML 文档。转入富文本 / Markdown 编辑会重新解析内容，' +
            '不被编辑器支持的标签、样式和脚本将被丢弃，且编辑后自动保存会覆盖原文' +
            '（仅能从版本历史回滚）。确定继续？',
          okText: '仍要切换',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!ok) return;
    }
    await flushPendingEdits();
    setMode(next);
    setModeTouched(true);
  }

  async function changeContentSource(next: ContentSource) {
    if (next === contentSource || !doc) return;
    await flushPendingEdits();
    setContentSource(next);
    contentSourceRef.current = next;
    const stored = loadStoredEditorMode(doc.id, next);
    const body = next === 'published' ? doc.published_content : doc.raw_content;
    setMode(defaultModeFor(doc.doc_format, stored || mode, body));
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

  async function handleHeadingNumberingChange(heading_numbering: boolean) {
    if (!doc) return;
    const next = await docsApi.updateDocument(doc.id, { heading_numbering });
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

  const editorBody = localEditorBody;
  const publishOutOfSync =
    doc.status === 'published' && doc.raw_content !== doc.published_content;
  const aiContext = editorBody;

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
          <Tooltip title={outlineOpen ? '隐藏大纲' : '显示大纲'}>
            <Button
              icon={<UnorderedListOutlined />}
              type={outlineOpen ? 'primary' : 'text'}
              onClick={() => setOutlineOpen((v) => !v)}
              aria-pressed={outlineOpen}
            />
          </Tooltip>
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
            {publishOutOfSync && (
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                发布版未同步
              </Tag>
            )}
            {contentSource === 'published' && (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                编辑发布版
              </Tag>
            )}
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
            <span className="jz-doc-header-meta-divider" aria-hidden>·</span>
            <Tooltip title="章节标题自动编号（1 / 1.1 / 1.1.1，仅显示不改源码）">
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>编号</Text>
                <Switch
                  size="small"
                  checked={doc.heading_numbering}
                  onChange={(checked) => void handleHeadingNumberingChange(checked)}
                />
              </Space>
            </Tooltip>
          </div>
        </div>

        <Space wrap size={8}>
          {doc.status === 'published' && (
            <Segmented
              size="small"
              value={contentSource}
              onChange={(v) => void changeContentSource(v as ContentSource)}
              options={[
                { label: '私人笔记', value: 'raw' },
                { label: '发布版', value: 'published' },
              ]}
            />
          )}
          <span className="jz-doc-mode-group">
            <Segmented
              size="small"
              value={mode}
              onChange={(v) => void changeEditorMode(v as EditorMode)}
              options={[
                { label: 'MD', value: 'markdown' },
                { label: '富文本', value: 'rich' },
                { label: 'HTML', value: 'html' },
                { label: 'PDF', value: 'pdf' },
                { label: 'PPT', value: 'pptx' },
              ]}
            />
            <Tooltip title={outlineOpen ? '隐藏大纲' : '显示大纲'}>
              <Button
                size="small"
                icon={<UnorderedListOutlined />}
                type={outlineOpen ? 'primary' : 'text'}
                className="jz-toolbar-btn"
                onClick={() => setOutlineOpen((v) => !v)}
                aria-pressed={outlineOpen}
              />
            </Tooltip>
            <Tooltip title="专注写作模式 (F9)">
              <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={() => setFocusMode(true)} />
            </Tooltip>
          </span>
          {doc.status === 'published' ? (
            <>
              <Button
                type="primary"
                icon={<RocketOutlined />}
                loading={publishing}
                disabled={!publishOutOfSync}
                onClick={() => void handleSyncPublished()}
              >
                更新发布
              </Button>
              <Button
                icon={<StopOutlined />}
                onClick={() => void handleUnpublish()}
              >
                撤回发布
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={handlePublishClick}
            >
              发布
            </Button>
          )}
          <Dropdown
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'stats',
                  icon: <InfoCircleOutlined />,
                  label: '文档信息',
                  onClick: () => setStatsOpen(true),
                },
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
            <Tooltip title="更多操作（导出 / 历史版本 / 删除…）">
              <Button icon={<EllipsisOutlined />} aria-label="更多操作" />
            </Tooltip>
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
                // flexDirection 交给 .jz-doc-body CSS：≥1280 切 row 两栏铺满，
                // <1280 回 column（内联 flexDirection 会盖掉 media，故此处不设）。
                flex: 1,
                minHeight: 0,
                display: 'flex',
                minWidth: 0,
              }),
        }}
      >
        <div className="jz-doc-editor-col" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <EditorSurface
            mode={mode}
            doc={doc}
            editorValue={editorBody}
            contentSource={contentSource}
            forceSyncRevision={conflictSyncRevision}
            primaryUrl={primaryUrl}
            onChange={(next) => {
              hasPendingChangesRef.current = true;
              setLocalEditorBody(next);
            }}
            onAutoSave={async (content) => {
              await handleAutoSave(content);
              hasPendingChangesRef.current = false;
            }}
            onSwitchToMarkdown={() => void changeEditorMode('markdown')}
            onUploadPrimary={handlePrimaryUpload}
            uploadingPrimary={uploadingPrimary}
            onRichEditorReady={setRichEditor}
            onMarkdownSurfaceReady={setMdSurface}
            onHtmlTextareaReady={setHtmlTextarea}
            onSaveReady={registerEditorSave}
          />
        </div>
        {outlineOpen && mode !== 'pdf' && mode !== 'pptx' && (
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
                  source={mode === 'markdown' || mode === 'html' ? editorBody : undefined}
                  sourceKind={mode === 'html' ? 'html' : 'markdown'}
                  numbering={doc.heading_numbering}
                  onSeek={(pos) => {
                    if (mode === 'html') {
                      htmlSurface?.seekTo(pos);
                    } else if (mode === 'markdown') {
                      mdSurface?.seekTo(pos);
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
        surface={
          mode === 'markdown' ? mdSurface : mode === 'html' ? htmlSurface : null
        }
        source={mode === 'markdown' || mode === 'html' ? editorBody : undefined}
        onSourceChange={
          mode === 'markdown' || mode === 'html'
            ? (next) => {
                hasPendingChangesRef.current = true;
                setLocalEditorBody(next);
              }
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

      <DocStatsDrawer
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        documentId={doc.id}
      />

      <VersionsDrawer
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        documentId={doc.id}
        onRestored={async () => {
          const fresh = await docsApi.getDocument(doc.id);
          // 走与 409 冲突同一条「强制重同步」路径：blur + bump
          // forceSyncRevision + setDoc。以前只 setDoc，编辑器画面还是旧文，
          // 下一次 autosave 直接把旧文写回去，静默覆盖刚刚回滚的结果。
          applyVersionConflict(fresh);
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

      {/* AI 助手 — 选区 ✨（md/html/pdf/pptx；富文本自带 AIAssistantMenu，
          双入口重叠易误触故不再挂载）+ 右下角全文浮窗 */}
      {mode !== 'rich' && (
        <SelectionAI
          contextProvider={() => aiContext}
          surfaceProvider={() =>
            mode === 'markdown' ? mdSurface : mode === 'html' ? htmlSurface : null
          }
        />
      )}
      {(mode === 'markdown' || mode === 'rich' || mode === 'html') && (
        <DocAIPanel content={aiContext} title={doc.title} />
      )}
    </div>
  );
}

interface SurfaceProps {
  mode: EditorMode;
  doc: DocumentDetail;
  editorValue: string;
  contentSource: ContentSource;
  forceSyncRevision: number;
  primaryUrl: string | null;
  onChange: (next: string) => void;
  onAutoSave: (next: string) => Promise<void>;
  onSwitchToMarkdown: () => void;
  onUploadPrimary: (file: File) => Promise<void> | void;
  uploadingPrimary: boolean;
  onRichEditorReady?: (editor: TiptapEditor | null) => void;
  onMarkdownSurfaceReady?: (handle: EditorSurfaceHandle | null) => void;
  onHtmlTextareaReady?: (el: HTMLTextAreaElement | null) => void;
  onSaveReady?: (handle: EditorSaveHandle | null) => void;
}

function EditorSurface({
  mode,
  doc,
  editorValue,
  contentSource,
  forceSyncRevision,
  primaryUrl,
  onChange,
  onAutoSave,
  onSwitchToMarkdown,
  onUploadPrimary,
  uploadingPrimary,
  onRichEditorReady,
  onMarkdownSurfaceReady,
  onHtmlTextareaReady,
  onSaveReady,
}: SurfaceProps) {
  const surfaceKey = `${contentSource}-${doc.id}-${mode}`;
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
  if (mode === 'pptx') {
    if (doc.doc_format !== 'pptx') {
      return (
        <MissingAttachment
          format="PPT"
          accept=".ppt,.pptx"
          uploading={uploadingPrimary}
          onUpload={onUploadPrimary}
          onSwitchToMarkdown={onSwitchToMarkdown}
        />
      );
    }
    // View-only slide preview (same reader the blog uses); polls while the
    // server-side conversion is still running.
    return (
      <LazyPptxReader
        key={doc.id}
        slides={doc.slides ?? []}
        postId={doc.id}
        downloadUrl={doc.primary_attachment?.url}
        status={doc.slide_status}
        error={doc.slide_error}
      />
    );
  }
  if (mode === 'html') {
    // 新文档：允许直接进入空编辑器（用户从 0 写 HTML）；老文档：若 raw_content
    // 为空但有 .html 附件，把附件 URL 传给 HtmlEditor，由它自动 fetch + 解码
    // 后写回 raw_content。
    const legacyUrl =
      contentSource === 'raw' &&
      !editorValue &&
      primaryUrl &&
      doc.doc_format === 'html'
        ? primaryUrl
        : null;
    return (
      <HtmlEditor
        key={`html-${surfaceKey}`}
        value={editorValue}
        onChange={onChange}
        onAutoSave={onAutoSave}
        documentId={doc.id}
        legacyAttachmentUrl={legacyUrl}
        onTextareaReady={onHtmlTextareaReady}
        onSaveReady={onSaveReady}
      />
    );
  }
  if (mode === 'rich') {
    return (
      <RichTextEditor
        key={`rich-${surfaceKey}`}
        value={editorValue}
        onChange={onChange}
        onAutoSave={onAutoSave}
        documentId={doc.id}
        onEditorReady={onRichEditorReady}
        paperStyle={doc.paper_style}
        headingNumbering={doc.heading_numbering}
        forceSyncRevision={forceSyncRevision}
        onSaveReady={onSaveReady}
      />
    );
  }
  return (
    <MarkdownEditor
      key={`md-${surfaceKey}`}
      value={editorValue}
      onChange={onChange}
      onAutoSave={onAutoSave}
      documentId={doc.id}
      onSurfaceReady={onMarkdownSurfaceReady}
      paperStyle={doc.paper_style}
      headingNumbering={doc.heading_numbering}
      onSaveReady={onSaveReady}
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
