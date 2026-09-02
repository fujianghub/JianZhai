/**
 * Card for an existing highlight (opened by clicking the overlay or a notes
 * list entry): recolour / restyle, edit the note, copy, quote, send to the
 * document's comments, delete. Rendered in the host document next to the
 * highlight's rect.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Popconfirm, Space, Tooltip, Typography } from 'antd';
import { CloseOutlined, CommentOutlined, CopyOutlined, DeleteOutlined, HighlightOutlined, LinkOutlined, UnderlineOutlined } from '@ant-design/icons';
import { SquigglyIcon } from './EpubSelectionBar';
import { HIGHLIGHT_SWATCHES } from '@/utils/epubNotes';
import type { Highlight, HighlightColor, HighlightStyle } from '@/api/reading';
import type { SelectionAnchor } from './EpubSelectionBar';

const { Text } = Typography;

interface Props {
  highlight: Highlight;
  anchor: SelectionAnchor;
  stageWidth: number;
  stageHeight: number;
  /** Focus the note field on open (just created from "写笔记"). */
  autoFocusNote?: boolean;
  onChangeStyle: (patch: { color?: HighlightColor; style?: HighlightStyle }) => void;
  onSaveNote: (note: string) => Promise<void> | void;
  onCopy: () => void;
  onQuote: () => void;
  onComment?: () => void;
  onDelete: () => void;
  onClose: () => void;
  popupContainer?: () => HTMLElement;
}

const CARD_W = 320;
const CARD_H_EST = 210;

export default function EpubHighlightCard({
  highlight,
  anchor,
  stageWidth,
  stageHeight,
  autoFocusNote,
  onChangeStyle,
  onSaveNote,
  onCopy,
  onQuote,
  onComment,
  onDelete,
  onClose,
  popupContainer,
}: Props) {
  const [note, setNote] = useState(highlight.note);
  const [saving, setSaving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const dirty = note !== highlight.note;

  useEffect(() => {
    setNote(highlight.note);
  }, [highlight.id, highlight.note]);

  useEffect(() => {
    if (autoFocusNote) noteRef.current?.focus();
  }, [autoFocusNote, highlight.id]);

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSaveNote(note.trim());
    } finally {
      setSaving(false);
    }
  };

  const width = Math.min(CARD_W, stageWidth - 8);
  const below = anchor.y + anchor.h + 10;
  const above = anchor.y - CARD_H_EST - 10;
  const top = below + CARD_H_EST <= stageHeight - 4 ? below : Math.max(4, above);
  const left = Math.max(4, Math.min(anchor.x + anchor.w / 2 - width / 2, stageWidth - width - 4));
  const tip = (t: string) => ({ title: t, getPopupContainer: popupContainer, mouseEnterDelay: 0.4 });

  return (
    <div className="jz-epub-hlcard" style={{ top, left, width }} role="dialog" aria-label="划线">
      <div className="jz-epub-hlcard-head">
        <div className="jz-epub-hlcard-swatches" role="radiogroup" aria-label="划线颜色">
          {HIGHLIGHT_SWATCHES.map((s) => (
            <Tooltip key={s.key} {...tip(`${s.label}色`)}>
              <button
                type="button"
                className={'jz-epub-swatch' + (s.key === highlight.color ? ' is-active' : '')}
                style={{ ['--jz-swatch' as string]: s.hex } as React.CSSProperties}
                onClick={() => onChangeStyle({ color: s.key })}
                role="radio"
                aria-checked={s.key === highlight.color}
                aria-label={`${s.label}色`}
              />
            </Tooltip>
          ))}
          <span className="jz-epub-selsep" />
          {(
            [
              ['highlight', '高亮', <HighlightOutlined key="h" />],
              ['underline', '下划线', <UnderlineOutlined key="u" />],
              ['squiggly', '波浪线', <SquigglyIcon key="s" />],
            ] as Array<[HighlightStyle, string, React.ReactNode]>
          ).map(([style, label, icon]) => (
            <Tooltip key={style} {...tip(label)}>
              <button
                type="button"
                className={'jz-epub-selbtn' + (highlight.style === style ? ' is-active' : '')}
                onClick={() => highlight.style !== style && onChangeStyle({ style })}
                aria-label={label}
                aria-pressed={highlight.style === style}
              >
                {icon}
              </button>
            </Tooltip>
          ))}
        </div>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="关闭" />
      </div>
      {highlight.text && (
        <Text type="secondary" className="jz-epub-hlcard-quote" title={highlight.text}>
          {highlight.text}
        </Text>
      )}
      <Input.TextArea
        ref={noteRef}
        className="jz-epub-hlcard-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="写点笔记…（Ctrl/⌘+Enter 保存）"
        autoSize={{ minRows: 2, maxRows: 6 }}
        maxLength={10000}
      />
      <div className="jz-epub-hlcard-foot">
        <Space size={2}>
          <Tooltip {...tip('复制引文')}>
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={onCopy} aria-label="复制引文" />
          </Tooltip>
          <Tooltip {...tip('引用为 Markdown')}>
            <Button type="text" size="small" icon={<LinkOutlined />} onClick={onQuote} aria-label="引用为 Markdown" />
          </Tooltip>
          {onComment && (
            <Tooltip {...tip('发到本书评论')}>
              <Button type="text" size="small" icon={<CommentOutlined />} onClick={onComment} aria-label="发到评论" />
            </Tooltip>
          )}
          <Popconfirm
            title="删除这条划线？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, size: 'small' }}
            cancelButtonProps={{ size: 'small' }}
            onConfirm={onDelete}
            getPopupContainer={popupContainer}
          >
            <Tooltip {...tip('删除划线')}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除划线" />
            </Tooltip>
          </Popconfirm>
        </Space>
        <Button size="small" type={dirty ? 'primary' : 'default'} disabled={!dirty} loading={saving} onClick={() => void save()}>
          {dirty ? '保存笔记' : '已保存'}
        </Button>
      </div>
    </div>
  );
}
