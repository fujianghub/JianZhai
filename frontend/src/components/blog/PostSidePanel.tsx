/**
 * Right rail of the Markdown reading page: the table of contents plus — when
 * the reader is logged in on a Markdown doc — a 笔记 tab listing their
 * highlights (mirrors the EPUB sidebar's notes tab; same list styling).
 */
import { useMemo, useState } from 'react';
import { Input, Segmented, Spin, Tag, Tooltip } from 'antd';
import { CloseOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons';
import TocPanel from '@/components/common/TocPanel';
import { groupByChapter, swatchHex } from '@/utils/epubNotes';
import type { MdAnnotationsApi } from '@/components/blog/MdAnnotator';
import type { TocEntry } from '@/utils/markdown';
import IconButton from '@/components/common/IconButton';
import JzEmpty from '@/components/common/JzEmpty';

interface Props {
  toc: TocEntry[];
  /** Null hides the 笔记 tab entirely (anonymous / non-markdown docs). */
  notes: MdAnnotationsApi | null;
  onClose?: () => void;
}

export default function PostSidePanel({ toc, notes, onClose }: Props) {
  const [tab, setTab] = useState<'toc' | 'notes'>('toc');
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    if (!notes) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? notes.highlights.filter((h) => (h.text + '\n' + h.note + '\n' + h.chapter).toLowerCase().includes(q))
      : notes.highlights;
    // Already in reading order — group contiguous chapters like the EPUB list.
    return groupByChapter(list);
  }, [notes, query]);

  if (!notes) return <TocPanel toc={toc} onClose={onClose} />;

  const count = notes.highlights.length;
  return (
    <nav className="jz-toc jz-post-side-panel" aria-label="目录与笔记">
      <div className="jz-post-side-head">
        <Segmented
          size="small"
          value={tab}
          onChange={(v) => setTab(v as 'toc' | 'notes')}
          options={[
            { label: '目录', value: 'toc' },
            { label: count ? `笔记 ${count}` : '笔记', value: 'notes' },
          ]}
        />
        <span style={{ flex: 1 }} />
        {tab === 'notes' && (
          <Tooltip title="导出为 Markdown 笔记">
            <IconButton
              icon={<ExportOutlined />}
              onClick={notes.openExport}
              disabled={count === 0}
              aria-label="导出笔记"
            />
          </Tooltip>
        )}
        {onClose && (
          <Tooltip title="隐藏侧栏">
            <IconButton icon={<CloseOutlined />} onClick={onClose} aria-label="隐藏侧栏" />
          </Tooltip>
        )}
      </div>
      {tab === 'toc' ? (
        <TocPanel toc={toc} hideHeader />
      ) : !notes.loaded ? (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <Spin size="small" />
        </div>
      ) : count === 0 ? (
        <JzEmpty description="选中正文文字即可划线、写笔记" style={{ marginTop: 16 }} size="sm" />
      ) : (
        <div className="jz-epub-notes jz-post-notes">
          {count > 8 && (
            <Input
              size="small"
              allowClear
              variant="filled"
              prefix={<SearchOutlined style={{ color: 'var(--jz-text-muted)' }} />}
              placeholder={`筛选笔记（${count} 条）`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ margin: '6px 0' }}
              aria-label="筛选笔记"
            />
          )}
          {groups.length === 0 ? (
            <JzEmpty description="没有匹配的笔记" size="sm" />
          ) : (
            groups.map((g, gi) => (
              <div key={gi} className="jz-epub-search-group">
                <div className="jz-epub-search-chapter" title={g.chapter}>
                  {g.chapter || '（正文）'}
                </div>
                {g.items.map((h) => (
                  <button
                    type="button"
                    key={h.id}
                    className={'jz-epub-note is-' + h.style}
                    style={{ ['--jz-swatch' as string]: swatchHex(h.color) } as React.CSSProperties}
                    onClick={() => notes.openHighlight(h)}
                    title={notes.invalidIds.has(h.id) ? '原文中已找不到这段文字' : '跳转到该处'}
                  >
                    <span className="jz-epub-note-quote">
                      {notes.invalidIds.has(h.id) && (
                        <Tag color="default" style={{ marginRight: 6, fontSize: 'var(--jz-fs-3xs, 10px)', lineHeight: '16px' }}>
                          已失效
                        </Tag>
                      )}
                      {h.text || '（无引文）'}
                    </span>
                    {h.note && <span className="jz-epub-note-text">{h.note}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </nav>
  );
}
