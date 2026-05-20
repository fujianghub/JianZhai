import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
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
  FolderAddOutlined,
  RocketOutlined,
  StopOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as kbsApi from '@/api/kbs';
import * as docsApi from '@/api/docs';
import * as foldersApi from '@/api/folders';
import * as attApi from '@/api/attachments';
import * as tagsApi from '@/api/tags';
import { formatApiError } from '@/api/client';
import KBTreeNav, { type CheckedSelection } from '@/components/tree/KBTreeNav';
import ExportDialog from '@/components/common/ExportDialog';
import type { KBTree, KnowledgeBase, TreeFolder } from '@/types';
import type { Tag as ApiTag } from '@/api/tags';

const { Title, Text } = Typography;

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
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [docForm] = Form.useForm<{ title: string; folder?: number | null }>();
  const [folderForm] = Form.useForm<{ name: string; parent?: number | null }>();
  const [exportOpen, setExportOpen] = useState(false);

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
      const created = await docsApi.createDocument({
        knowledge_base: kbId,
        folder: values.folder ?? null,
        title: values.title,
        raw_content: '',
      });
      setNewDocModal(false);
      docForm.resetFields();
      await refreshTree();
      navigate(`/admin/kbs/${kbId}/docs/${created.id}`);
      message.success('文档已创建');
    } catch (err) {
      message.error(formatApiError(err, '新建文档失败'));
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const newDoc = await attApi.importFileAsDoc(file, kbId, null);
      await refreshTree();
      navigate(`/admin/kbs/${kbId}/docs/${newDoc.id}`);
      message.success(`已导入 ${file.name}`);
    } catch (err) {
      message.error(formatApiError(err, '导入失败'));
    } finally {
      setImporting(false);
    }
  }

  /**
   * Upload many files (and optionally a whole directory tree) into the KB.
   * When ``preserveTree`` is true we send each file's ``webkitRelativePath``
   * so the backend can recreate the directory structure with auto-created
   * folders. Otherwise the files land directly under the KB root.
   */
  async function handleBatchImport(files: FileList | File[], preserveTree: boolean) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setImporting(true);
    setBatchProgress({ loaded: 0, total: 1 });
    try {
      const items: attApi.BatchImportItem[] = arr.map((f) => ({
        file: f,
        relativePath: preserveTree
          ? (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
          : '',
      }));
      const result = await attApi.importBatch(items, kbId, null, (loaded, total) =>
        setBatchProgress({ loaded, total })
      );
      await refreshTree();
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
    } catch (err) {
      message.error(formatApiError(err, '批量上传失败'));
    } finally {
      setImporting(false);
      setBatchProgress(null);
    }
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

  function toggleBatch() {
    if (batchMode) {
      setChecked({ docIds: [], folderIds: [] });
    }
    setBatchMode((b) => !b);
  }

  async function handleBatchDelete() {
    try {
      await Promise.all([
        ...checked.docIds.map((id) => docsApi.deleteDocument(id)),
        ...checked.folderIds.map((id) => foldersApi.deleteFolder(id)),
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
      await Promise.all([
        ...checked.docIds.map((id) =>
          docsApi.updateDocument(id, { folder: moveTarget ?? null })
        ),
        ...checked.folderIds.map((id) =>
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <Link to="/admin/kbs">← </Link>
            {kb.name}
          </Title>
          <Text type="secondary">{kb.visibility === 'public' ? '公开' : '私密'}</Text>
        </div>
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
                  key: 'import',
                  icon: <CloudUploadOutlined />,
                  label: '上传单个文件 (md/pdf/docx/html…)',
                  onClick: () => importInputRef.current?.click(),
                },
                {
                  key: 'import-batch',
                  icon: <CloudUploadOutlined />,
                  label: '批量上传文件',
                  onClick: () => batchInputRef.current?.click(),
                },
                {
                  key: 'import-folder',
                  icon: <FolderAddOutlined />,
                  label: '上传整个文件夹（保留目录结构）',
                  onClick: () => folderInputRef.current?.click(),
                },
              ],
            }}
          >
            <Button type="primary" loading={importing}>
              {batchProgress
                ? `上传中 ${Math.round((batchProgress.loaded / batchProgress.total) * 100)}%`
                : '新建 ▾'}
            </Button>
          </Dropdown>
          <input
            ref={importInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.html,.htm,.md,.markdown,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg,.zip,.csv,.json,.xml"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = '';
            }}
          />
          <input
            ref={batchInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.html,.htm,.md,.markdown,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg,.zip,.csv,.json,.xml"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length) {
                void handleBatchImport(e.target.files, false);
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
                void handleBatchImport(e.target.files, true);
              }
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
      </div>

      {batchMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            marginBottom: 12,
            border: '1px solid var(--jz-border)',
            borderRadius: 8,
            background: 'var(--jz-surface-2)',
            flexWrap: 'wrap',
          }}
        >
          <Text strong>已选 {selectionCount} 项</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            （文档 {checked.docIds.length} · 文件夹 {checked.folderIds.length}）
          </Text>
          <div style={{ flex: 1 }} />
          <Space wrap size={6}>
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
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 12,
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
      </div>

      <div
        style={{
          border: '1px solid var(--jz-border)',
          borderRadius: 8,
          padding: 12,
          background: 'var(--jz-surface)',
          minHeight: 360,
        }}
      >
        {tree.folders.length === 0 && tree.documents.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="空知识库，先建一个文档或上传文件" />
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
            filterQuery={filterQuery}
            filterStatus={filterStatus}
          />
        )}
      </div>

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
      />

      <Modal
        open={newDocModal}
        title="新建文档"
        onCancel={() => setNewDocModal(false)}
        onOk={handleCreateDoc}
        okText="创建"
        cancelText="取消"
      >
        <Form form={docForm} layout="vertical" initialValues={{ folder: null }}>
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input autoFocus />
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
