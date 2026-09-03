import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { message } from '@/utils/notify';
import * as exportsApi from '@/api/exports';
import { formatApiError } from '@/api/client';
import type { ExportFormat, ExportStatus, ExportTask } from '@/api/exports';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import JzEmpty from '@/components/common/JzEmpty';

const { Paragraph } = Typography;

const STATUS_COLORS: Record<ExportStatus, string> = {
  pending: 'default',
  running: 'blue',
  done: 'green',
  failed: 'red',
};

const FORMAT_LABELS: Record<ExportFormat, string> = {
  md: 'Markdown',
  html: 'HTML',
  pdf: 'PDF',
  docx: 'DOCX',
  site: '整站 zip',
};

function errorSummary(err: string, max = 200): string {
  const line = (err || '').split('\n')[0]?.trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function formatSize(size: number): string {
  if (!size || size <= 0) return '-';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(t: ExportTask): string {
  if (!t.started_at) return '-';
  const end = t.completed_at ? dayjs(t.completed_at) : dayjs();
  const secs = end.diff(dayjs(t.started_at), 'second');
  if (secs < 0) return '-';
  const label = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
  return t.completed_at ? label : `已运行 ${label}`;
}

export default function ExportsPage() {
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean; spin?: boolean }) => {
    if (opts?.spin) setLoading(true);
    try {
      const data = await exportsApi.listExports();
      setTasks(data);
      return data;
    } catch (err) {
      // 轮询回调里的报错必须静默——否则后端抖动时每 2 秒糊一个红 toast
      if (!opts?.silent) {
        message.error(formatApiError(err, '加载导出历史失败'));
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  function handleDownload(task: ExportTask) {
    // Native ``<a href>`` triggers an immediate browser download — there's no
    // promise to await and nothing to throw. The transient busy state still
    // surfaces the click affordance, then clears on the next microtask.
    setDownloadingId(task.id);
    try {
      exportsApi.downloadExport(task);
    } catch (err) {
      message.error(formatApiError(err, '下载失败'));
    } finally {
      window.setTimeout(() => setDownloadingId(null), 400);
    }
  }

  async function handleDelete(id: number) {
    try {
      await exportsApi.deleteExport(id);
      message.success('已删除');
      setSelected((s) => s.filter((x) => x !== id));
      await refresh();
    } catch (err) {
      message.error(formatApiError(err, '删除失败'));
    }
  }

  async function handleBulkDelete() {
    if (selected.length === 0) return;
    const ids = [...selected];
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => exportsApi.deleteExport(id)));
      const failedIds = ids.filter((_, i) => results[i]?.status === 'rejected');
      if (failedIds.length === 0) {
        message.success(`已删除 ${ids.length} 项`);
        setSelected([]);
      } else {
        message.warning(`已删除 ${ids.length - failedIds.length} 项，${failedIds.length} 项失败`);
        // 失败项保留勾选，便于直接重试
        setSelected(failedIds);
      }
    } finally {
      setBulkDeleting(false);
      await refresh({ silent: true });
    }
  }

  async function handleRetry(t: ExportTask) {
    // 以相同参数重建任务（selection 的勾选组合未随任务下发，无法重放）
    setRetryingId(t.id);
    try {
      await exportsApi.createExport({ scope: t.scope, target_id: t.target_id, format: t.format });
      message.success('已重新创建导出任务');
      await refresh({ silent: true });
    } catch (err) {
      message.error(formatApiError(err, '重试失败'));
    } finally {
      setRetryingId(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const hasInflight = tasks.some((t) => t.status === 'pending' || t.status === 'running');
    if (!hasInflight) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => void refresh({ silent: true }), 2000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [tasks, refresh]);

  return (
    <div>
      <AdminPageHeader
        backTo="/admin"
        backLabel="工作台"
        title="导出历史"
        actions={
          <Space>
          {selected.length > 0 && (
            <Popconfirm
              title={`删除选中的 ${selected.length} 项？该操作会同时删除已生成的文件，无法恢复。`}
              onConfirm={handleBulkDelete}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />} loading={bulkDeleting}>
                批量删除 ({selected.length})
              </Button>
            </Popconfirm>
          )}
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void refresh({ spin: true })}
          >
            刷新
          </Button>
          </Space>
        }
      />
      <div className="jz-admin-panel">
      {tasks.length === 0 && !loading ? (
        <JzEmpty description="还没有导出过任何内容"  />
      ) : (
        <Table<ExportTask>
          rowKey="id"
          loading={loading}
          dataSource={tasks}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys.map((k) => Number(k))),
          }}
          columns={[
            {
              title: '目标',
              dataIndex: 'target_label',
              render: (label, t) => (
                <Space direction="vertical" size={0}>
                  <span>{label || `#${t.target_id}`}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t.scope === 'doc'
                      ? '单文档'
                      : t.scope === 'folder'
                      ? '文件夹'
                      : t.scope === 'selection'
                      ? '批量选择'
                      : '整知识库'}
                  </Typography.Text>
                  {t.filename && (
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12, maxWidth: 280 }}
                      ellipsis={{ tooltip: t.filename }}
                    >
                      {t.filename}
                    </Typography.Text>
                  )}
                </Space>
              ),
            },
            {
              title: '格式',
              dataIndex: 'format',
              filters: Object.entries(FORMAT_LABELS).map(([value, text]) => ({
                value,
                text,
              })),
              onFilter: (value, t) => t.format === value,
              render: (f: ExportFormat) => <Tag>{FORMAT_LABELS[f]}</Tag>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              filters: [
                { value: 'pending', text: '排队中' },
                { value: 'running', text: '处理中' },
                { value: 'done', text: '完成' },
                { value: 'failed', text: '失败' },
              ],
              onFilter: (value, t) => t.status === value,
              render: (s: ExportStatus, t) => (
                <Tooltip title={t.error || ''}>
                  <Tag color={STATUS_COLORS[s]}>
                    {s === 'pending'
                      ? '排队中'
                      : s === 'running'
                      ? '处理中'
                      : s === 'done'
                      ? '完成'
                      : '失败'}
                  </Tag>
                </Tooltip>
              ),
            },
            {
              title: '大小',
              dataIndex: 'file_size',
              render: (size: number) => formatSize(size),
            },
            {
              title: '耗时',
              key: 'duration',
              render: (_, t) => formatDuration(t),
            },
            {
              title: '创建时间',
              dataIndex: 'created_at',
              sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
              render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
            },
            {
              title: '操作',
              render: (_, t) => (
                <Space size={4} direction="vertical" style={{ width: '100%' }}>
                  {t.status === 'done' ? (
                    <Button
                      size="small"
                      type="primary"
                      icon={<DownloadOutlined />}
                      loading={downloadingId === t.id}
                      onClick={() => void handleDownload(t)}
                    >
                      下载
                    </Button>
                  ) : t.status === 'failed' ? (
                    <>
                      {/* Status column already carries the 失败 tag — here just a
                          compact reason line so failed rows don't balloon to
                          twice the height of the rest of the table. */}
                      <Tooltip title={errorSummary(t.error || '') || '导出失败'}>
                        <Paragraph
                          type="danger"
                          style={{ margin: 0, fontSize: 12, maxWidth: 220 }}
                          ellipsis={{ rows: 1 }}
                        >
                          {errorSummary(t.error || '') || '导出失败'}
                        </Paragraph>
                      </Tooltip>
                      {t.scope !== 'selection' && (
                        <Button
                          size="small"
                          loading={retryingId === t.id}
                          onClick={() => void handleRetry(t)}
                        >
                          重试
                        </Button>
                      )}
                    </>
                  ) : (
                    <span>—</span>
                  )}
                  <Popconfirm
                    title="删除这条导出记录？已生成的文件会一并删除。"
                    onConfirm={() => handleDelete(t.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}
      </div>
    </div>
  );
}
