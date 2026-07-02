import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Input, Modal, Spin, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { search as searchApi, type SearchResult } from '@/api/search';

const { Text } = Typography;

/** Compile the token list + split regex for a query. Cached (single-entry) so
 *  a render that highlights N results — each calling ``highlight`` for title
 *  and snippet — compiles the regex once, not 2N times. ``String.split`` with a
 *  /g regex doesn't rely on ``lastIndex``, so reusing the RegExp is safe. */
let _hlCache: { q: string; tokens: string[]; re: RegExp | null } | null = null;
function compileHighlight(query: string): { tokens: string[]; re: RegExp | null } {
  const q = (query || '').trim();
  if (_hlCache && _hlCache.q === q) return _hlCache;
  const tokens = Array.from(new Set(q.split(/\s+/).filter((t) => t.length > 0)))
    .sort((a, b) => b.length - a.length);
  let re: RegExp | null = null;
  if (tokens.length > 0) {
    const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    re = new RegExp(`(${escaped.join('|')})`, 'gi');
  }
  _hlCache = { q, tokens, re };
  return _hlCache;
}

/** Wrap each query token occurrence in <mark> so search hits visually pop in
 *  result titles and snippets. Case-insensitive; longest tokens first so
 *  "JianZhai" matches before "Jian" creates two side-by-side highlights. */
function highlight(text: string, query: string): ReactNode {
  if (!query || !text) return text;
  const { tokens, re } = compileHighlight(query);
  if (!re || tokens.length === 0) return text;
  const parts = text.split(re);
  return parts.map((p, i) =>
    p && tokens.some((t) => t.toLowerCase() === p.toLowerCase())
      ? <mark key={i} className="jz-search-hit">{p}</mark>
      : <span key={i}>{p}</span>,
  );
}

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
              {highlight(r.title, q)}
            </div>
            <div style={{ color: 'var(--jz-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
              {highlight(r.snippet, q)}
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
