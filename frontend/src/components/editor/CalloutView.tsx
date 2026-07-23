import { Dropdown, Tooltip } from 'antd';
import { CloseOutlined, SwapOutlined } from '@ant-design/icons';
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { CALLOUT_TEMPLATES } from './callouts';

/**
 * NodeView for ``CalloutExtension``. Renders the same visual chrome
 * (.jz-callout-${kind}) the public reader uses, plus an inline kind-picker
 * + remove button positioned at the top-right corner so the user can change
 * the callout's flavour or unwrap it from within the editor.
 */
export default function CalloutView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const kind = (node.attrs.kind as string) || 'tips';
  const preset = CALLOUT_TEMPLATES.find((c) => c.slug === kind);
  const title = preset?.label ?? kind;
  /** ``:::info 自定义标题`` 的显式标题 —— 阅读端渲染为 .jz-callout-title，
   *  编辑器同样展示，保证所见即所得（round-trip 由节点 title 属性承载）。 */
  const customTitle = ((node.attrs.title as string) || '').trim();

  return (
    <NodeViewWrapper
      className={`jz-callout jz-callout-${kind} jz-callout-editor`}
      data-kind={kind}
    >
      <div className="jz-callout-editor-toolbar" contentEditable={false}>
        <span className="jz-callout-editor-label">{title}</span>
        <span style={{ flex: 1 }} />
        <Dropdown
          disabled={!editor.isEditable}
          menu={{
            items: CALLOUT_TEMPLATES.map((c) => ({
              key: c.slug,
              label: (
                <span>
                  <span style={{ display: 'inline-block', minWidth: 100 }}>{c.label}</span>
                  <span style={{ fontSize: 12, opacity: 0.55, marginLeft: 8 }}>{c.hint}</span>
                </span>
              ),
              onClick: () => updateAttributes({ kind: c.slug }),
            })),
          }}
        >
          <Tooltip title="切换色块类型">
            <button type="button" className="jz-callout-editor-btn" aria-label="切换色块类型">
              <SwapOutlined />
            </button>
          </Tooltip>
        </Dropdown>
        <Tooltip title="取消色块">
          <button
            type="button"
            className="jz-callout-editor-btn"
            aria-label="取消色块"
            onClick={() => deleteNode()}
          >
            <CloseOutlined />
          </button>
        </Tooltip>
      </div>
      {customTitle && (
        <div className="jz-callout-title" contentEditable={false}>
          {customTitle}
        </div>
      )}
      <NodeViewContent className="jz-callout-body" />
    </NodeViewWrapper>
  );
}
