/**
 * 语雀式逐链接气泡菜单：光标/选区落在链接上时浮现。
 *
 *   链接 | 标题 | 卡片   ·   打开文档 | 浏览器访问   ·   编辑 | 移除
 *
 * - 「链接」= 显示 URL 原文；「标题」= 显示目标页/文档标题（默认形态，
 *   激活态用无状态启发式判定：显示文本本身是裸 URL ⇔ 链接模式）；
 * - 「卡片」= 转为 DocCardEmbed / LinkCardEmbed 块节点；
 * - 「打开文档」仅内部 doc: 链接可见，站内路由跳转；「浏览器访问」新标签。
 *
 * 独立于格式气泡（pluginKey 区分），格式气泡在链接上让位。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState } from '@tiptap/react';
import { getMarkRange, type Editor } from '@tiptap/core';
import { message } from 'antd';
import {
  DisconnectOutlined,
  EditOutlined,
  ExportOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import {
  browseHref,
  classifyHref,
  fetchTitleForHref,
  isBareUrlText,
} from '@/utils/linkModes';
import { replaceLinkText } from './linkAutoTitle';

interface ActiveLink {
  from: number;
  to: number;
  href: string;
  text: string;
}

function getActiveLink(editor: Editor): ActiveLink | null {
  const { state } = editor;
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  const range = getMarkRange(state.selection.$from, linkType);
  if (!range) return null;
  const href = (editor.getAttributes('link').href as string | undefined) ?? '';
  if (!href) return null;
  return { ...range, href, text: state.doc.textBetween(range.from, range.to) };
}

export default function LinkBubbleMenu({
  editor,
  onEditLink,
}: {
  editor: Editor;
  onEditLink: () => void;
}) {
  const navigate = useNavigate();
  const [titleLoading, setTitleLoading] = useState(false);

  // useEditor 默认不随 transaction 重渲（Tiptap v3），直接在 render 里读
  // editor 状态会拿到陈旧快照 —— 必须经 useEditorState 订阅光标处链接。
  const link = useEditorState({
    editor,
    selector: ({ editor: ed }) => getActiveLink(ed),
  });
  const cls = link ? classifyHref(link.href) : null;
  const plainActive = link ? isBareUrlText(link.text) : false;

  function toPlain() {
    const cur = getActiveLink(editor);
    if (!cur || isBareUrlText(cur.text)) return;
    replaceLinkText(editor, {
      href: cur.href,
      oldText: cur.text,
      newText: cur.href,
      range: { from: cur.from, to: cur.to },
    });
    editor.commands.focus();
  }

  async function toTitle() {
    const cur = getActiveLink(editor);
    if (!cur || titleLoading) return;
    setTitleLoading(true);
    try {
      const title = await fetchTitleForHref(cur.href);
      if (!title) {
        message.info('未能获取标题');
        return;
      }
      if (title === cur.text) return;
      replaceLinkText(editor, {
        href: cur.href,
        oldText: cur.text,
        newText: title,
        range: { from: cur.from, to: cur.to },
      });
      editor.commands.focus();
    } finally {
      setTitleLoading(false);
    }
  }

  function toCard() {
    const cur = getActiveLink(editor);
    if (!cur) return;
    const kind = classifyHref(cur.href);
    if (kind.kind === 'other') return;
    const chain = editor.chain().focus().deleteRange({ from: cur.from, to: cur.to });
    if (kind.kind === 'doc') chain.insertDocCard(kind.id).run();
    else chain.insertLinkCard(kind.url).run();
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="linkBubbleMenu"
      options={{ placement: 'bottom' }}
      shouldShow={({ editor: ed }) => {
        if (!ed.isEditable) return false;
        if (ed.isActive('codeBlock')) return false;
        return ed.isActive('link');
      }}
    >
      <div className="jz-bubble-menu jz-link-bubble" role="toolbar" aria-label="链接工具栏">
        <button
          type="button"
          className={'jz-bubble-btn jz-link-mode-btn' + (plainActive ? ' is-active' : '')}
          onClick={toPlain}
          title="显示为 URL 原文"
        >
          链接
        </button>
        <button
          type="button"
          className={'jz-bubble-btn jz-link-mode-btn' + (!plainActive ? ' is-active' : '')}
          onClick={() => void toTitle()}
          title="显示为目标标题"
          disabled={titleLoading}
        >
          {titleLoading ? '取标题…' : '标题'}
        </button>
        <button
          type="button"
          className="jz-bubble-btn jz-link-mode-btn"
          onClick={toCard}
          title="转为卡片"
          disabled={!cls || cls.kind === 'other'}
        >
          卡片
        </button>
        <span className="jz-bubble-divider" aria-hidden />
        {cls?.kind === 'doc' && (
          <button
            type="button"
            className="jz-bubble-btn jz-link-action-btn"
            onClick={() => navigate(browseHref(cls))}
            title="站内打开该文档"
          >
            <FileTextOutlined /> 打开文档
          </button>
        )}
        <button
          type="button"
          className="jz-bubble-btn jz-link-action-btn"
          onClick={() => {
            if (cls) window.open(browseHref(cls), '_blank', 'noopener');
          }}
          title="新标签页打开"
        >
          <ExportOutlined /> 浏览器访问
        </button>
        <span className="jz-bubble-divider" aria-hidden />
        <button
          type="button"
          className="jz-bubble-btn"
          onClick={onEditLink}
          title="编辑链接"
          aria-label="编辑链接"
        >
          <EditOutlined />
        </button>
        <button
          type="button"
          className="jz-bubble-btn"
          onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          title="移除链接"
          aria-label="移除链接"
        >
          <DisconnectOutlined />
        </button>
      </div>
    </BubbleMenu>
  );
}
