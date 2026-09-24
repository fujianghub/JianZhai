import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Input, Popover, Segmented } from 'antd';
import IconButton from '@/components/common/IconButton';
import { DeleteIcon, EditIcon, SettingsIcon } from '@/components/common/actionIcons';
import { JzDrawioIcon } from '@/components/common/JzIcon';
import { ICON_SIZE } from '@/components/common/iconSize';
import { DRAWIO_BOARD_NAME, type DrawioAlign, type DrawioScheme, type DrawioSize } from '@/utils/drawioEmbed';
import DrawioEditorModal from './DrawioEditorModal';
import type { DrawioBoardOptions } from './DrawioBoard';

interface BoardAttrs {
  src: string;
  png: string;
  scheme: DrawioScheme;
  size: DrawioSize;
  align: DrawioAlign;
  caption: string;
  autoOpen: boolean;
  mermaid: string;
}

/** 与阅读端同一套 figure 数据属性，编辑器预览因此与正文渲染一致（CSS 在 markdown.css）。 */
function figureDataAttrs(a: BoardAttrs): Record<string, string> {
  const out: Record<string, string> = {};
  if (a.scheme === 'light') out['data-jz-scheme'] = 'light';
  if (a.size === 's' || a.size === 'full') out['data-jz-size'] = a.size;
  if (a.align === 'left' || a.align === 'right') out['data-jz-align'] = a.align;
  return out;
}

/** 编辑器里的 drawio画板：SVG 预览 + 悬浮「编辑 / 设置 / 删除」，双击编辑。 */
export default function DrawioBoardView({ node, editor, extension, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const attrs = node.attrs as BoardAttrs;
  const editable = editor.isEditable;
  const [open, setOpen] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(attrs.caption);
  useEffect(() => setCaptionDraft(attrs.caption), [attrs.caption]);
  const documentId = (extension.options as DrawioBoardOptions).documentId;
  // onSaved 之后编辑层紧接着 onClose，此时本次渲染的 node.attrs 仍是旧值——
  // 用 ref 记住「有过内容」，免得把刚保存的新画板当成空占位删掉。
  const hasContent = useRef(!!attrs.src);
  hasContent.current = hasContent.current || !!attrs.src;
  // Mermaid 源码只在首次打开时用；存成画板后清掉（避免再次编辑时又从源码转换）。
  const mermaidRef = useRef(attrs.mermaid);

  // 斜杠插入 / Mermaid 转换的新画板：挂载即打开编辑器（只触发一次）。
  useEffect(() => {
    if (attrs.autoOpen && editable) {
      setOpen(true);
      // 挂载 effect 内同步 dispatch 会触发 React flushSync 警告且被丢弃——推迟一拍。
      queueMicrotask(() => updateAttributes({ autoOpen: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    // 新画板一次都没保存就退出 → 连同占位节点一起撤掉（Mermaid 原代码块保持不动）。
    if (!hasContent.current) deleteNode();
  };

  /** Mermaid 转换保存成功：若紧邻的上一块正是同一段 mermaid 源码，删掉它（「转为」语义）。 */
  const removeSourceCodeBlock = (source: string) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;
    const before = editor.state.doc.resolve(pos).nodeBefore;
    if (
      before &&
      before.type.name === 'codeBlock' &&
      String(before.attrs.language || '').toLowerCase() === 'mermaid' &&
      before.textContent.trim() === source.trim()
    ) {
      editor.chain().deleteRange({ from: pos - before.nodeSize, to: pos }).run();
    }
  };

  const settings = (
    <div className="jz-drawio-settings" onMouseDown={(e) => e.stopPropagation()}>
      <div className="jz-drawio-settings-row">
        <span>配色</span>
        <Segmented
          size="small"
          value={attrs.scheme}
          onChange={(v) => updateAttributes({ scheme: v })}
          options={[
            { label: '跟随主题', value: 'auto' },
            { label: '始终浅色', value: 'light' },
          ]}
        />
      </div>
      <div className="jz-drawio-settings-row">
        <span>尺寸</span>
        <Segmented
          size="small"
          value={attrs.size}
          onChange={(v) => updateAttributes({ size: v })}
          options={[
            { label: '原始', value: 'auto' },
            { label: '小', value: 's' },
            { label: '满栏', value: 'full' },
          ]}
        />
      </div>
      <div className="jz-drawio-settings-row">
        <span>对齐</span>
        <Segmented
          size="small"
          value={attrs.align}
          onChange={(v) => updateAttributes({ align: v })}
          options={[
            { label: '左', value: 'left' },
            { label: '中', value: 'center' },
            { label: '右', value: 'right' },
          ]}
        />
      </div>
      <div className="jz-drawio-settings-row">
        <span>图注</span>
        <Input
          size="small"
          allowClear
          maxLength={120}
          placeholder="可选，显示在画板下方"
          value={captionDraft}
          onChange={(e) => setCaptionDraft(e.target.value)}
          onBlur={() => captionDraft.trim() !== attrs.caption && updateAttributes({ caption: captionDraft.trim() })}
          onPressEnter={() => updateAttributes({ caption: captionDraft.trim() })}
        />
      </div>
    </div>
  );

  return (
    <NodeViewWrapper className={`jz-drawio-node${selected ? ' is-selected' : ''}`} data-drag-handle="">
      <figure
        className="jz-drawio"
        {...figureDataAttrs(attrs)}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('.jz-drawio-toolbar')) return;
          if (editable) setOpen(true);
        }}
        title={editable ? `双击编辑${DRAWIO_BOARD_NAME}` : undefined}
      >
        {attrs.src ? (
          <img src={attrs.src} alt={DRAWIO_BOARD_NAME} draggable={false} data-no-lightbox="true" />
        ) : (
          <div className="jz-drawio-empty">
            <JzDrawioIcon size={ICON_SIZE.xl} />
            <span>{attrs.mermaid ? `Mermaid → ${DRAWIO_BOARD_NAME}` : `空白${DRAWIO_BOARD_NAME}`}</span>
          </div>
        )}
        {attrs.caption && <figcaption>{attrs.caption}</figcaption>}
        {editable && attrs.src && (
        <div className="jz-drawio-toolbar" contentEditable={false}>
          <IconButton
            icon={<EditIcon />}
            aria-label={`编辑${DRAWIO_BOARD_NAME}`}
            tooltip={`编辑${DRAWIO_BOARD_NAME}`}
            onClick={() => setOpen(true)}
          />
          <Popover
            trigger="click"
            placement="bottomRight"
            content={settings}
            title={`${DRAWIO_BOARD_NAME}设置`}
            getPopupContainer={() => document.body}
            zIndex={12000}
          >
            <IconButton icon={<SettingsIcon />} aria-label={`${DRAWIO_BOARD_NAME}设置`} tooltip="设置" className="jz-drawio-settings-btn" />
          </Popover>
          <IconButton
            icon={<DeleteIcon />}
            tone="danger"
            aria-label={`删除${DRAWIO_BOARD_NAME}`}
            tooltip={`删除${DRAWIO_BOARD_NAME}`}
            onClick={() => deleteNode()}
          />
        </div>
        )}
      </figure>
      <DrawioEditorModal
        open={open}
        svgUrl={attrs.src || undefined}
        mermaidSource={!attrs.src && mermaidRef.current ? mermaidRef.current : undefined}
        documentId={documentId}
        onSaved={(saved) => {
          hasContent.current = true;
          const source = mermaidRef.current;
          mermaidRef.current = '';
          updateAttributes({ src: saved.src, png: saved.png, mermaid: '' });
          if (source) removeSourceCodeBlock(source);
        }}
        onClose={close}
      />
    </NodeViewWrapper>
  );
}
