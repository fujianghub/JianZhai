import { useState } from 'react';
import { Popover, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SlashCommandItem } from '../slashCommandRegistry';
import MarkdownQuickInsertMenu from './MarkdownQuickInsertMenu';

interface Props {
  onInsert: (item: SlashCommandItem) => void;
  disabled?: boolean;
}

export default function MarkdownQuickInsertButton({ onInsert, disabled }: Props) {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <Tooltip title="插入内容块">
        <button type="button" className="jz-quick-insert-btn" disabled aria-label="插入">
          <PlusOutlined />
        </button>
      </Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      destroyOnHidden
      overlayClassName="jz-editor-dropdown jz-insert-menu-popover"
      content={
        <MarkdownQuickInsertMenu onInsert={onInsert} onClose={() => setOpen(false)} />
      }
    >
      <Tooltip title="插入引用、链接、表格等">
        <button
          type="button"
          className="jz-quick-insert-btn"
          aria-label="插入内容块"
          aria-expanded={open}
        >
          <PlusOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
