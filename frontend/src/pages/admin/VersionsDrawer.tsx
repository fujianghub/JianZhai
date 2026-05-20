import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { message } from '@/utils/notify';
import { HistoryOutlined, RollbackOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as versionsApi from '@/api/versions';
import type { VersionDetail, VersionSummary } from '@/api/versions';
import DiffView from '@/components/diff/DiffView';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  documentId: number;
  /** Called after a successful restore so the parent can refresh editor content. */
  onRestored?: () => void;
}

export default function VersionsDrawer({ open, onClose, documentId, onRestored }: Props) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [message_, setMessage] = useState('');
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffPair, setDiffPair] = useState<{ a: VersionDetail; b: VersionDetail } | null>(null);
  /** v ids selected for diff (max 2). */
  const [selected, setSelected] = useState<number[]>([]);

  const refresh = useCallback(async () => {
    if (!open) return;
    setVersions(null);
    setVersions(await versionsApi.listVersions(documentId));
  }, [documentId, open]);

  useEffect(() => {
    void refresh();
    setSelected([]);
  }, [refresh]);

  async function handleCreate() {
    setCreating(true);
    try {
      await versionsApi.createVersion(documentId, message_);
      setMessage('');
      message.success('已保存版本');
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(vid: number) {
    await versionsApi.restoreVersion(documentId, vid);
    message.success('已回滚');
    onRestored?.();
    await refresh();
  }

  function toggleSelected(vid: number) {
    setSelected((prev) => {
      if (prev.includes(vid)) return prev.filter((x) => x !== vid);
      if (prev.length === 2) return [prev[1], vid];
      return [...prev, vid];
    });
  }

  async function openDiff() {
    if (selected.length !== 2) return;
    const [a, b] = selected;
    const pair = await versionsApi.diffVersions(documentId, a, b);
    setDiffPair(pair);
    setDiffOpen(true);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={<><HistoryOutlined /> 历史版本</>}
      width={520}
      destroyOnHidden
    >
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--jz-surface-2)', borderRadius: 6 }}>
        <Input
          placeholder="版本说明（可选）"
          value={message_}
          onChange={(e) => setMessage(e.target.value)}
          onPressEnter={handleCreate}
        />
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={creating}
          onClick={handleCreate}
          style={{ marginTop: 8 }}
          block
        >
          保存当前版本
        </Button>
      </div>

      {selected.length === 2 && (
        <div style={{ marginBottom: 12 }}>
          <Button block onClick={openDiff}>
            对比 v#{selected[0]} ↔ v#{selected[1]}
          </Button>
        </div>
      )}

      {versions === null ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : versions.length === 0 ? (
        <Empty description="还没有保存过版本" />
      ) : (
        <List
          itemLayout="vertical"
          dataSource={versions}
          renderItem={(v) => {
            const active = selected.includes(v.id);
            return (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: active
                    ? 'color-mix(in srgb, var(--jz-accent) 14%, transparent)'
                    : undefined,
                  padding: 12,
                  borderRadius: 6,
                }}
                onClick={() => toggleSelected(v.id)}
                actions={[
                  <Popconfirm
                    key="restore"
                    title={`回滚到 v#${v.id}？`}
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      void handleRestore(v.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      size="small"
                      icon={<RollbackOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    >
                      回滚
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <Space>
                  <Tag>v#{v.id}</Tag>
                  <Text strong>{v.message || '(无说明)'}</Text>
                </Space>
                <div style={{ color: 'var(--jz-text-muted)', fontSize: 12, marginTop: 4 }}>
                  {dayjs(v.created_at).format('YYYY-MM-DD HH:mm')} · {v.word_count} 字
                </div>
              </List.Item>
            );
          }}
        />
      )}

      <Modal
        open={diffOpen}
        onCancel={() => setDiffOpen(false)}
        footer={null}
        width={1000}
        title={
          diffPair ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>版本对比</span>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--jz-text-muted)',
                  fontWeight: 400,
                }}
              >
                v#{diffPair.a.id} ({dayjs(diffPair.a.created_at).format('YYYY-MM-DD HH:mm')})
                {diffPair.a.message && ` · ${diffPair.a.message}`}
                {' → '}
                v#{diffPair.b.id} ({dayjs(diffPair.b.created_at).format('YYYY-MM-DD HH:mm')})
                {diffPair.b.message && ` · ${diffPair.b.message}`}
              </span>
            </div>
          ) : (
            '版本对比'
          )
        }
      >
        {diffPair && (
          <DiffView
            a={diffPair.a.content}
            b={diffPair.b.content}
            labelA={`v#${diffPair.a.id}`}
            labelB={`v#${diffPair.b.id}`}
          />
        )}
      </Modal>
    </Drawer>
  );
}
