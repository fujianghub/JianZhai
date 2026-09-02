/**
 * Floating toolbar over a text selection inside the EPUB chapter iframe.
 *
 * Lives in the *host* document (inside the reader wrapper, so it survives
 * full-screen) and is positioned from the selection's rect mapped through the
 * iframe element — never inside the chapter DOM (CFI paths).
 */
import { Tooltip } from 'antd';
import { CopyOutlined, EditOutlined, LinkOutlined, SearchOutlined, UnderlineOutlined } from '@ant-design/icons';
import { HIGHLIGHT_SWATCHES } from '@/utils/epubNotes';
import type { HighlightColor, HighlightStyle } from '@/api/reading';

/** Wavy-underline glyph (AntD has no squiggly icon). */
export function SquigglyIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M2 7.5c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 11.5c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export interface SelectionAnchor {
  /** Selection box relative to the stage (px). */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  anchor: SelectionAnchor;
  /** Stage box for clamping. */
  stageWidth: number;
  stageHeight: number;
  /** Highlighting needs a document id + a session; otherwise only copy /
   * search / quote are offered. */
  canHighlight: boolean;
  lastColor: HighlightColor;
  onCopy: () => void;
  onHighlight: (color: HighlightColor, style: HighlightStyle) => void;
  onNote: () => void;
  /** 在本书中搜索 — omitted on surfaces without in-document search. */
  onSearch?: () => void;
  onQuote: () => void;
  /** Extra trailing action (the Markdown page mounts its AI dropdown here). */
  aiSlot?: React.ReactNode;
  popupContainer?: () => HTMLElement;
}

const BAR_H = 36;
const BAR_W_FULL = 402;
const BAR_W_MIN = 168;

export default function EpubSelectionBar({
  anchor,
  stageWidth,
  stageHeight,
  canHighlight,
  lastColor,
  onCopy,
  onHighlight,
  onNote,
  onSearch,
  onQuote,
  aiSlot,
  popupContainer,
}: Props) {
  const width = canHighlight ? BAR_W_FULL : BAR_W_MIN;
  const above = anchor.y - BAR_H - 10;
  const below = anchor.y + anchor.h + 10;
  const top = above >= 4 ? above : Math.min(below, stageHeight - BAR_H - 4);
  const left = Math.max(4, Math.min(anchor.x + anchor.w / 2 - width / 2, stageWidth - width - 4));
  const tip = (t: string) => ({ title: t, getPopupContainer: popupContainer, mouseEnterDelay: 0.4 });
  return (
    <div
      className={'jz-epub-selbar' + (above >= 4 ? ' is-above' : ' is-below')}
      style={{ top, left }}
      role="toolbar"
      aria-label="选中文字操作"
      onPointerDown={(e) => e.preventDefault()}
    >
      <Tooltip {...tip('复制')}>
        <button type="button" className="jz-epub-selbtn" onClick={onCopy} aria-label="复制">
          <CopyOutlined />
        </button>
      </Tooltip>
      {canHighlight && (
        <>
          <span className="jz-epub-selsep" />
          {HIGHLIGHT_SWATCHES.map((s) => (
            <Tooltip key={s.key} {...tip(`${s.label}色划线`)}>
              <button
                type="button"
                className={'jz-epub-swatch' + (s.key === lastColor ? ' is-last' : '')}
                style={{ ['--jz-swatch' as string]: s.hex } as React.CSSProperties}
                onClick={() => onHighlight(s.key, 'highlight')}
                aria-label={`${s.label}色划线`}
              />
            </Tooltip>
          ))}
          <Tooltip {...tip('下划线')}>
            <button type="button" className="jz-epub-selbtn" onClick={() => onHighlight(lastColor, 'underline')} aria-label="下划线">
              <UnderlineOutlined />
            </button>
          </Tooltip>
          <Tooltip {...tip('波浪线')}>
            <button type="button" className="jz-epub-selbtn" onClick={() => onHighlight(lastColor, 'squiggly')} aria-label="波浪线">
              <SquigglyIcon />
            </button>
          </Tooltip>
          <Tooltip {...tip('划线并写笔记')}>
            <button type="button" className="jz-epub-selbtn" onClick={onNote} aria-label="写笔记">
              <EditOutlined />
            </button>
          </Tooltip>
        </>
      )}
      <span className="jz-epub-selsep" />
      {onSearch && (
        <Tooltip {...tip('在本书中搜索')}>
          <button type="button" className="jz-epub-selbtn" onClick={onSearch} aria-label="搜本书">
            <SearchOutlined />
          </button>
        </Tooltip>
      )}
      {aiSlot}
      <Tooltip {...tip('引用为 Markdown（含书名 · 章节 · 回链）')}>
        <button type="button" className="jz-epub-selbtn" onClick={onQuote} aria-label="引用为 Markdown">
          <LinkOutlined />
        </button>
      </Tooltip>
    </div>
  );
}
