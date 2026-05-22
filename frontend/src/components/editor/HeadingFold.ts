/**
 * 标题层级折叠 — 点击 H1-H4 左侧的 ▸/▾ 按钮折叠/展开其章节。
 *
 * 实现：纯 CSS + 一个轻量 PM Plugin。
 *
 *   1. 编辑器 shell 上加 mouseover 监听，给 hover 的 heading 元素加
 *      `data-fold-controllable` + 一个 ::before 按钮（CSS 控制）
 *   2. 点击按钮时翻转 `data-folded` 属性
 *   3. CSS 选择器：`[data-folded] ~ *` 隐藏到下一个同级或更高级 heading
 *
 * 限制：折叠状态是浏览器视图层，不写入 markdown；刷新页面后恢复展开。
 *      若要持久化可改为 Document attr，但通常用户期望刷新即展开。
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const HeadingFold = Extension.create({
  name: 'headingFold',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('jz-heading-fold'),
        view() {
          let cleanup: (() => void) | null = null;
          return {
            update(view) {
              // 第一次创建后挂载事件
              if (cleanup) return;
              const root = view.dom as HTMLElement;
              const onClick = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                // 只响应直接点 heading 的左侧 hit-zone（CSS 给了 padding-left + 伪元素）
                const heading = target.closest?.('h1, h2, h3, h4') as HTMLElement | null;
                if (!heading || !root.contains(heading)) return;
                // 判断点击点是否在 heading 的左侧 28px 内（hit zone）
                const rect = heading.getBoundingClientRect();
                if (e.clientX > rect.left + 28) return;
                e.preventDefault();
                e.stopPropagation();
                const folded = heading.dataset.folded === '1';
                heading.dataset.folded = folded ? '' : '1';
                applyFoldClasses(root);
              };
              root.addEventListener('click', onClick, true);
              cleanup = () => root.removeEventListener('click', onClick, true);
              applyFoldClasses(root);
            },
            destroy() {
              cleanup?.();
              cleanup = null;
            },
          };
        },
      }),
    ];
  },
});

/** 给每个折叠的 heading 标记其影响到的兄弟节点。
 *  策略：从该 heading 开始往后扫描，遇到「同级或更高级 heading」停止；
 *  之间的兄弟节点全部加 `data-hidden-by-fold` 属性，CSS 控制隐藏。 */
function applyFoldClasses(root: HTMLElement) {
  // 先清掉所有旧标记
  root.querySelectorAll('[data-hidden-by-fold]').forEach((el) => {
    (el as HTMLElement).removeAttribute('data-hidden-by-fold');
  });

  const all = Array.from(root.children) as HTMLElement[];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.dataset.folded !== '1') continue;
    const level = headingLevel(el);
    if (level == null) continue;
    // 隐藏从 i+1 到「下一个 level 同级或更高级 heading」之前
    for (let j = i + 1; j < all.length; j++) {
      const next = all[j];
      const nextLevel = headingLevel(next);
      if (nextLevel != null && nextLevel <= level) break;
      next.setAttribute('data-hidden-by-fold', '');
    }
  }
}

function headingLevel(el: HTMLElement): number | null {
  const t = el.tagName.toLowerCase();
  if (t === 'h1') return 1;
  if (t === 'h2') return 2;
  if (t === 'h3') return 3;
  if (t === 'h4') return 4;
  return null;
}
