import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { FONT_SIZE_PRESETS } from '../FontSize';

interface Props {
  editor: Editor;
}

function fontSizeLabel(size: string): string {
  if (!size) return '16px';
  const preset = FONT_SIZE_PRESETS.find((p) => p.value === size);
  return preset ? `${preset.label}px` : size.replace(/px$/, '') + 'px';
}

export default function FontSizeDropdown({ editor }: Props) {
  // Tiptap v3：render 里直接 editor.getAttributes() 是陈旧快照，须经 useEditorState 订阅
  const fontSize = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      (ed.getAttributes('textStyle').fontSize as string | undefined) ?? '',
  });
  const label = fontSizeLabel(fontSize);

  const items: MenuProps['items'] = [
    ...FONT_SIZE_PRESETS.map((s) => ({
      key: s.value,
      label: (
        <span className="jz-toolbar-menu-row">
          <span style={{ fontSize: s.value }}>{s.label}px</span>
          {fontSize === s.value ? (
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
