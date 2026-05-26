import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { Editor } from '@tiptap/core';
import { FONT_SIZE_PRESETS } from '../FontSize';

interface Props {
  editor: Editor;
}

function currentFontSizeLabel(editor: Editor): string {
  const attrs = editor.getAttributes('textStyle');
  const size = attrs.fontSize as string | undefined;
  if (!size) return '16px';
  const preset = FONT_SIZE_PRESETS.find((p) => p.value === size);
  return preset ? `${preset.label}px` : size.replace(/px$/, '') + 'px';
}

export default function FontSizeDropdown({ editor }: Props) {
  const label = currentFontSizeLabel(editor);

  const items: MenuProps['items'] = [
    ...FONT_SIZE_PRESETS.map((s) => ({
      key: s.value,
      label: (
        <span className="jz-toolbar-menu-row">
          <span style={{ fontSize: s.value }}>{s.label}px</span>
          {editor.isActive('textStyle', { fontSize: s.value }) ? (
            <span className="jz-toolbar-menu-check">✓</span>
          ) : (
            <span />
          )}
        </span>
      ),
    })),
    { type: 'divider' as const },
    {
      key: 'reset',
      label: '恢复默认',
    },
  ];

  return (
    <Dropdown
      menu={{
        items,
        onClick: ({ key }) => {
          if (key === 'reset') editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(String(key)).run();
        },
      }}
      trigger={['click']}
    >
      <Button size="small" className="jz-toolbar-dropdown-btn" style={{ minWidth: 56 }}>
        {label}
        <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
      </Button>
    </Dropdown>
  );
}
