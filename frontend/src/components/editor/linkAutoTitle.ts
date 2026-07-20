/**
 * 「默认为标题」：粘贴裸 URL → 先按 URL 原文插入链接，异步取到目标
 * 标题后把显示文本换成标题（语雀行为）。取不到就保持 URL，不打扰。
 *
 * 防冲突守卫：替换前必须同时匹配 href 与旧文本 —— 用户在异步取标题
 * 期间改过链接文字则匹配失败、绝不覆盖，无需 transaction mapping。
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Mark } from '@tiptap/pm/model';
import {
  canonicalHref,
  classifyHref,
  fetchTitleForHref,
  isBareUrlText,
} from '@/utils/linkModes';

export interface ReplaceLinkTextOptions {
  href: string;
  oldText: string;
  newText: string;
  /** 调用时已知的链接范围（气泡菜单路径）；校验通过则优先用它。 */
  range?: { from: number; to: number };
}

/**
 * 把「href 为指定值、显示文本为 oldText」的链接文本替换为 newText，
 * 保留 link mark（含 target 等属性）。优先用调用方给的 range（需通过
 * 文本一致性校验），否则全文扫描第一个匹配的文本节点。返回是否替换。
 */
export function replaceLinkText(editor: Editor, opts: ReplaceLinkTextOptions): boolean {
  if (editor.isDestroyed || !opts.newText || opts.newText === opts.oldText) return false;
  const { state } = editor;
  const linkType = state.schema.marks.link;
  if (!linkType) return false;

  let target: { from: number; to: number; mark: Mark } | null = null;

  if (opts.range) {
    const { from, to } = opts.range;
    if (
      from >= 0 &&
      to <= state.doc.content.size &&
      state.doc.textBetween(from, to) === opts.oldText &&
      state.doc.rangeHasMark(from, to, linkType)
    ) {
      let mark: Mark | null = null;
      state.doc.nodesBetween(from, to, (node) => {
        if (mark) return false;
        const m = node.marks.find((mk) => mk.type === linkType && mk.attrs.href === opts.href);
        if (m) mark = m;
        return true;
      });
      if (mark) target = { from, to, mark };
    }
  }

  if (!target) {
    state.doc.descendants((node, pos) => {
      if (target) return false;
      if (!node.isText) return true;
      const m = node.marks.find((mk) => mk.type === linkType && mk.attrs.href === opts.href);
      if (m && node.text === opts.oldText) {
        target = { from: pos, to: pos + node.nodeSize, mark: m };
        return false;
      }
      return true;
    });
  }

  if (!target) return false;
  const { from, to, mark } = target;
  const tr = state.tr.insertText(opts.newText, from, to);
  tr.addMark(from, from + opts.newText.length, linkType.create(mark.attrs));
  editor.view.dispatch(tr);
  return true;
}

/**
 * 异步取 href 目标标题并替换「仍显示为 URL 原文」的链接文本。
 * fire-and-forget：任何失败静默保持原状。
 */
export async function applyAutoTitle(editor: Editor, href: string): Promise<void> {
  const title = await fetchTitleForHref(href);
  if (!title || editor.isDestroyed) return;
  replaceLinkText(editor, { href, oldText: href, newText: title });
}

/**
 * 粘贴拦截：空选区 + 剪贴板是单个裸 URL 时，插入 `[URL](URL)` 链接并
 * 异步转标题。有选区时不拦截 —— 交给 @tiptap/extension-link 的
 * linkOnPaste 把选中文字变链接（语雀同款，不动用户文字）。
 */
export const LinkPasteAutoTitle = Extension.create({
  name: 'linkPasteAutoTitle',
  // 要抢在 tiptap-markdown 的粘贴处理之前拿到裸 URL
  priority: 1000,

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: new PluginKey('linkPasteAutoTitle'),
        props: {
          handlePaste(view, event) {
            const text = (event.clipboardData?.getData('text/plain') ?? '').trim();
            if (!text || !isBareUrlText(text)) return false;
            if (!view.state.selection.empty) return false;
            if (editor.isActive('codeBlock') || editor.isActive('code')) return false;
            const cls = classifyHref(text);
            if (cls.kind === 'other') return false;
            const href = canonicalHref(cls);
            editor
              .chain()
              .focus()
              .insertContent([
                { type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] },
              ])
              .run();
            void applyAutoTitle(editor, href);
            return true;
          },
        },
      }),
    ];
  },
});
