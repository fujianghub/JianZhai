import { useEffect, useState } from 'react';
import { Input, List, Modal, Spin, Tag, Typography } from 'antd';
import { searchMentions, type MentionSuggestion } from '@/api/linking';

const { Text } = Typography;

interface Props {
  open: boolean;
  onCancel: () => void;
  onSelect: (suggestion: MentionSuggestion) => void;
}

export default function MentionPicker({ open, onCancel, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MentionSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQ('');
      setActive(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const data = await searchMentions(q);
        if (!cancelled) {
          setItems(data);
          setActive(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q, open]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // IME confirm-Enter (isComposing) is for the candidate word, not us.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const pick = items[active];
      if (pick) onSelect(pick);
    }
  }

  return (
    <Modal open={open} onCancel={onCancel} footer={null} title="插入文档引用 @">
      <Input
        autoFocus
        placeholder="搜索文档标题..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={handleKey}
        allowClear
      />
      <div style={{ marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : (
          <List
            size="small"
            dataSource={items}
            locale={{ emptyText: '无匹配文档' }}
            renderItem={(item, idx) => (
              <List.Item
                onClick={() => onSelect(item)}
                style={{
                  cursor: 'pointer',
                  background:
                    idx === active
                      ? 'color-mix(in srgb, var(--jz-accent) 14%, transparent)'
                      : undefined,
                  padding: '8px 12px',
                }}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ fontWeight: 500, color: 'var(--jz-text)' }}>{item.title}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <Tag color="blue">{item.knowledge_base.name}</Tag>
                  </Text>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  );
}
