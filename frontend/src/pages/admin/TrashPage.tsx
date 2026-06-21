import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Empty,
  Popconfirm,
  Spin,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd';
import type { TablePaginationConfig } from 'antd/es/table';
import { DeleteOutlined, UndoOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  batchPurgeTrashDocuments,
  batchPurgeTrashKBs,
  batchRestoreTrashDocuments,
  batchRestoreTrashKBs,
  emptyTrash,
  listTrash,
  purgeTrashDocument,
  purgeTrashKB,
  restoreTrashDocument,
  restoreTrashKB,
  type TrashBatchResult,
  type TrashDocument,
  type TrashEmptyScope,
  type TrashKB,
} from '@/api/trash';
import { formatApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

const { Text } = Typography;

const PAGE_SIZE = 20;

function reportBatchResult(result: TrashBatchResult, actionLabel: string) {
  const ok = result.succeeded.length;
  const bad = result.failed.length;
  if (bad === 0) {
    message.success(`${actionLabel}成功（${ok} 项）`);
  } else if (ok === 0) {
    message.error(`${actionLabel}失败：${result.failed[0]?.detail ?? '未知错误'}`);
  } else {
    message.warning(`${actionLabel}：成功 ${ok} 项，失败 ${bad} 项`);
  }
}

export default function TrashPage() {
  // Permanent deletion (purge) and emptying the trash are root-only and
  // irreversible; admins may view + restore. Backend enforces the real gate.
  const isRoot = !!useAuthStore((s) => s.user?.is_root);
  const [loading, setLoading] = useState(true);
  const [kbs, setKbs] = useState<TrashKB[]>([]);
  const [docs, setDocs] = useState<TrashDocument[]>([]);
  const [kbCount, setKbCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [kbPage, setKbPage] = useState(1);
  const [docPage, setDocPage] = useState(1);
  const [activeTab, setActiveTab] = useState('docs');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<number[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    void listTrash({
      kb_page: kbPage,
      kb_page_size: PAGE_SIZE,
      doc_page: docPage,
      doc_page_size: PAGE_SIZE,
    })
      .then((data) => {
        setKbs(data.knowledge_bases.results);
        setKbCount(data.knowledge_bases.count);
        setDocs(data.documents.results);
        setDocCount(data.documents.count);
      })
      .catch((err) => message.error(formatApiError(err, '加载回收站失败')))
      .finally(() => setLoading(false));
  }, [kbPage, docPage]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(key: string, fn: () => Promise<void>) {
    setBusyId(key);
    try {
      await fn();
      load();
    } catch (err) {
      message.error(formatApiError(err, '操作失败'));
    } finally {
      setBusyId(null);
    }
  }

  async function runBatch(
    key: string,
    fn: () => Promise<TrashBatchResult>,
    label: string,
    clearSelection: () => void,
  ) {
    setBusyId(key);
    try {
      const result = await fn();
      reportBatchResult(result, label);
      clearSelection();
      load();
    } catch (err) {
      message.error(formatApiError(err, '操作失败'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleEmpty(scope: TrashEmptyScope) {
    await runAction(`empty-${scope}`, async () => {
      const res = await emptyTrash(scope);
      const total = res.purged_documents + res.purged_knowledge_bases;
      message.success(`已永久清空 ${total} 项`);
      setSelectedDocIds([]);
      setSelectedKbIds([]);
    });
  }

  const emptyAll = kbCount === 0 && docCount === 0 && !loading;

  const docPagination: TablePaginationConfig = {
    current: docPage,
    pageSize: PAGE_SIZE,
    total: docCount,
    showSizeChanger: false,
    onChange: (p) => {
      setDocPage(p);
      setSelectedDocIds([]);
    },
  };

  const kbPagination: TablePaginationConfig = {
    current: kbPage,
    pageSize: PAGE_SIZE,
    total: kbCount,
    showSizeChanger: false,
    onChange: (p) => {
      setKbPage(p);
      setSelectedKbIds([]);
    },
  };

  function DocToolbar() {
    const hasSelection = selectedDocIds.length > 0;
    return (
      <div className="jz-trash-toolbar">
        <Text type="secondary">
          {hasSelection ? `已选 ${selectedDocIds.length} 项` : '勾选后可批量操作'}
        </Text>
        <div className="jz-trash-toolbar-actions">
          <Button
            icon={<UndoOutlined />}
            disabled={!hasSelection}
            loading={busyId === 'batch-restore-docs'}
            onClick={() =>
              void runBatch(
                'batch-restore-docs',
                () => batchRestoreTrashDocuments(selectedDocIds),
                '批量恢复',
                () => setSelectedDocIds([]),
              )
            }
          >
            恢复选中
          </Button>
          {isRoot && (
            <>
              <Popconfirm
                title={`永久删除选中的 ${selectedDocIds.length} 篇文档？`}
                disabled={!hasSelection}
                onConfirm={() =>
                  void runBatch(
                    'batch-purge-docs',
                    () => batchPurgeTrashDocuments(selectedDocIds),
                    '批量永久删除',
                    () => setSelectedDocIds([]),
                  )
                }
              >
                <Button danger disabled={!hasSelection} loading={busyId === 'batch-purge-docs'}>
                  永久删除选中
                </Button>
              </Popconfirm>
              <Popconfirm
                title="永久清空回收站中全部文档？此操作不可撤销。"
                onConfirm={() => void handleEmpty('documents')}
              >
                <Button danger loading={busyId === 'empty-documents'} disabled={docCount === 0}>
                  清空文档
                </Button>
              </Popconfirm>
            </>
          )}
        </div>
      </div>
    );
  }

  function KbToolbar() {
    const hasSelection = selectedKbIds.length > 0;
    return (
      <div className="jz-trash-toolbar">
        <Text type="secondary">
          {hasSelection ? `已选 ${selectedKbIds.length} 项` : '勾选后可批量操作'}
        </Text>
        <div className="jz-trash-toolbar-actions">
          <Button
            icon={<UndoOutlined />}
            disabled={!hasSelection}
            loading={busyId === 'batch-restore-kbs'}
            onClick={() =>
              void runBatch(
                'batch-restore-kbs',
                () => batchRestoreTrashKBs(selectedKbIds),
                '批量恢复',
                () => setSelectedKbIds([]),
              )
            }
          >
            恢复选中
          </Button>
          {isRoot && (
            <>
              <Popconfirm
                title={`永久删除选中的 ${selectedKbIds.length} 个知识库？`}
                disabled={!hasSelection}
                onConfirm={() =>
                  void runBatch(
                    'batch-purge-kbs',
                    () => batchPurgeTrashKBs(selectedKbIds),
                    '批量永久删除',
                    () => setSelectedKbIds([]),
                  )
                }
              >
                <Button danger disabled={!hasSelection} loading={busyId === 'batch-purge-kbs'}>
                  永久删除选中
                </Button>
              </Popconfirm>
              <Popconfirm
                title="永久清空回收站中全部知识库？此操作不可撤销。"
                onConfirm={() => void handleEmpty('knowledge_bases')}
              >
                <Button danger loading={busyId === 'empty-knowledge_bases'} disabled={kbCount === 0}>
                  清空知识库
                </Button>
              </Popconfirm>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading && emptyAll && kbs.length === 0 && docs.length === 0) {
    return (
      <div className="jz-trash-page jz-trash-page--loading">
        <Spin />
      </div>
    );
  }

  return (
    <div className="jz-trash-page">
      <section className="jz-hero" aria-label="题记">
        <div className="jz-hero-quote" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
          <span>回 收 站</span>
        </div>
        <div className="jz-hero-attr">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span>
            文档 {docCount} · 知识库 {kbCount}
          </span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      </section>

      <div className="jz-trash-hint">
        <DeleteOutlined className="jz-trash-hint-icon" aria-hidden />
        <p>
          已删除内容将<strong>永久保留</strong>在回收站，不会自动清空。仅当您执行「恢复」「永久删除」或「清空」时才会变更数据。
        </p>
      </div>

      {emptyAll ? (
        <Empty className="jz-trash-empty" description="回收站为空">
          <Link to="/admin/kbs">去知识库</Link>
        </Empty>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          className="jz-trash-tabs"
          items={[
            {
              key: 'docs',
              label: `文档 (${docCount})`,
              children: (
                <>
                  <DocToolbar />
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={docs}
                    pagination={docPagination}
                    rowSelection={{
                      selectedRowKeys: selectedDocIds,
                      onChange: (keys) => setSelectedDocIds(keys as number[]),
                    }}
                    className="jz-trash-table"
                    columns={[
                      {
                        title: '标题',
                        dataIndex: 'title',
                        render: (t: string) => <span className="jz-trash-title">{t}</span>,
                      },
                      {
                        title: '知识库',
                        render: (_: unknown, row: TrashDocument) => (
                          <span>
                            {row.knowledge_base.name}
                            {row.knowledge_base.is_deleted ? (
                              <Text type="danger">（已删）</Text>
                            ) : null}
                          </span>
                        ),
                      },
                      {
                        title: '删除时间',
                        dataIndex: 'deleted_at',
                        width: 160,
                        render: (v: string | null) =>
                          v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—',
                      },
                      {
                        title: '操作',
                        width: 200,
                        render: (_: unknown, row: TrashDocument) => (
                          <div className="jz-trash-row-actions">
                            <Button
                              type="link"
                              size="small"
                              loading={busyId === `restore-doc-${row.id}`}
                              onClick={() =>
                                void runAction(`restore-doc-${row.id}`, async () => {
                                  await restoreTrashDocument(row.id);
                                  message.success('已恢复');
                                })
                              }
                            >
                              恢复
                            </Button>
                            {isRoot && (
                              <Popconfirm
                                title="永久删除该文档？"
                                onConfirm={() =>
                                  void runAction(`purge-doc-${row.id}`, async () => {
                                    await purgeTrashDocument(row.id);
                                    message.success('已永久删除');
                                  })
                                }
                              >
                                <Button type="link" size="small" danger>
                                  永久删除
                                </Button>
                              </Popconfirm>
                            )}
                          </div>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'kbs',
              label: `知识库 (${kbCount})`,
              children: (
                <>
                  <KbToolbar />
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={kbs}
                    pagination={kbPagination}
                    rowSelection={{
                      selectedRowKeys: selectedKbIds,
                      onChange: (keys) => setSelectedKbIds(keys as number[]),
                    }}
                    className="jz-trash-table"
                    columns={[
                      { title: '名称', dataIndex: 'name', render: (n: string) => <span className="jz-trash-title">{n}</span> },
                      { title: 'slug', dataIndex: 'slug' },
                      {
                        title: '删除时间',
                        dataIndex: 'deleted_at',
                        render: (v: string | null) =>
                          v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—',
                      },
                      {
                        title: '操作',
                        width: 200,
                        render: (_: unknown, row: TrashKB) => (
                          <div className="jz-trash-row-actions">
                            <Button
                              type="link"
                              size="small"
                              loading={busyId === `restore-kb-${row.id}`}
                              onClick={() =>
                                void runAction(`restore-kb-${row.id}`, async () => {
                                  await restoreTrashKB(row.id);
                                  message.success('已恢复');
                                })
                              }
                            >
                              恢复
                            </Button>
                            {isRoot && (
                              <Popconfirm
                                title="永久删除该知识库及关联数据？"
                                onConfirm={() =>
                                  void runAction(`purge-kb-${row.id}`, async () => {
                                    await purgeTrashKB(row.id);
                                    message.success('已永久删除');
                                  })
                                }
                              >
                                <Button type="link" size="small" danger>
                                  永久删除
                                </Button>
                              </Popconfirm>
                            )}
                          </div>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      )}

      {!emptyAll ? (
        <div className="jz-trash-footer">
          <Popconfirm
            title="永久清空回收站中的全部文档与知识库？此操作不可撤销。"
            onConfirm={() => void handleEmpty('all')}
          >
            <Button danger icon={<DeleteOutlined />} loading={busyId === 'empty-all'}>
              清空全部回收站
            </Button>
          </Popconfirm>
          <Link to="/admin/kbs">返回知识库</Link>
        </div>
      ) : null}
    </div>
  );
}
