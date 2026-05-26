import { useState } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { DownOutlined, HighlightOutlined } from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import { HIGHLIGHT_COLOR_PRESETS } from './highlightPresets';

interface Props {
  editor: Editor;
}

export default function HighlightColorDropdown({ editor }: Props) {
  const [open, setOpen] = useState(false);

  const panel = (
    <div className="jz-highlight-panel">
      <div className="jz-highlight-swatches" role="listbox" aria-label="字体背景色">
        {HIGHLIGHT_COLOR_PRESETS.map((c) => (
          <button
            key={c.value}
            type="button"
            className="jz-highlight-swatch"
            title={c.label}
            style={{ background: c.value }}
            onClick={() => {
              editor.chain().focus().setHighlight({ color: c.value }).run();
              setOpen(false);
            }}
          />
        ))}
      </div>
      <Button
        size="small"
        block
        className="jz-highlight-reset"
        onClick={() => {
          editor.chain().focus().unsetHighlight().run();
          setOpen(false);
        }}
      >
        无背景
      </Button>
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
      <Tooltip title="字体背景色">
        <Button
          size="small"
          type={editor.isActive('highlight') ? 'primary' : 'default'}
          icon={<HighlightOutlined />}
          className="jz-toolbar-dropdown-btn"
        >
          <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />
        </Button>
      </Tooltip>
    </Popover>
  );
}
