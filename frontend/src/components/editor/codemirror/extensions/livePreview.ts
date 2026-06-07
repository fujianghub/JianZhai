import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { Extension, Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { renderLatex } from '../../MathEditorModal';
import { scanInlineMath } from '../pure/inlineMathScan';

/**
 * Live Preview（Typora/Obsidian 式就地渲染）：
 *  - 光标**不在**的行：隐藏 Markdown 标记符（**、*、~~、`、#、[]()）——
 *    内容样式由 cmTheme 的 HighlightStyle 已经施加，隐藏后即「成品观感」
 *  - `![alt](url)` 整体替换为图片缩略 widget（点击回源码）
 *  - `$...$` 替换为 KaTeX 渲染 widget（防货币误识，结果 LRU）
 *  - 链接 Ctrl/Cmd+点击打开
 *
 * 核心策略：**当前行整行显源码**（光标/选区覆盖的行不应用任何 replace）
 * —— 根除 IME 组合期与 replace 装饰的冲突，也符合「点进去看到原文」直觉。
 */

/** 直接隐藏的标记符节点（lezer @lezer/markdown 节点名）。 */
const HIDE_MARKS = new Set([
  'EmphasisMark', // * / _
  'StrikethroughMark', // ~~
  'CodeMark', // `
  'HeaderMark', // #
  'LinkMark', // [ ] ( )
]);

/** 块级代码容器：iterate 不深入（内部原样显示）。注意 InlineCode 不在
 *  此列——它的 CodeMark 反引号要隐藏，只是数学扫描要避开它。 */
const BLOCK_CODE = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock']);
/** 数学扫描的屏蔽容器（行内代码里的 $ 不是公式）。 */
const MATH_BLOCKERS = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock', 'InlineCode']);

/* ----------------------------- widgets ----------------------------- */

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly raw: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'jz-lp-image';
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    img.onerror = () => {
      // 加载失败降级为原始源码文本
      wrap.classList.add('jz-lp-image-broken');
      wrap.textContent = this.raw;
    };
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() {
    return false; // 让 CM 处理点击 → 光标落入 → 当前行规则展开源码
  }
}

const MATH_CACHE = new Map<string, string>();
const MATH_CACHE_MAX = 200;

function mathHTML(expr: string): string {
  const hit = MATH_CACHE.get(expr);
  if (hit !== undefined) {
    MATH_CACHE.delete(expr);
    MATH_CACHE.set(expr, hit);
    return hit;
  }
  const span = document.createElement('span');
  renderLatex(span, expr, false);
  const html = span.innerHTML;
  MATH_CACHE.set(expr, html);
  if (MATH_CACHE.size > MATH_CACHE_MAX) {
    const oldest = MATH_CACHE.keys().next().value;
    if (oldest !== undefined) MATH_CACHE.delete(oldest);
  }
  return html;
}

class MathWidget extends WidgetType {
  constructor(readonly expr: string) {
    super();
  }
  eq(other: MathWidget) {
    return other.expr === this.expr;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'jz-lp-math jz-math-inline';
    span.innerHTML = mathHTML(this.expr);
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

/* ----------------------------- 构建 ----------------------------- */

const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;

function activeLineNumbers(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const from = view.state.doc.lineAt(r.from).number;
    const to = view.state.doc.lineAt(r.to).number;
    for (let n = from; n <= to; n++) lines.add(n);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];
  const active = activeLineNumbers(view);
  const doc = view.state.doc;
  const tree = syntaxTree(view.state);

  const lineIsActive = (pos: number) => active.has(doc.lineAt(pos).number);

  for (const { from, to } of view.visibleRanges) {
    // 1) 语法树：标记符 / 图片
    tree.iterate({
      from,
      to,
      enter(node) {
        if (BLOCK_CODE.has(node.name)) return false; // 不进块级代码区
        if (node.name === 'Image') {
          if (lineIsActive(node.from)) return false;
          const startLine = doc.lineAt(node.from);
          if (node.to > startLine.to) return false; // 跨行图片不处理
          const raw = doc.sliceString(node.from, node.to);
          const m = IMAGE_RE.exec(raw);
          if (m) {
            ranges.push(
              Decoration.replace({ widget: new ImageWidget(m[2], m[1], raw) }).range(
                node.from,
                node.to,
              ),
            );
          }
          return false; // 内部 LinkMark 不再单独隐藏
        }
        if (HIDE_MARKS.has(node.name) || node.name === 'URL') {
          if (lineIsActive(node.from)) return;
          let hideTo = node.to;
          // HeaderMark 把后随的一个空格一起藏（"# " 整体消失）
          if (node.name === 'HeaderMark' && doc.sliceString(node.to, node.to + 1) === ' ') {
            hideTo = node.to + 1;
          }
          // URL 节点只在 Link 内隐藏（裸 URL/Autolink 保留可见）
          if (node.name === 'URL') {
            const parent = node.node.parent;
            if (!parent || parent.name !== 'Link') return;
          }
          ranges.push(Decoration.replace({}).range(node.from, hideTo));
        }
      },
    });

    // 2) 行内公式 $..$（逐可见行扫描；跳过活动行与代码区）
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (!active.has(line.number) && line.text.includes('$')) {
        for (const span of scanInlineMath(line.text, line.from)) {
          const inner = tree.resolveInner(span.from + 1, 1);
          let blocked = false;
          for (let n: typeof inner | null = inner; n; n = n.parent) {
            if (MATH_BLOCKERS.has(n.name)) {
              blocked = true;
              break;
            }
          }
          if (!blocked) {
            ranges.push(
              Decoration.replace({ widget: new MathWidget(span.expr) }).range(span.from, span.to),
            );
          }
        }
      }
      pos = line.to + 1;
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

/** Ctrl/Cmd + 点击链接打开（click 阶段——mousedown 被 CM 选区处理占用）。 */
const linkClick = EditorView.domEventHandlers({
  click(e, view) {
    if (!(e.metaKey || e.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return false;
    let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1);
    for (; node; node = node.parent) {
      if (node.name === 'Link' || node.name === 'Autolink') {
        let url: string | null = null;
        const urlNode = node.getChild('URL');
        if (urlNode) url = view.state.sliceDoc(urlNode.from, urlNode.to);
        else if (node.name === 'Autolink')
          url = view.state.sliceDoc(node.from, node.to).replace(/^<|>$/g, '');
        if (url) {
          e.preventDefault();
          window.open(url, '_blank', 'noopener');
          return true;
        }
      }
    }
    return false;
  },
});

export function livePreview(): Extension {
  return [livePreviewPlugin, linkClick];
}
