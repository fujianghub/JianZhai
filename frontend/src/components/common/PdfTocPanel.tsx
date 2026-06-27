import { useMemo } from 'react';
import { Button, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { PdfTocEntry } from '@/utils/pdfOutline';

const { Text } = Typography;

interface Props {
  entries: PdfTocEntry[];
  /** 1-based page currently shown in the canvas. */
  currentPage: number;
  /** Jump the renderer to a 1-based page. */
  onJump: (page: number) => void;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
  /** Stick the rail to the top while the page scrolls (flow mode). */
  sticky?: boolean;
}

/**
 * Table-of-contents sidebar for a PDF's embedded bookmarks. Unlike the Markdown
 * TocPanel (which observes DOM headings), the PDF reader paints one canvas page
 * at a time, so clicking jumps the page and the active entry is computed as the
 * last bookmark whose page is at or before the current page.
 */
export default function PdfTocPanel({ entries, currentPage, onJump, onClose, sticky }: Props) {
  // Active = the last resolvable bookmark that starts on or before this page.
  const activeKey = useMemo(() => {
    let key: string | null = null;
    for (const e of entries) {
      if (e.page != null && e.page <= currentPage) key = e.key;
    }
    return key;
  }, [entries, currentPage]);

  if (entries.length === 0) return null;

  return (
    <nav className={'jz-toc jz-pdf-toc' + (sticky ? ' jz-pdf-toc--sticky' : '')} aria-label="PDF 目录">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <Text type="secondary" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
          目录
        </Text>
        {onClose && (
          <Tooltip title="隐藏目录">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
              aria-label="隐藏目录"
            />
          </Tooltip>
        )}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
        {entries.map((entry) => {
          const active = activeKey === entry.key;
          const jumpable = entry.page != null;
          return (
            <li
              key={entry.key}
              style={{
                paddingLeft: (entry.level - 1) * 12,
                marginBottom: 2,
              }}
            >
              <a
                href={jumpable ? `#pdf-page-${entry.page}` : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  if (jumpable) onJump(entry.page as number);
                }}
                className={'jz-toc-link' + (active ? ' is-active' : '')}
                title={entry.title}
                style={{
                  display: 'block',
                  padding: '4px 8px',
                  fontSize: 13,
                  lineHeight: 1.45,
                  cursor: jumpable ? 'pointer' : 'default',
                  color: active
                    ? 'var(--jz-doc-accent, var(--jz-accent))'
                    : jumpable
                      ? 'var(--jz-text-muted)'
                      : 'var(--jz-text-disabled, var(--jz-text-muted))',
                  fontWeight: active ? 600 : 400,
                  borderLeft: `2px solid ${active ? 'var(--jz-doc-accent, var(--jz-accent))' : 'transparent'}`,
                  textDecoration: 'none',
                  borderRadius: 2,
                  opacity: jumpable ? 1 : 0.6,
                  transition: 'color 120ms ease, border-color 120ms ease',
                }}
              >
                {entry.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
