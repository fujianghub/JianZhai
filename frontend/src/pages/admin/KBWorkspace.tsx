import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Radio,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { message } from '@/utils/notify';
import {
  CheckSquareOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileAddOutlined,
  FileImageOutlined,
  FolderAddOutlined,
  RocketOutlined,
  StopOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import * as kbsApi from '@/api/kbs';
import * as docsApi from '@/api/docs';
import { listDocumentTemplates, applyTemplatePlaceholders, type DocTemplate } from '@/api/templates';
import { useAuthStore } from '@/stores/auth';
import * as foldersApi from '@/api/folders';
import * as tagsApi from '@/api/tags';
import { formatApiError } from '@/api/client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import UploadDropZone from '@/components/common/UploadDropZone';
import {
  collectPickedFiles,
  runChunkedImport,
  skippedSummary,
  UPLOAD_ACCEPT,
  type CollectedUploads,
} from '@/utils/uploadBatch';
import { importBatch, importZip, type BatchImportItem } from '@/api/attachments';
import KBTreeNav, {
  collectVisibleSelection,
  pruneCascadedSelection,
  type CheckedSelection,
} from '@/components/tree/KBTreeNav';
import ExportDialog from '@/components/common/ExportDialog';
import type { DocSortMode, KBTree, KnowledgeBase, TreeDocument, TreeFolder } from '@/types';
import type { Tag as ApiTag } from '@/api/tags';
import {
  NEW_HTML_DOCUMENT_TEMPLATE,
  type NewDocContentKind,
} from '@/utils/htmlTemplate';

const { Text } = Typography;

export default function KBWorkspace() {
  const { id } = useParams<{ id: string }>();
  const kbId = Number(id);
  const navigate = useNavigate();

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [tree, setTree] = useState<KBTree | null>(null);
  const [newDocModal, setNewDocModal] = useState(false);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ loaded: number; total: number } | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  // 「导入带图 Markdown」两步选择器 + ZIP 导入
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleMd, setBundleMd] = useState<File | null>(null);
  const [bundleImages, setBundleImages] = useState<File[]>([]);
  const mdInputRef = useRef<HTMLInputElement | null>(null);
  const bundleImagesInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [docForm] = Form.useForm<{
    title: string;
    folder?: number | null;
    content_kind: NewDocContentKind;
    template?: string;
  }>();
  // Built-in document templates ({{date}}/{{title}}/{{user}} placeholders) —
  // loaded once when the KB workspace mounts; cheap, owner-scoped no-op call.
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [folderForm] = Form.useForm<{ name: string; parent?: number | null }>();
  const [exportOpen, setExportOpen] = useState(false);
  const [folderExport, setFolderExport] = useState<TreeFolder | null>(null);
  const [selectionExportOpen, setSelectionExportOpen] = useState(false);

  // -------- batch selection --------
  const [batchMode, setBatchMode] = useState(false);
  const [checked, setChecked] = useState<CheckedSelection>({ docIds: [], folderIds: [] });
  const [moveModal, setMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);
  const [tagModal, setTagModal] = useState(false);
  const [allTags, setAllTags] = useState<ApiTag[]>([]);
  const [batchTagIds, setBatchTagIds] = useState<number[]>([]);

  // -------- folder tag editor --------
  const [folderTagsModal, setFolderTagsModal] = useState<{
    folder: TreeFolder;
    tagIds: number[];
  } | null>(null);

  // -------- tree filter (persisted per-KB) --------
  const [filterQuery, setFilterQuery] = useState<string>(() => {
    try {
      return localStorage.getItem(`jz-kb-${kbId}-filter-q`) ?? '';
    } catch {
      return '';
    }
  });
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>(() => {
    try {
      const v = localStorage.getItem(`jz-kb-${kbId}-filter-status`);
      return v === 'published' || v === 'draft' ? v : 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`jz-kb-${kbId}-filter-q`, filterQuery);
    } catch {
      /* noop */
    }
  }, [kbId, filterQuery]);
  useEffect(() => {
    try {
      localStorage.setItem(`jz-kb-${kbId}-filter-status`, filterStatus);
    } catch {
      /* noop */
    }
  }, [kbId, filterStatus]);

  const refreshTree = useCallback(async () => {
    const t = await kbsApi.getKBTree(kbId);
    setTree(t);
  }, [kbId]);

  useEffect(() => {
    let cancelled = false;
    listDocumentTemplates()
      .then((t) => !cancelled && setTemplates(t))
      .catch(() => !cancelled && setTemplates([]));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void kbsApi.getKB(kbId).then(setKb);
    void refreshTree();
  }, [kbId, refreshTree]);

  const folderOptions = tree
    ? flattenFolders(tree).map((f) => ({ value: f.id, label: f.label }))
    : [];

  async function handleCreateDoc() {
    let values;
    try {
      values = await docForm.validateFields();
    } catch {
      return;
    }
    try {
      const isHtml = values.content_kind === 'html';
      // Template body only applies to Markdown docs — HTML still gets the
      // pre-existing NEW_HTML_DOCUMENT_TEMPLATE skeleton.
      let raw = '';
      if (isHtml) {
        raw = NEW_HTML_DOCUMENT_TEMPLATE;
      } else if (values.template && values.template !== 'blank') {
        const tpl = templates.find((t) => t.id === values.template);
        if (tpl) {
          raw = applyTemplatePlaceholders(tpl.body, {
            date: new Date().toISOString().slice(0, 10),
            title: values.title,
            user: useAuthStore.getState().user?.username ?? '',
          });
        }
      }
      const created = await docsApi.createDocument({
        knowledge_base: kbId,
        folder: values.folder ?? null,
        title: values.title,
        raw_content: raw,
      });
      setNewDocModal(false);
      docForm.resetFields();
      await refreshTree();
      const modeQ = isHtml ? '?mode=html' : '';
      navigate(`/admin/kbs/${kbId}/docs/${created.id}${modeQ}`);
      message.success('文档已创建');
    } catch (err) {
      message.error(formatApiError(err, '新建文档失败'));
    }
  }

  /**
   * 统一上传入口：文件选择器（单个/多个）、文件夹选择器、拖拽（文件 + 文件夹
   * 混合）全部走这里。客户端先按规则过滤（类型/大小/隐藏文件），再分片
   * 顺序上传 —— 每片服务端响应后立即刷新树，文档渐进出现。
   */
  async function handleUpload(collected: CollectedUploads) {
    if (collected.skipped.length) message.warning(skippedSummary(collected.skipped));
    if (collected.items.length === 0) {
      if (!collected.skipped.length) message.info('没有可上传的文件');
      return;
    }
    setImporting(true);
    setBatchProgress({ loaded: 0, total: 1 });
    try {
      const result = await runChunkedImport(collected.items, kbId, null, {
        onProgress: (loaded, total) => setBatchProgress({ loaded, total }),
        onChunkDone: async () => {
          await refreshTree();
        },
      });
      const msg = `已导入 ${result.created.length} 个文件` +
        (result.folders_created ? ` · 创建 ${result.folders_created} 个文件夹` : '') +
        (result.errors.length ? ` · ${result.errors.length} 个失败` : '');
      if (result.errors.length) {
        message.warning(msg);
        // Surface the first few errors so the user knows what to retry.
        console.warn('batch import errors:', result.errors);
      } else {
        message.success(msg);
      }
    } finally {
      setImporting(false);
      setBatchProgress(null);
      // 兜底再刷一次 —— 分片中途异常也能看到已落库的文档。
      await refreshTree();
    }
  }

  /** 共用：跑一次导入请求并统一处理进度 / 提示 / 刷新。 */
  async function runImport(
    fn: () => Promise<{
      created: unknown[];
      errors: unknown[];
      folders_created: number;
      skipped?: string[];
    }>
  ) {
    setImporting(true);
    setBatchProgress({ loaded: 0, total: 1 });
    try {
      const r = await fn();
      const msg =
        `已导入 ${r.created.length} 个文件` +
        (r.folders_created ? ` · 创建 ${r.folders_created} 个文件夹` : '') +
        (r.errors.length ? ` · ${r.errors.length} 个失败` : '') +
        (r.skipped?.length ? ` · 跳过 ${r.skipped.length} 个` : '');
      if (r.errors.length || r.skipped?.length) {
        message.warning(msg);
        if (r.errors.length) console.warn('import errors:', r.errors);
        if (r.skipped?.length) console.warn('import skipped:', r.skipped);
      } else {
        message.success(msg);
      }
    } catch (err) {
      message.error(formatApiError(err, '导入失败'));
    } finally {
      setImporting(false);
      setBatchProgress(null);
      await refreshTree();
    }
  }

  /** 仅保留图片类型、≤2GB 的文件（「导入带图 Markdown」第②步用）。 */
  function pickImageFiles(files: FileList): File[] {
    const imageExt = /\.(jpe?g|png|gif|webp|svg)$/i;
    return Array.from(files).filter(
      (f) => imageExt.test(f.name) && f.size <= 2 * 1024 * 1024 * 1024
    );
  }

  /**
   * 「导入带图 Markdown」：把第①步选的 .md 与第②步选的图片文件夹**合并为一个
   * import_batch 请求**发出（同到才能改写相对路径）。md 落在 KB 根、图片转为其
   * 附件，./images/x.png 自动改写为 /media/…（后端按文件名兜底匹配，文件夹叫
   * 什么名字都行）。
   */
  async function handleBundleImport() {
    if (!bundleMd) {
      message.warning('请先选择 Markdown 文档');
      return;
    }
    const items: BatchImportItem[] = [
      { file: bundleMd, relativePath: bundleMd.name },
      ...bundleImages.map((f) => ({
        file: f,
        relativePath:
          (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      })),
    ];
    setBundleModalOpen(false);
    await runImport(() =>
      importBatch(items, kbId, null, (loaded, total) => setBatchProgress({ loaded, total }))
    );
    setBundleMd(null);
    setBundleImages([]);
  }

  /** 「导入 ZIP（含图片）」：上传单个 .zip，后端解压并改写相对图片路径。 */
  async function handleZipImport(file: File) {
    await runImport(() =>
      importZip(file, kbId, null, (loaded, total) => setBatchProgress({ loaded, total }))
    );
  }

  async function handleCreateFolder() {
    let values;
    try {
      values = await folderForm.validateFields();
    } catch {
      return;
    }
    try {
      await foldersApi.createFolder({
        knowledge_base: kbId,
        parent: values.parent ?? null,
        name: values.name,
      });
      setNewFolderModal(false);
      folderForm.resetFields();
      await refreshTree();
      message.success('文件夹已创建');
    } catch (err) {
      message.error(formatApiError(err, '新建文件夹失败'));
    }
  }

  // -------- batch ops --------
  const selectionCount = checked.docIds.length + checked.folderIds.length;

  // All currently-visible (filter-aware) docs/folders, for the "全选" checkbox.
  const visibleSelection = useMemo(
    () => (tree ? collectVisibleSelection(tree, filterQuery, filterStatus) : { docIds: [], folderIds: [] }),
    [tree, filterQuery, filterStatus]
  );
  const visibleCount = visibleSelection.docIds.length + visibleSelection.folderIds.length;
  const allVisibleChecked = visibleCount > 0 && selectionCount >= visibleCount;

  function toggleBatch() {
    if (batchMode) {
      setChecked({ docIds: [], folderIds: [] });
    }
    setBatchMode((b) => !b);
  }

  async function handleBatchDelete() {
    try {
      // 级联勾选会把已勾文件夹下的子文件夹/文档一起带进选择集，而后端删除
      // 文件夹本身就级联整棵子树 —— 不剪枝会让后代请求 404（"No Folder
      // matches the given query"）。只发「最顶层」的 id。
      const effective = tree ? pruneCascadedSelection(tree, checked) : checked;
      await Promise.all([
        ...effective.docIds.map((id) => docsApi.deleteDocument(id)),
        ...effective.folderIds.map((id) => foldersApi.deleteFolder(id)),
      ]);
      message.success(`已删除 ${selectionCount} 项`);
      setChecked({ docIds: [], folderIds: [] });
      await refreshTree();
    } catch (err) {
      message.error(formatApiError(err, '批量删除失败'));
    }
  }

  async function handleBatchMove() {
    if (checked.docIds.length === 0 && checked.folderIds.length === 0) return;
    try {
      // 同删除：已勾文件夹整体搬迁即可，其下被级联勾中的文档/子文件夹
      // 不能单独改 parent —— 否则会被平移出原文件夹、拍扁目录结构。
      const effective = tree ? pruneCascadedSelection(tree, checked) : checked;
      await Promise.all([
        ...effective.docIds.map((id) =>
          docsApi.updateDocument(id, { folder: moveTarget ?? null })
        ),
        ...effective.folderIds.map((id) =>
          foldersApi.updateFolder(id, { parent: moveTarget ?? null })
        ),
      ]);
      message.success(`已移动 ${selectionCount} 项`);
      setMoveModal(false);
      setChecked({ docIds: [], folderIds: [] });
      await refreshTree();
    } catch (err) {
      message.error(formatApiError(err, '批量移动失败'));
    }
  }

  async function openTagModal() {
    setBatchTagIds([]);
    setTagModal(true);
    try {
      setAllTags(await tagsApi.listTags());
    } catch (err) {
      message.error(formatApiError(err, '加载标签失败'));
    }
  }

  async function openFolderTagsModal(folder: TreeFolder) {
    setFolderTagsModal({ folder, tagIds: (folder.tags ?? []).map((t) => t.id) });
    try {
      // Always re-fetch the full tag catalogue so new tags created elsewhere
      // are pickable without a full page refresh.
      setAllTags(await tagsApi.listTags());
    } catch (err) {
      message.error(formatApiError(err, '加载标签失败'));
    }
  }

  async function saveFolderTags() {
    if (!folderTagsModal) return;
    try {
      await tagsApi.setFolderTags(folderTagsModal.folder.id, folderTagsModal.tagIds);
      message.success('文件夹标签已保存');
      setFolderTagsModal(null);
      await refreshTree();
    } catch (err) {
      message.error(formatApiError(err, '保存文件夹标签失败'));
    }
  }

  const SORT_OPTIONS: { value: DocSortMode; label: string }[] = [
    { value: 'custom', label: '自定义' },
    { value: 'title', label: '名称' },
    { value: 'created_at', label: '新建时间' },
    { value: 'updated_at', label: '更新时间' },
    { value: 'doc_format', label: '文件类型' },
  ];

  async function handleSortChange(mode: DocSortMode) {
    try {
      const updated = await kbsApi.updateKBSortMode(kbId, mode);
      setKb(updated);
      await refreshTree();
      message.success('排序方式已更新');
    } catch (err) {
      message.error(formatApiError(err, '更新排序失败'));
    }
  }

  async function handleTogglePin(doc: TreeDocument) {
    try {
      await docsApi.toggleDocumentPin(doc.id, !doc.is_pinned);
      await refreshTree();
    } catch (err) {
      message.error(formatApiError(err, '置顶操作失败'));
    }
  }

  async function handleToggleFavorite(doc: TreeDocument) {
    try {
      await docsApi.toggleDocumentFavorite(doc.id);
      await refreshTree();
    } catch (err) {
      message.error(formatApiError(err, '收藏操作失败'));
    }
  }

  async function handleBatchAddTags() {
    if (batchTagIds.length === 0 || checked.docIds.length === 0) {
      setTagModal(false);
      return;
    }
    try {
      await Promise.all(
        checked.docIds.map(async (id) => {
          const existing = await tagsApi.getDocumentTags(id);
          const merged = Array.from(new Set([...existing.map((t) => t.id), ...batchTagIds]));
          await tagsApi.setDocumentTags(id, merged);
        })
      );
      message.success('标签已应用');
      setTagModal(false);
    } catch (err) {
      message.error(formatApiError(err, '批量打标签失败'));
    }
  }

  async function handleBatchPublish(publish: boolean) {
    if (checked.docIds.length === 0) return;
    try {
      await Promise.all(
        checked.docIds.map((id) =>
          publish ? docsApi.publishDocument(id) : docsApi.unpublishDocument(id)
        )
      );
      message.success(publish ? '已批量发布' : '已批量撤回');
      await refreshTree();
    } catch (err) {
      message.error(formatApiError(err, '批量发布失败'));
    }
  }

  if (!kb || !tree) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 400 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        backTo="/admin/kbs"
        backLabel="知识库"
        title={kb.name}
        accentColor={kb.accent_color}
        meta={
          <Space split={<span style={{ opacity: 0.4 }}>·</span>} size={4}>
            <Tag color={kb.visibility === 'public' ? 'green' : 'default'}>
              {kb.visibility === 'public' ? '公开' : '私密'}
            </Tag>
            <Text type="secondary">{kb.document_count} 篇</Text>
          </Space>
        }
        actions={
        <Space wrap>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'doc',
                  icon: <FileAddOutlined />,
                  label: '新建文档',
                  onClick: () => setNewDocModal(true),
                },
                {
                  key: 'folder',
                  icon: <FolderAddOutlined />,
                  label: '新建文件夹',
                  onClick: () => setNewFolderModal(true),
                },
                { type: 'divider' as const },
                {
                  key: 'import-files',
                  icon: <CloudUploadOutlined />,
                  label: '上传文件（单个或多选）',
                  onClick: () => batchInputRef.current?.click(),
                },
                {
                  key: 'import-folder',
                  icon: <FolderAddOutlined />,
                  label: '上传文件夹（保留目录结构）',
                  onClick: () => folderInputRef.current?.click(),
                },
                { type: 'divider' as const },
                {
                  key: 'import-md-bundle',
                  icon: <FileImageOutlined />,
                  label: '导入带图 Markdown（选文档 + 图片文件夹）',
                  onClick: () => setBundleModalOpen(true),
                },
                {
                  key: 'import-zip',
                  icon: <CloudUploadOutlined />,
                  label: '导入 ZIP 压缩包（含图片）',
                  onClick: () => zipInputRef.current?.click(),
                },
                {
                  key: 'import-hint',
                  disabled: true,
                  label: (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      也可直接拖拽含 images 的整个文件夹到文档列表
                    </Text>
                  ),
                },
              ],
            }}
          >
            <Button type="primary" loading={importing}>
              {batchProgress
                ? batchProgress.loaded >= batchProgress.total
                  ? '服务器处理中…'
                  : `上传中 ${Math.round((batchProgress.loaded / batchProgress.total) * 100)}%`
                : '新建 ▾'}
            </Button>
          </Dropdown>
          <input
            ref={batchInputRef}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length) {
                void handleUpload(collectPickedFiles(e.target.files, false));
              }
              e.target.value = '';
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error — webkitdirectory is a non-standard but widely supported attribute.
            webkitdirectory="true"
            directory="true"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length) {
                void handleUpload(collectPickedFiles(e.target.files, true));
              }
              e.target.value = '';
            }}
          />
          {/* 「导入带图 Markdown」第①步：选单个 .md */}
          <input
            ref={mdInputRef}
            type="file"
            accept=".md,.markdown"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setBundleMd(f);
              e.target.value = '';
            }}
          />
          {/* 「导入带图 Markdown」第②步：选图片文件夹 */}
          <input
            ref={bundleImagesInputRef}
            type="file"
            multiple
            // @ts-expect-error — webkitdirectory 非标准属性，主流浏览器支持。
            webkitdirectory="true"
            directory="true"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length) {
                setBundleImages(pickImageFiles(e.target.files));
              }
              e.target.value = '';
            }}
          />
          {/* ZIP 导入 */}
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleZipImport(f);
              e.target.value = '';
            }}
          />
          <Button icon={<ExportOutlined />} onClick={() => setExportOpen(true)}>
            导出整个知识库
          </Button>
          <Tooltip title={batchMode ? '退出选择模式' : '进入多选模式'}>
            <Button
              type={batchMode ? 'primary' : 'default'}
              icon={<CheckSquareOutlined />}
              onClick={toggleBatch}
            >
              {batchMode ? `已选 ${selectionCount}` : '批量管理'}
            </Button>
          </Tooltip>
        </Space>
        }
      />

      {batchProgress && (
        <div
          className="jz-admin-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            marginBottom: 12,
          }}
        >
          <CloudUploadOutlined style={{ color: 'var(--jz-accent)' }} />
          <Text style={{ whiteSpace: 'nowrap' }}>
            {batchProgress.loaded >= batchProgress.total
              ? '已上传，服务器解析中…'
              : '上传中…'}
          </Text>
          <Progress
            style={{ flex: 1, margin: 0 }}
            percent={Math.round((batchProgress.loaded / batchProgress.total) * 100)}
            status="active"
          />
        </div>
      )}

      {batchMode && (
        <div
          className="jz-admin-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <Checkbox
            checked={allVisibleChecked}
            indeterminate={selectionCount > 0 && !allVisibleChecked}
            disabled={visibleCount === 0}
            onChange={(e) =>
              setChecked(
                e.target.checked ? visibleSelection : { docIds: [], folderIds: [] }
              )
            }
          >
            全选
          </Checkbox>
          <Text strong>已选 {selectionCount} 项</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            （文档 {checked.docIds.length} · 文件夹 {checked.folderIds.length}）
          </Text>
          <div style={{ flex: 1 }} />
          <Space wrap size={6}>
            <Button
              size="small"
              icon={<ExportOutlined />}
              disabled={selectionCount === 0}
              onClick={() => setSelectionExportOpen(true)}
            >
              导出
            </Button>
            <Button
              size="small"
              disabled={selectionCount === 0}
              onClick={() => {
                setMoveTarget(null);
                setMoveModal(true);
              }}
            >
              移动到…
            </Button>
            <Button
              size="small"
              icon={<TagsOutlined />}
              disabled={checked.docIds.length === 0}
              onClick={openTagModal}
            >
              打标签
            </Button>
            <Button
              size="small"
              icon={<RocketOutlined />}
              disabled={checked.docIds.length === 0}
              onClick={() => handleBatchPublish(true)}
            >
              发布
            </Button>
            <Button
              size="small"
              icon={<StopOutlined />}
              disabled={checked.docIds.length === 0}
              onClick={() => handleBatchPublish(false)}
            >
              撤回
            </Button>
            <Popconfirm
              title={`删除选中的 ${selectionCount} 项？文件夹将连同其下内容一起删除。`}
              onConfirm={handleBatchDelete}
              disabled={selectionCount === 0}
            >
              <Button size="small" danger icon={<DeleteOutlined />} disabled={selectionCount === 0}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      <div
        className="jz-admin-panel"
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 12,
          padding: '10px 14px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Input.Search
          allowClear
          placeholder="按标题筛选文档…"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          style={{ maxWidth: 320, flex: 1 }}
        />
        <Segmented
          value={filterStatus}
          onChange={(v) => setFilterStatus(v as 'all' | 'published' | 'draft')}
          options={[
            { label: '全部', value: 'all' },
            { label: '已发布', value: 'published' },
            { label: '草稿', value: 'draft' },
          ]}
        />
        {kb && (
          <Select
            value={kb.doc_sort_mode ?? 'custom'}
            onChange={handleSortChange}
            options={SORT_OPTIONS}
            style={{ minWidth: 120 }}
            disabled={batchMode}
            aria-label="文档排序"
          />
        )}
      </div>

      <UploadDropZone
        accent={kb.accent_color || undefined}
        onDropFiles={(c) => void handleUpload(c)}
      >
      <div
        className={'jz-kb-tree-panel' + (kb.accent_color ? ' has-kb-accent' : '')}
        style={
          kb.accent_color
            ? ({ ['--jz-kb-accent' as string]: kb.accent_color } as CSSProperties)
            : undefined
        }
      >
        {tree.folders.length === 0 && tree.documents.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="空知识库 — 新建文档、上传，或直接拖入文件 / 文件夹"
            style={{ padding: '48px 0' }}
          >
            <Space>
              <Button type="primary" icon={<FileAddOutlined />} onClick={() => setNewDocModal(true)}>
                新建文档
              </Button>
              <Button icon={<CloudUploadOutlined />} onClick={() => batchInputRef.current?.click()}>
                上传文件
              </Button>
            </Space>
          </Empty>
        ) : (
          <KBTreeNav
            tree={tree}
            selectedDocId={null}
            onSelectDoc={(docId) => {
              if (batchMode) {
                // In batch mode, row clicks toggle selection instead of navigating away
                // so the checked state isn't lost when the user mis-clicks.
                setChecked((prev) =>
                  prev.docIds.includes(docId)
                    ? { ...prev, docIds: prev.docIds.filter((x) => x !== docId) }
                    : { ...prev, docIds: [...prev.docIds, docId] }
                );
                return;
              }
              navigate(`/admin/kbs/${kbId}/docs/${docId}`);
            }}
            checkable={batchMode}
            checked={checked}
            onCheckedChange={setChecked}
            onEditFolderTags={openFolderTagsModal}
            onExportFolder={batchMode ? undefined : (f) => setFolderExport(f)}
            filterQuery={filterQuery}
            filterStatus={filterStatus}
            onTogglePin={batchMode ? undefined : handleTogglePin}
            onToggleFavorite={batchMode ? undefined : handleToggleFavorite}
          />
        )}
      </div>
      </UploadDropZone>

      {tree.folders.length === 0 && tree.documents.length === 0 && (
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          message="点击右上「新建 ▾ → 上传文件」可以直接导入 PDF / HTML / DOCX / Markdown 作为一篇博客。"
        />
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        scope="kb"
        targetId={kbId}
        targetLabel={kb.name}
        onSubmitted={() => navigate('/admin/exports')}
      />
      {folderExport && (
        <ExportDialog
          open
          onClose={() => setFolderExport(null)}
          scope="folder"
          targetId={folderExport.id}
          targetLabel={folderExport.name}
          allowSiteFormat={false}
          onSubmitted={() => navigate('/admin/exports')}
        />
      )}
      <ExportDialog
        open={selectionExportOpen}
        onClose={() => setSelectionExportOpen(false)}
        scope="selection"
        folderIds={checked.folderIds}
        docIds={checked.docIds}
        targetLabel={`已选 ${selectionCount} 项`}
        onSubmitted={() => navigate('/admin/exports')}
      />

      <Modal
        open={newDocModal}
        title="新建文档"
        onCancel={() => setNewDocModal(false)}
        onOk={handleCreateDoc}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={docForm}
          layout="vertical"
          initialValues={{ folder: null, content_kind: 'markdown', template: 'blank' }}
        >
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="文档类型" name="content_kind">
            <Radio.Group>
              <Radio value="markdown">Markdown</Radio>
              <Radio value="html">HTML</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.content_kind !== next.content_kind}
          >
            {({ getFieldValue }) =>
              getFieldValue('content_kind') === 'markdown' && templates.length > 0 ? (
                <Form.Item
                  label="从模板创建"
                  name="template"
                  tooltip="模板里的 {{date}} / {{title}} / {{user}} 会自动替换"
                >
                  <Select
                    options={templates.map((t) => ({
                      value: t.id,
                      label: (
                        <span>
                          <span style={{ fontWeight: 500 }}>{t.name}</span>
                          {t.description && (
                            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                              {t.description}
                            </Text>
                          )}
                        </span>
                      ),
                    }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item label="所属文件夹" name="folder">
            <Select allowClear placeholder="（根目录）" options={folderOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={newFolderModal}
        title="新建文件夹"
        onCancel={() => setNewFolderModal(false)}
        onOk={handleCreateFolder}
        okText="创建"
        cancelText="取消"
      >
        <Form form={folderForm} layout="vertical" initialValues={{ parent: null }}>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="父级文件夹" name="parent">
            <Select allowClear placeholder="（根目录）" options={folderOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={bundleModalOpen}
        title="导入带图 Markdown"
        onCancel={() => setBundleModalOpen(false)}
        onOk={handleBundleImport}
        okText="开始导入"
        cancelText="取消"
        okButtonProps={{ disabled: !bundleMd }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          浏览器不允许网页读取你本地的图片文件夹，所以请分两步把它们一起交给系统：
          导入时会自动把图片存为该文档的附件，并把 <code>./images/x.png</code> 改写为可访问地址（按文件名匹配，图片文件夹叫什么名字都行）。
        </Text>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Button icon={<FileAddOutlined />} onClick={() => mdInputRef.current?.click()}>
              ① 选择 Markdown 文档
            </Button>
            <Text style={{ marginLeft: 10 }}>
              {bundleMd ? bundleMd.name : <Text type="secondary">未选择（.md / .markdown）</Text>}
            </Text>
          </div>
          <div>
            <Button icon={<FileImageOutlined />} onClick={() => bundleImagesInputRef.current?.click()}>
              ② 选择图片文件夹
            </Button>
            <Text style={{ marginLeft: 10 }}>
              {bundleImages.length ? (
                `已选 ${bundleImages.length} 张图片`
              ) : (
                <Text type="secondary">未选择（可选，图片缺失则该图不显示）</Text>
              )}
            </Text>
          </div>
        </div>
      </Modal>

      <Modal
        open={moveModal}
        title={`移动 ${selectionCount} 项`}
        onCancel={() => setMoveModal(false)}
        onOk={handleBatchMove}
        okText="移动"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="目标文件夹">
            <Select
              allowClear
              placeholder="（移动到知识库根目录）"
              options={folderOptions}
              value={moveTarget ?? undefined}
              onChange={(v) => setMoveTarget(v ?? null)}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            注：选中的文件夹会被移动为目标文件夹的子级；选中目标文件夹本身会被自动忽略。
          </Text>
        </Form>
      </Modal>

      <Modal
        open={tagModal}
        title={`为 ${checked.docIds.length} 篇文档追加标签`}
        onCancel={() => setTagModal(false)}
        onOk={handleBatchAddTags}
        okText="应用"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="选择标签">
            <Select
              mode="multiple"
              placeholder="选择已有标签…"
              options={allTags.map((t) => ({ value: t.id, label: t.name }))}
              value={batchTagIds}
              onChange={setBatchTagIds}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            标签会追加到每篇文档已有的标签上，不会覆盖原有标签。
          </Text>
        </Form>
      </Modal>

      <Modal
        open={folderTagsModal !== null}
        title={`文件夹标签：${folderTagsModal?.folder.name ?? ''}`}
        onCancel={() => setFolderTagsModal(null)}
        onOk={saveFolderTags}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="选择标签">
            <Select
              mode="multiple"
              placeholder="选择已有标签…"
              options={allTags.map((t) => ({ value: t.id, label: t.name }))}
              value={folderTagsModal?.tagIds ?? []}
              onChange={(v) =>
                setFolderTagsModal((cur) => (cur ? { ...cur, tagIds: v as number[] } : cur))
              }
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            文件夹标签会展示在博客前台的目录里，方便读者快速识别文件夹主题。
          </Text>
        </Form>
      </Modal>
    </div>
  );
}

function flattenFolders(tree: KBTree): { id: number; label: string }[] {
  const out: { id: number; label: string }[] = [];
  const walk = (folders: KBTree['folders'], prefix: string) => {
    for (const f of folders) {
      out.push({ id: f.id, label: prefix + f.name });
      walk(f.children, prefix + f.name + ' / ');
    }
  };
  walk(tree.folders, '');
  return out;
}
