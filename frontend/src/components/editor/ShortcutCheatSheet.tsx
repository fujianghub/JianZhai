import { Modal, Tag, Typography } from 'antd';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: '行内格式',
    items: [
      ['Ctrl/⌘ + B', '加粗（再按解包）'],
      ['Ctrl/⌘ + I', '斜体'],
      ['Ctrl/⌘ + Shift + X', '删除线'],
      ['Ctrl/⌘ + E', '行内代码'],
      ['Ctrl/⌘ + U', '下划线'],
      ['Ctrl/⌘ + K', '插入链接（选中文字成链）'],
    ],
  },
  {
    title: '列表与缩进',
    items: [
      ['Enter', '续列表（- / 1. / > / 任务），有序号自增'],
      ['Enter（空项）', '退出列表'],
      ['Tab / Shift+Tab', '列表缩进 / 反缩进'],
    ],
  },
  {
    title: '表格',
    items: [
      ['Tab / Shift+Tab', '下一格 / 上一格（选中内容）'],
      ['Tab（末格）', '自动追加一行'],
      ['Enter', '下方插入一行'],
      ['Enter（空行）', '删行并退出表格'],
    ],
  },
  {
    title: '插入与引用',
    items: [
      ['/', '斜杠命令（支持拼音缩写：dmk 代码块、lct 流程图、glk 高亮块…）'],
      ['@', '引用文档（Esc 取消保留字面 @）'],
      ['粘贴 URL（有选区）', '自动成 [选区](url) 链接'],
      ['粘贴 / 拖入图片', '自动上传并插入'],
    ],
  },
  {
    title: '文档',
    items: [
      ['Ctrl/⌘ + S', '立即保存'],
      ['Ctrl/⌘ + F', '查找替换'],
      ['Ctrl/⌘ + Z / Shift+Z', '撤销 / 重做'],
      ['F9', '专注写作模式'],
    ],
  },
];

/** MD 编辑器快捷键速查（语雀「箱子」同位语）。 */
export default function ShortcutCheatSheet({ open, onClose }: Props) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="键盘快捷键" width={640}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px 28px',
        }}
      >
        {GROUPS.map((g) => (
          <div key={g.title}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {g.title}
            </Text>
            {g.items.map(([keys, desc]) => (
              <div
                key={keys}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '3px 0',
                  fontSize: 13,
                }}
              >
                <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>
                <Tag style={{ margin: 0, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                  {keys}
                </Tag>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
