/**
 * linkAt — MD 源码里「光标处链接」的定位与三形态转换（链接/标题/卡片）
 * 纯逻辑。与 inlineFormat 同构：返回 EditInstruction 由调用方 dispatch。
 *
 * 只扫光标所在行（链接不跨行）；图片 `![...]()` 不算链接；mention 的
 * `@` 前缀留在链接范围之外，但整行判定/卡片替换时把它并入（避免转卡
 * 片后行首残留孤零零的 `@`）。fence/行内代码的排除在接线层做（syntaxTree）。
 */
import type { EditInstruction } from './inlineFormat';

export interface MdLink {
  /** `[text](url)` 的绝对范围（不含 @ 前缀）。 */
  from: number;
  to: number;
  /** 含 mention `@` 前缀的起点（无前缀时等于 from）。 */
  atFrom: number;
  text: string;
  href: string;
}

// [text](url)，url 容忍一层嵌套括号；text 不含换行与方括号
const LINK_RE = /(!?)\[([^\][\n]*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/g;

function lineBoundsAt(doc: string, pos: number): { start: number; end: number } {
  const start = doc.lastIndexOf('\n', pos - 1) + 1;
  const nl = doc.indexOf('\n', pos);
  return { start, end: nl === -1 ? doc.length : nl };
}

/** 光标（含边界）落在某个 `[text](url)` 上则返回其信息，否则 null。 */
export function findLinkAt(doc: string, pos: number): MdLink | null {
  if (pos < 0 || pos > doc.length) return null;
  const { start, end } = lineBoundsAt(doc, pos);
  const line = doc.slice(start, end);
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(line))) {
    const isImage = m[1] === '!';
    const from = start + m.index + m[1]!.length;
    const to = start + m.index + m[0]!.length;
    if (isImage) continue;
    if (pos < from || pos > to) continue;
    const atFrom = from > start && doc[from - 1] === '@' ? from - 1 : from;
    return { from, to, atFrom, text: m[2] ?? '', href: m[3] ?? '' };
  }
  return null;
}

/** 链接模式：显示文本换成 URL 原文 `[url](url)`。 */
export function linkToPlain(link: MdLink): EditInstruction {
  const insert = `[${link.href}](${link.href})`;
  const end = link.from + insert.length;
  return { from: link.from, to: link.to, insert, selFrom: end, selTo: end };
}

/** 标题模式：显示文本换成目标标题 `[title](url)`。 */
export function linkToTitle(link: MdLink, title: string): EditInstruction {
  const insert = `[${title}](${link.href})`;
  const end = link.from + insert.length;
  return { from: link.from, to: link.to, insert, selFrom: end, selTo: end };
}

/**
 * 卡片模式：链接换成整行占位符（`[[doc-card:ID]]` / `[[link-card:URL]]`）。
 * 链接独占一行 → 原地整行替换；行内还有其他内容 → 从链接处截断，
 * 行尾剩余文本保留在原行，占位符另起一行。
 */
export function linkToCard(doc: string, link: MdLink, placeholder: string): EditInstruction {
  const { start, end } = lineBoundsAt(doc, link.from);
  const before = doc.slice(start, link.atFrom);
  const after = doc.slice(link.to, end);
  if (before.trim() === '' && after.trim() === '') {
    // 整行只有这个链接：连行首缩进一起换掉
    const selEnd = start + placeholder.length;
    return { from: start, to: end, insert: placeholder, selFrom: selEnd, selTo: selEnd };
  }
  const insert = `${after}\n${placeholder}`;
  const selEnd = link.atFrom + insert.length;
  return { from: link.atFrom, to: end, insert, selFrom: selEnd, selTo: selEnd };
}
