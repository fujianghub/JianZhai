import { useState } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { CodeOutlined, DownOutlined, FontSizeOutlined } from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import { modKey } from './shortcutLabels';

interface Props {
  editor: Editor;
}

export default function MoreMarksDropdown({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const mod = modKey();

  const panel = (
    <div className="jz-more-marks-bar" role="toolbar" aria-label="更多样式">
      <Tooltip title={`行内代码 (${mod}+E)`}>
        <Button
          size="small"
          type={editor.isActive('code') ? 'primary' : 'default'}
          className="jz-more-marks-btn"
          icon={<CodeOutlined />}
          onClick={() => {
            editor.chain().focus().toggleCode().run();
            setOpen(false);
          }}
        />
      </Tooltip>
      <Tooltip title={`上标 (${mod}+.)`}>
        <Button
          size="small"
          type={editor.isActive('superscript') ? 'primary' : 'default'}
          className="jz-more-marks-btn"
          onClick={() => {
            editor.chain().focus().toggleSuperscript().run();
            setOpen(false);
          }}
        >
          <span className="jz-more-marks-glyph">x²</span>
        </Button>
      </Tooltip>
      <Tooltip title={`下标 (${mod}+,)`}>
        <Button
          size="small"
          type={editor.isActive('subscript') ? 'primary' : 'default'}
          className="jz-more-marks-btn"
          onClick={() => {
            editor.chain().focus().toggleSubscript().run();
            setOpen(false);
          }}
        >
          <span className="jz-more-marks-glyph">x₂</span>
        </Button>
      </Tooltip>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      content={panel}
    >
      <Tooltip title="更多样式（上标 / 下标 / 行内代码）">
        <Button size="small" className="jz-toolbar-dropdown-btn">
          <FontSizeOutlined />
          <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
        </Button>
      </Tooltip>
    </Popover>
  );
}
