import { useState } from 'react';
import { Popover, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import type { InsertMenuActions } from '../insertMenuActions';
import QuickInsertMenu from './QuickInsertMenu';

interface Props {
  editor: Editor | null;
  actions: InsertMenuActions;
  disabled?: boolean;
}

export default function QuickInsertButton({ editor, actions, disabled }: Props) {
  const [open, setOpen] = useState(false);

  if (!editor || disabled) {
    return (
      <Tooltip title="快捷插入">
        <button type="button" className="jz-quick-insert-btn" disabled aria-label="快捷插入">
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
        <QuickInsertMenu
          editor={editor}
          actions={actions}
          onClose={() => setOpen(false)}
        />
      }
    >
      <Tooltip title="插入内容块">
        <button
          type="button"
          className="jz-quick-insert-btn"
          aria-label="快捷插入"
          aria-expanded={open}
        >
          <PlusOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
