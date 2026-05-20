import { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Modal, Spin, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { search as searchApi, type SearchResult } from '@/api/search';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  /** If provided, clicking a result navigates here instead of the admin KB URL. */
  resultUrl?: (r: SearchResult) => string;
}

export default function GlobalSearch({ open, onClose, resultUrl }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
      setActive(0);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const mine = ++seqRef.current;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await searchApi(trimmed);
        if (mine === seqRef.current) {
          setResults(res.results);
          setActive(0);
        }
      } finally {
        if (mine === seqRef.current) setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [q, open]);

  const goTo = useCallback(
    (r: SearchResult) => {
      onClose();
      navigate(resultUrl ? resultUrl(r) : `/admin/kbs/${r.knowledge_base.id}?doc=${r.id}`);
    },
    [navigate, onClose, resultUrl]
  );

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[active];
      if (pick) goTo(pick);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      closable={false}
      destroyOnHidden
      width={620}
      styles={{ body: { padding: 12 } }}
    >
      <Input
        autoFocus
        size="large"
        placeholder="搜索标题或正文…（Esc 关闭）"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={handleKey}
      />
      <div style={{ marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
        {loading && (
          <div style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
            <Spin />
          </div>
        )}
        {!loading && q.trim() && results.length === 0 && (
          <div style={{ color: 'var(--jz-text-muted)', padding: 16, textAlign: 'center' }}>
            无结果
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
              background:
                idx === active
                  ? 'color-mix(in srgb, var(--jz-accent) 14%, transparent)'
                  : 'transparent',
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--jz-text)' }}>
              {r.title}
            </div>
            <div style={{ color: 'var(--jz-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
              {r.snippet}
            </div>
            <div style={{ marginTop: 4 }}>
              <Tag color="blue">{r.knowledge_base.name}</Tag>
              <Tag color={r.status === 'published' ? 'green' : 'default'}>
                {r.status === 'published' ? '已发布' : '草稿'}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                rank {r.rank.toFixed(3)}
              </Text>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
