/**
 * In-reader full-text search panel shared by the EPUB sidebar and the PDF
 * outline panel (batch 9): input, hit counter with 上一处/下一处, grouped hit
 * list with the current hit highlighted. Purely presentational — the caller
 * runs the search (streaming groups in) and performs the jump.
 *
 * Class names stay `.jz-epub-search-*` so the existing reader.css rules apply
 * unchanged to both readers.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Input, Spin, Tooltip, Typography } from 'antd';
import Chevron from '../Chevron';
import IconButton from '@/components/common/IconButton';
import JzEmpty from '@/components/common/JzEmpty';

const { Text } = Typography;

export interface SearchHit<T = unknown> {
  pre: string;
  match: string;
  post: string;
  /** Opaque locator handed back on jump (CFI for EPUB, page+rect for PDF). */
  target: T;
}

export interface SearchGroup<T = unknown> {
  label: string;
  hits: SearchHit<T>[];
}

export interface SearchResultsProps<T> {
  placeholder?: string;
  /** Text shown while groups stream in. */
  scanningLabel?: string;
  /** Run a search; call `push` per group as results arrive. */
  onSearch: (query: string, push: (group: SearchGroup<T>) => void) => Promise<void>;
  /** Clear any highlight state the caller keeps for the last search. */
  onClear?: () => void;
  /** Jump to a hit (also called by 上一处 / 下一处). */
  onJump: (hit: SearchHit<T>, index: number) => void;
  /** External request (e.g. selection bar's 搜本书): `{query, seq}`. */
  request?: { query: string; seq: number } | null;
  /** Anything to render under the input (e.g. a scope switch). */
  extra?: ReactNode;
}

export function useSearchResults<T>(props: SearchResultsProps<T>) {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SearchGroup<T>[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const runRef = useRef(0);
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  const flat = groups.flatMap((g) => g.hits);

  const submit = async (q: string) => {
    const trimmed = q.trim();
    const run = ++runRef.current;
    props.onClear?.();
    setGroups([]);
    setSearched(false);
    setCursor(null);
    if (!trimmed) return;
    setSearching(true);
    setSearched(true);
    try {
      await props.onSearch(trimmed, (g) => {
        if (runRef.current !== run) return;
        setGroups((prev) => [...prev, g]);
      });
    } finally {
      if (runRef.current === run) setSearching(false);
    }
  };
  const jump = (i: number) => {
    if (i < 0 || i >= flat.length) return;
    setCursor(i);
    props.onJump(flat[i], i);
  };
  return { query, setQuery, groups, searching, searched, cursor, total, submit, jump };
}

export default function SearchResults<T>(props: SearchResultsProps<T>) {
  const s = useSearchResults(props);
  const lastSeq = useRef<number | null>(null);
  if (props.request && props.request.query.trim() && props.request.seq !== lastSeq.current) {
    lastSeq.current = props.request.seq;
    s.setQuery(props.request.query);
    void s.submit(props.request.query);
  }
  const { total, cursor } = s;
  return (
    <div className="jz-epub-search">
      <Input.Search
        size="small"
        allowClear
        placeholder={props.placeholder ?? '搜索…'}
        value={s.query}
        onChange={(e) => s.setQuery(e.target.value)}
        onSearch={(v) => void s.submit(v)}
        loading={s.searching}
        aria-label="搜索"
      />
      {props.extra}
      {s.searched && (
        <div className="jz-epub-search-nav">
          <Text type="secondary" style={{ fontSize: 'var(--jz-fs-xs)' }}>
            {s.searching ? (props.scanningLabel ?? '正在扫描…') : cursor == null ? `共 ${total} 处` : `${cursor + 1} / ${total} 处`}
          </Text>
          {total > 0 && (
            <span className="jz-epub-search-nav-btns">
              <Tooltip title="上一处">
                <IconButton
                  icon={<Chevron direction="up" />}
                  onClick={() => s.jump(cursor == null ? total - 1 : (cursor - 1 + total) % total)}
                  aria-label="上一处"
                />
              </Tooltip>
              <Tooltip title="下一处">
                <IconButton
                  icon={<Chevron direction="down" />}
                  onClick={() => s.jump(cursor == null ? 0 : (cursor + 1) % total)}
                  aria-label="下一处"
                />
              </Tooltip>
            </span>
          )}
        </div>
      )}
      {s.searching && s.groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <Spin size="small" />
        </div>
      )}
      {(() => {
        let flat = -1;
        return s.groups.map((g, gi) => (
          <div key={gi} className="jz-epub-search-group">
            <div className="jz-epub-search-chapter" title={g.label}>
              {g.label || '（正文）'}
            </div>
            {g.hits.map((h, hi) => {
              flat += 1;
              const idx = flat;
              return (
                <button
                  type="button"
                  key={hi}
                  className={'jz-epub-search-hit' + (idx === cursor ? ' is-current' : '')}
                  onClick={() => s.jump(idx)}
                  title="跳转到该处"
                >
                  <span>{h.pre}</span>
                  <mark>{h.match}</mark>
                  <span>{h.post}</span>
                </button>
              );
            })}
          </div>
        ));
      })()}
      {s.searched && !s.searching && total === 0 && <JzEmpty description="没有找到匹配内容" size="sm" />}
    </div>
  );
}
