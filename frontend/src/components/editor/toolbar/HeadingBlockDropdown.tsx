import { useMemo } from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import {
  applyHeadingBlock,
  getActiveHeadingLevel,
  getHeadingBlockLabel,
  type HeadingLevel,
} from './headingBlock';
import { altModShortcut } from './shortcutLabels';

const HEADING_PREVIEW: Record<HeadingLevel, { fontSize: number; fontWeight: number }> = {
  1: { fontSize: 22, fontWeight: 700 },
  2: { fontSize: 19, fontWeight: 600 },
  3: { fontSize: 17, fontWeight: 600 },
  4: { fontSize: 16, fontWeight: 600 },
  5: { fontSize: 15, fontWeight: 600 },
  6: { fontSize: 14, fontWeight: 600 },
};

interface Props {
  editor: Editor;
  /** Compact trigger for bubble menu (icon only). */
  compact?: boolean;
}

export default function HeadingBlockDropdown({ editor, compact = false }: Props) {
  const activeLevel = getActiveHeadingLevel(editor);
  const label = getHeadingBlockLabel(editor);

  const items: MenuProps['items'] = useMemo(() => {
    const rows: MenuProps['items'] = [
      {
        key: 'paragraph',
        label: (
          <span className="jz-toolbar-menu-row">
            <span className="jz-toolbar-menu-check">{activeLevel === null ? '✓' : ''}</span>
            <span className="jz-toolbar-heading-item" style={{ fontSize: 15 }}>
              正文
            </span>
            <span className="jz-toolbar-menu-kbd">{altModShortcut('0')}</span>
          </span>
        ),
      },
    ];
    for (let level = 1; level <= 6; level++) {
      const lv = level as HeadingLevel;
      const preview = HEADING_PREVIEW[lv];
      rows.push({
        key: String(level),
        label: (
          <span className="jz-toolbar-menu-row">
            <span className="jz-toolbar-menu-check">{activeLevel === lv ? '✓' : ''}</span>
            <span
              className="jz-toolbar-heading-item"
              style={{ fontSize: preview.fontSize, fontWeight: preview.fontWeight }}
            >
              标题{level}
            </span>
            <span className="jz-toolbar-menu-kbd">{altModShortcut(String(level))}</span>
          </span>
        ),
      });
    }
    return rows;
  }, [activeLevel]);

  return (
    <Dropdown
      menu={{
        items,
        onClick: ({ key }) => {
          if (key === 'paragraph') applyHeadingBlock(editor, 'paragraph');
          else applyHeadingBlock(editor, Number(key) as HeadingLevel);
        },
      }}
      trigger={['click']}
    >
      <Button size="small" className="jz-toolbar-dropdown-btn">
        {compact ? '段落' : label}
        <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
      </Button>
    </Dropdown>
  );
}
