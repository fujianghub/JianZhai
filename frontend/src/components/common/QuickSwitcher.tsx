import { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Modal, Spin, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { search as searchApi, type SearchResult } from '@/api/search';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 快速跳转 (⌘P / Ctrl+P) — 比 GlobalSearch 更轻:
 * 只显示标题 + KB 名,小内距,enter 直达;无 snippet/rank 干扰。
 * 后端搜索接口本来就吃标题 tsvector,所以同一个 search endpoint 直接复用。
 */
export default function QuickSwitcher({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const seqRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mySeq = ++seqRef.current;
    const t = window.setTimeout(async () => {
      try {
        const data = await searchApi(q.trim());
        if (mySeq !== seqRef.current) return;
        setResults(data.results);
        setActive(0);
      } catch {
        if (mySeq === seqRef.current) setResults([]);
      } finally {
        if (mySeq === seqRef.current) setLoading(false);
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const goTo = useCallback(
    (r: SearchResult) => {
      navigate(`/admin/kbs/${r.knowledge_base.id}/docs/${r.id}`);
      onClose();
    },
    [navigate, onClose],
  );

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(results.length - 1, a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = results[active];
        if (r) goTo(r);
      }
    },
    [results, active, goTo],
  );

  // Keep the active row visible inside the scrollable list.
  useEffect(() => {
    const el = listRef.current?.querySelectorAll<HTMLButtonElement>('button')[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnHidden
      width={620}
      styles={{ body: { padding: 0 } }}
      className="jz-quick-switcher-modal"
    >
      <Input
        autoFocus
        placeholder="跳转到文档… (↑↓ 选择,Enter 打开,Esc 关闭)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        size="large"
        variant="borderless"
        style={{
          padding: '14px 18px',
          fontSize: 15,
          borderBottom: '1px solid var(--jz-divider)',
        }}
      />
      <div ref={listRef} style={{ maxHeight: '60vh', overflowY: 'auto', padding: 4 }}>
        {loading && (
          <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
            <Spin size="small" />
          </div>
        )}
        {!loading && q.trim() && results.length === 0 && (
          <div style={{ color: 'var(--jz-text-muted)', padding: 24, textAlign: 'center' }}>
            没找到匹配的文档
          </div>
        )}
        {!loading && !q.trim() && (
          <div style={{ color: 'var(--jz-text-muted)', padding: 24, textAlign: 'center', fontSize: 13 }}>
            输入标题前几个字快速跳转
          </div>
        )}
        {results.map((r, idx) => (
          <button
            key={r.id}
            type="button"
            onClick={() => goTo(r)}
            onMouseEnter={() => setActive(idx)}
            className="global-search-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              background:
                idx === active
                  ? 'color-mix(in srgb, var(--jz-accent) 14%, transparent)'
                  : 'transparent',
            }}
          >
            <span style={{ flex: 1, color: 'var(--jz-text)', fontSize: 14 }}>
              {r.title}
            </span>
            <Tag color="blue" style={{ marginRight: 0 }}>{r.knowledge_base.name}</Tag>
            {r.status !== 'published' && (
              <Text type="secondary" style={{ fontSize: 11 }}>草稿</Text>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
