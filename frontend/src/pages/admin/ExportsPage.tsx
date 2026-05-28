import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { message } from '@/utils/notify';
import * as exportsApi from '@/api/exports';
import { formatApiError } from '@/api/client';
import type { ExportFormat, ExportStatus, ExportTask } from '@/api/exports';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

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

export default function ExportsPage() {
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await exportsApi.listExports();
      setTasks(data);
      return data;
    } catch (err) {
      message.error(formatApiError(err, '加载导出历史失败'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleDownload(task: ExportTask) {
    setDownloadingId(task.id);
    try {
      await exportsApi.downloadExport(task);
    } catch (err) {
      message.error(formatApiError(err, '下载失败'));
    } finally {
      setDownloadingId(null);
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
    let failed = 0;
    for (const id of ids) {
      try {
        await exportsApi.deleteExport(id);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      message.success(`已删除 ${ids.length} 项`);
    } else {
      message.warning(`已删除 ${ids.length - failed} 项，${failed} 项失败`);
    }
    setSelected([]);
    await refresh();
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
    pollRef.current = window.setInterval(() => void refresh(), 2000);
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
              <Button danger icon={<DeleteOutlined />}>
                批量删除 ({selected.length})
              </Button>
            </Popconfirm>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()}>
            刷新
          </Button>
          </Space>
        }
      />
      <div className="jz-admin-panel">
      {tasks.length === 0 && !loading ? (
        <Empty description="还没有导出过任何内容" />
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
                    {t.scope === 'doc' ? '单文档' : t.scope === 'folder' ? '文件夹' : '整知识库'}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: '格式',
              dataIndex: 'format',
              render: (f: ExportFormat) => <Tag>{FORMAT_LABELS[f]}</Tag>,
            },
            {
              title: '状态',
              dataIndex: 'status',
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
              render: (size: number) =>
                size > 0 ? `${(size / 1024).toFixed(1)} KB` : '-',
            },
            {
              title: '创建时间',
              dataIndex: 'created_at',
              render: (t: string) => dayjs(t).format('MM-DD HH:mm:ss'),
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
                    <Alert
                      type="error"
                      message="失败"
                      description={
                        t.error ? (
                          <Paragraph
                            type="danger"
                            style={{ margin: 0, fontSize: 12 }}
                            ellipsis={{ rows: 2, expandable: true, symbol: '更多' }}
                          >
                            {errorSummary(t.error)}
                          </Paragraph>
                        ) : undefined
                      }
                      style={{ padding: '4px 8px' }}
                    />
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
