/**
 * 快捷键注册表——全站键位的唯一真相源（2026-09-02）。
 *
 * 此前绑定散在 Tiptap handleKeyDown / CM6 keymap / ~20 处裸 window keydown，
 * 提示文案手写 'Ctrl+B' 二十余处、Mac 用户看到错的键。现在：
 *   - 绑定层按 `owner` 读这里的 chord（react 用 useShortcut/matchesChord，
 *     cm6 用 CM_KEYS，tiptap 用 toPmKey）；
 *   - 显示层一律 formatShortcut / <Kbd id=…>（kbdDiscipline.test 锁禁裸字符串）；
 *   - 速查表按 scope 从这里生成。
 * 同 scope 内 chord 重复必须用 `when` 区分上下文（如列表 Tab vs 表格 Tab）。
 */
import { parseChord, toCmKey } from './keys';

export type Scope =
  | 'global'
  | 'admin'
  | 'blog'
  | 'post'
  | 'editor'
  | 'editor.rich'
  | 'editor.markdown'
  | 'editor.html'
  | 'code-block'
  | 'find'
  | 'menu'
  | 'reader.epub'
  | 'reader.pdf'
  | 'reader.pptx'
  | 'lightbox';

export type Owner = 'react' | 'tiptap' | 'cm6' | 'lib' | 'dom';

export interface ShortcutDef {
  id: string;
  chord: string;
  scope: Scope;
  /** 速查表分组标题 */
  group: string;
  label: string;
  owner: Owner;
  /** 同 scope 同 chord 的上下文限定（速查表括号显示） */
  when?: string;
  /** 默认 true；单字母键（E / ?）设 false，输入区内不触发 */
  allowInTyping?: boolean;
  /** 与浏览器/系统快捷键冲突的说明（速查表小字提示） */
  conflict?: string;
  /** owner=cm6 时所在 keymap 源文件（相对 src/），供一致性测试核对 */
  file?: string;
  /** 不进速查表（纯内部导航键） */
  hidden?: boolean;
}

const EDITOR_INLINE = '行内格式';
const EDITOR_DOC = '文档';
const NAV = '导航';

export const SHORTCUTS: readonly ShortcutDef[] = [
  // ── 全局 ──
  { id: 'global.cheatsheet', chord: 'Mod+/', scope: 'global', group: NAV, label: '键盘快捷键速查', owner: 'react' },
  { id: 'global.cheatsheet-alt', chord: '?', scope: 'global', group: NAV, label: '键盘快捷键速查', owner: 'react', allowInTyping: false },
  // ── 后台 ──
  { id: 'admin.search', chord: 'Mod+K', scope: 'admin', group: NAV, label: '全文搜索', owner: 'react' },
  { id: 'admin.quick-switcher', chord: 'Mod+P', scope: 'admin', group: NAV, label: '快速跳转文档', owner: 'react', conflict: '覆盖浏览器「打印」，仅后台生效' },
  { id: 'admin.quick-capture', chord: 'Mod+Shift+code:Space', scope: 'admin', group: NAV, label: '快速记录', owner: 'react' },
  { id: 'admin.quick-capture.submit', chord: 'Enter', scope: 'admin', group: NAV, label: '速记：保存', owner: 'react', when: '速记弹窗', hidden: true },
  { id: 'admin.hero.save', chord: 'Mod+Enter', scope: 'admin', group: NAV, label: '题记：保存当前条', owner: 'react', when: '题记正文', hidden: true },
  // ── 博客 ──
  { id: 'blog.search', chord: 'Mod+K', scope: 'blog', group: NAV, label: '搜索', owner: 'react' },
  // ── 阅读页 ──
  { id: 'post.edit', chord: 'E', scope: 'post', group: '阅读', label: '进入编辑', owner: 'react', allowInTyping: false },
  { id: 'post.edit-alt', chord: 'Mod+E', scope: 'post', group: '阅读', label: '进入编辑', owner: 'react' },
  { id: 'post.exit-edit', chord: 'Escape', scope: 'post', group: '阅读', label: '保存并退出编辑', owner: 'react', when: '编辑态' },
  { id: 'post.exit-focus', chord: 'Escape', scope: 'post', group: '阅读', label: '退出专注阅读', owner: 'react', when: '专注阅读' },
  // ── 编辑器（三模式共通）──
  { id: 'editor.save', chord: 'Mod+S', scope: 'editor', group: EDITOR_DOC, label: '立即保存', owner: 'react', conflict: '覆盖浏览器「保存网页」' },
  { id: 'editor.find', chord: 'Mod+F', scope: 'editor', group: EDITOR_DOC, label: '查找替换', owner: 'react', conflict: '覆盖浏览器页内查找' },
  { id: 'editor.focus', chord: 'F9', scope: 'editor', group: EDITOR_DOC, label: '专注写作模式', owner: 'react', conflict: 'macOS 上 F9 默认是调度中心，需按住 fn' },
  { id: 'editor.focus-exit', chord: 'Escape', scope: 'editor', group: EDITOR_DOC, label: '退出专注写作', owner: 'react', when: '专注模式' },
  // ── 富文本 ──
  { id: 'editor.rich.bold', chord: 'Mod+B', scope: 'editor.rich', group: EDITOR_INLINE, label: '加粗', owner: 'lib' },
  { id: 'editor.rich.italic', chord: 'Mod+I', scope: 'editor.rich', group: EDITOR_INLINE, label: '斜体', owner: 'lib' },
  { id: 'editor.rich.underline', chord: 'Mod+U', scope: 'editor.rich', group: EDITOR_INLINE, label: '下划线', owner: 'lib' },
  { id: 'editor.rich.strike', chord: 'Mod+Shift+X', scope: 'editor.rich', group: EDITOR_INLINE, label: '删除线', owner: 'lib' },
  { id: 'editor.rich.code', chord: 'Mod+E', scope: 'editor.rich', group: EDITOR_INLINE, label: '行内代码', owner: 'tiptap' },
  { id: 'editor.rich.superscript', chord: 'Mod+.', scope: 'editor.rich', group: EDITOR_INLINE, label: '上标', owner: 'lib' },
  { id: 'editor.rich.subscript', chord: 'Mod+,', scope: 'editor.rich', group: EDITOR_INLINE, label: '下标', owner: 'lib' },
  { id: 'editor.rich.link', chord: 'Mod+K', scope: 'editor.rich', group: EDITOR_INLINE, label: '插入 / 编辑链接', owner: 'react' },
  { id: 'editor.rich.undo', chord: 'Mod+Z', scope: 'editor.rich', group: EDITOR_DOC, label: '撤销', owner: 'lib' },
  { id: 'editor.rich.redo', chord: 'Mod+Shift+Z', scope: 'editor.rich', group: EDITOR_DOC, label: '重做', owner: 'lib' },
  { id: 'editor.rich.paragraph', chord: 'Alt+Mod+0', scope: 'editor.rich', group: '段落', label: '正文', owner: 'tiptap' },
  { id: 'editor.rich.h1', chord: 'Alt+Mod+1', scope: 'editor.rich', group: '段落', label: '一级标题', owner: 'tiptap' },
  { id: 'editor.rich.h2', chord: 'Alt+Mod+2', scope: 'editor.rich', group: '段落', label: '二级标题', owner: 'tiptap' },
  { id: 'editor.rich.h3', chord: 'Alt+Mod+3', scope: 'editor.rich', group: '段落', label: '三级标题', owner: 'tiptap' },
  { id: 'editor.rich.h4', chord: 'Alt+Mod+4', scope: 'editor.rich', group: '段落', label: '四级标题', owner: 'tiptap' },
  { id: 'editor.rich.h5', chord: 'Alt+Mod+5', scope: 'editor.rich', group: '段落', label: '五级标题', owner: 'tiptap' },
  { id: 'editor.rich.h6', chord: 'Alt+Mod+6', scope: 'editor.rich', group: '段落', label: '六级标题', owner: 'tiptap' },
  { id: 'editor.rich.align-left', chord: 'Mod+Shift+L', scope: 'editor.rich', group: '段落', label: '左对齐', owner: 'lib' },
  { id: 'editor.rich.align-center', chord: 'Mod+Shift+E', scope: 'editor.rich', group: '段落', label: '居中', owner: 'lib' },
  { id: 'editor.rich.align-right', chord: 'Mod+Shift+R', scope: 'editor.rich', group: '段落', label: '右对齐', owner: 'lib' },
  { id: 'editor.rich.indent', chord: 'Tab', scope: 'editor.rich', group: '段落', label: '增加缩进', owner: 'tiptap', when: '非列表' },
  { id: 'editor.rich.outdent', chord: 'Shift+Tab', scope: 'editor.rich', group: '段落', label: '减少缩进', owner: 'tiptap', when: '非列表' },
  { id: 'editor.rich.mention', chord: '@', scope: 'editor.rich', group: '插入', label: '引用文档', owner: 'tiptap', hidden: true },
  { id: 'editor.rich.fullscreen-exit', chord: 'Escape', scope: 'editor.rich', group: EDITOR_DOC, label: '退出全屏', owner: 'react', when: '全屏' },
  // ── Markdown（CM6）──
  { id: 'editor.markdown.bold', chord: 'Mod+B', scope: 'editor.markdown', group: EDITOR_INLINE, label: '加粗（再按解包）', owner: 'cm6', file: 'components/editor/codemirror/extensions/inlineFormatKeymap.ts' },
  { id: 'editor.markdown.italic', chord: 'Mod+I', scope: 'editor.markdown', group: EDITOR_INLINE, label: '斜体', owner: 'cm6', file: 'components/editor/codemirror/extensions/inlineFormatKeymap.ts' },
  { id: 'editor.markdown.strike', chord: 'Mod+Shift+X', scope: 'editor.markdown', group: EDITOR_INLINE, label: '删除线', owner: 'cm6', file: 'components/editor/codemirror/extensions/inlineFormatKeymap.ts' },
  { id: 'editor.markdown.code', chord: 'Mod+E', scope: 'editor.markdown', group: EDITOR_INLINE, label: '行内代码', owner: 'cm6', file: 'components/editor/codemirror/extensions/inlineFormatKeymap.ts' },
  { id: 'editor.markdown.link', chord: 'Mod+K', scope: 'editor.markdown', group: EDITOR_INLINE, label: '插入链接（选中文字成链）', owner: 'cm6', file: 'components/editor/codemirror/extensions/inlineFormatKeymap.ts' },
  { id: 'editor.markdown.underline', chord: 'Mod+U', scope: 'editor.markdown', group: EDITOR_INLINE, label: '下划线', owner: 'react' },
  { id: 'editor.markdown.undo', chord: 'Mod+Z', scope: 'editor.markdown', group: EDITOR_DOC, label: '撤销', owner: 'lib' },
  { id: 'editor.markdown.redo', chord: 'Mod+Shift+Z', scope: 'editor.markdown', group: EDITOR_DOC, label: '重做', owner: 'lib' },
  { id: 'editor.markdown.list-continue', chord: 'Enter', scope: 'editor.markdown', group: '列表与缩进', label: '续列表（- / 1. / > / 任务），空项退出', owner: 'cm6', when: '列表', file: 'components/editor/codemirror/extensions/listKeymap.ts' },
  { id: 'editor.markdown.list-indent', chord: 'Tab', scope: 'editor.markdown', group: '列表与缩进', label: '列表缩进（非列表插入两空格）', owner: 'cm6', when: '列表', file: 'components/editor/codemirror/extensions/listKeymap.ts' },
  { id: 'editor.markdown.list-outdent', chord: 'Shift+Tab', scope: 'editor.markdown', group: '列表与缩进', label: '列表反缩进', owner: 'cm6', when: '列表', file: 'components/editor/codemirror/extensions/listKeymap.ts' },
  { id: 'editor.markdown.table-next', chord: 'Tab', scope: 'editor.markdown', group: '表格', label: '下一格（末格自动追加一行）', owner: 'cm6', when: '表格', file: 'components/editor/codemirror/extensions/tableAssist.ts' },
  { id: 'editor.markdown.table-prev', chord: 'Shift+Tab', scope: 'editor.markdown', group: '表格', label: '上一格', owner: 'cm6', when: '表格', file: 'components/editor/codemirror/extensions/tableAssist.ts' },
  { id: 'editor.markdown.table-row', chord: 'Enter', scope: 'editor.markdown', group: '表格', label: '下方插入一行（空行删行退表）', owner: 'cm6', when: '表格', file: 'components/editor/codemirror/extensions/tableAssist.ts' },
  { id: 'editor.markdown.mention', chord: '@', scope: 'editor.markdown', group: '插入', label: '引用文档（Esc 取消保留字面 @）', owner: 'react', hidden: true },
  // ── HTML ──
  { id: 'editor.html.tab', chord: 'Tab', scope: 'editor.html', group: EDITOR_DOC, label: '插入两空格（Shift+Tab 仍移焦）', owner: 'react' },
  // ── 代码块 ──
  { id: 'code-block.auto-indent', chord: 'Mod+Shift+F', scope: 'code-block', group: '代码块', label: '自动缩进', owner: 'react' },
  { id: 'code-block.diagram-mode', chord: 'Mod+Shift+P', scope: 'code-block', group: '代码块', label: 'Mermaid：切换 图表 / 源码 / 分栏', owner: 'react', conflict: 'Firefox 隐私窗口' },
  // ── 查找替换 ──
  { id: 'find.close', chord: 'Escape', scope: 'find', group: '查找替换', label: '关闭', owner: 'react' },
  { id: 'find.prev', chord: 'Mod+Enter', scope: 'find', group: '查找替换', label: '上一个匹配', owner: 'react' },
  { id: 'find.next', chord: 'Enter', scope: 'find', group: '查找替换', label: '下一个匹配', owner: 'react' },
  // ── 弹出菜单（斜杠 / @ / emoji / 搜索）──
  { id: 'menu.up', chord: 'ArrowUp', scope: 'menu', group: '菜单', label: '上一项', owner: 'react', hidden: true },
  { id: 'menu.down', chord: 'ArrowDown', scope: 'menu', group: '菜单', label: '下一项', owner: 'react', hidden: true },
  { id: 'menu.select', chord: 'Enter', scope: 'menu', group: '菜单', label: '选中', owner: 'react', hidden: true },
  { id: 'menu.close', chord: 'Escape', scope: 'menu', group: '菜单', label: '关闭', owner: 'react', hidden: true },
  // ── EPUB 阅读器 ──
  { id: 'reader.epub.prev', chord: 'ArrowLeft', scope: 'reader.epub', group: '翻页', label: '上一页', owner: 'react' },
  { id: 'reader.epub.next', chord: 'ArrowRight', scope: 'reader.epub', group: '翻页', label: '下一页', owner: 'react' },
  { id: 'reader.epub.prev-alt', chord: 'PageUp', scope: 'reader.epub', group: '翻页', label: '上一页', owner: 'react', hidden: true },
  { id: 'reader.epub.next-alt', chord: 'PageDown', scope: 'reader.epub', group: '翻页', label: '下一页', owner: 'react', hidden: true },
  { id: 'reader.epub.page-next', chord: 'Space', scope: 'reader.epub', group: '翻页', label: '下一页', owner: 'react', hidden: true },
  { id: 'reader.epub.page-prev', chord: 'Shift+Space', scope: 'reader.epub', group: '翻页', label: '上一页', owner: 'react', hidden: true },
  { id: 'reader.epub.prev-chapter', chord: 'Shift+ArrowLeft', scope: 'reader.epub', group: '翻页', label: '上一章', owner: 'react' },
  { id: 'reader.epub.next-chapter', chord: 'Shift+ArrowRight', scope: 'reader.epub', group: '翻页', label: '下一章', owner: 'react' },
  { id: 'reader.epub.first', chord: 'Home', scope: 'reader.epub', group: '翻页', label: '第一章', owner: 'react' },
  { id: 'reader.epub.last', chord: 'End', scope: 'reader.epub', group: '翻页', label: '最后一章', owner: 'react' },
  { id: 'reader.epub.escape', chord: 'Escape', scope: 'reader.epub', group: '翻页', label: '关闭选区栏 / 划线卡', owner: 'react' },
  { id: 'reader.epub.note-save', chord: 'Mod+Enter', scope: 'reader.epub', group: '划线笔记', label: '保存笔记', owner: 'react', when: '笔记卡' },
  // ── PPT / PDF ──
  { id: 'reader.pptx.prev', chord: 'ArrowLeft', scope: 'reader.pptx', group: '翻页', label: '上一页', owner: 'react' },
  { id: 'reader.pptx.next', chord: 'ArrowRight', scope: 'reader.pptx', group: '翻页', label: '下一页', owner: 'react' },
  { id: 'reader.pptx.prev-alt', chord: 'PageUp', scope: 'reader.pptx', group: '翻页', label: '上一页', owner: 'react', hidden: true },
  { id: 'reader.pptx.next-alt', chord: 'PageDown', scope: 'reader.pptx', group: '翻页', label: '下一页', owner: 'react', hidden: true },
  { id: 'reader.pptx.fullscreen-exit', chord: 'Escape', scope: 'reader.pptx', group: '翻页', label: '退出全屏', owner: 'react' },
  { id: 'reader.pdf.fullscreen-exit', chord: 'Escape', scope: 'reader.pdf', group: '翻页', label: '退出全屏', owner: 'react' },
  // ── 图片 / 图表全屏 ──
  { id: 'lightbox.close', chord: 'Escape', scope: 'lightbox', group: '全屏查看', label: '关闭', owner: 'dom' },
  { id: 'lightbox.fit', chord: '0', scope: 'lightbox', group: '全屏查看', label: '适应窗口', owner: 'dom' },
  { id: 'lightbox.zoom-in', chord: '+', scope: 'lightbox', group: '全屏查看', label: '放大', owner: 'dom' },
  { id: 'lightbox.zoom-out', chord: '-', scope: 'lightbox', group: '全屏查看', label: '缩小', owner: 'dom' },
];

/** 输入规则（`# 空格` 一类的即时变形），与快捷键分开列在速查表「快捷输入」页。 */
export interface InputRule {
  scope: 'editor' | 'editor.rich' | 'editor.markdown';
  group: string;
  trigger: string;
  label: string;
}

export const INPUT_RULES: readonly InputRule[] = [
  { scope: 'editor.rich', group: '段落 / 标题', trigger: '# 空格 … ###### 空格', label: '一至六级标题' },
  { scope: 'editor.rich', group: '段落 / 标题', trigger: '> 空格', label: '引用块' },
  { scope: 'editor.rich', group: '段落 / 标题', trigger: '--- 回车', label: '分割线' },
  { scope: 'editor.rich', group: '行内格式', trigger: '**粗体**', label: '粗体' },
  { scope: 'editor.rich', group: '行内格式', trigger: '*斜体* 或 _斜体_', label: '斜体' },
  { scope: 'editor.rich', group: '行内格式', trigger: '~~删除线~~', label: '删除线' },
  { scope: 'editor.rich', group: '行内格式', trigger: '`行内代码`', label: '行内代码' },
  { scope: 'editor.rich', group: '行内格式', trigger: '==高亮==', label: '字体背景色' },
  { scope: 'editor.rich', group: '列表 / 任务', trigger: '- 空格 或 * 空格', label: '无序列表' },
  { scope: 'editor.rich', group: '列表 / 任务', trigger: '1. 空格', label: '有序列表' },
  { scope: 'editor.rich', group: '列表 / 任务', trigger: '[ ] 空格', label: '任务列表' },
  { scope: 'editor.rich', group: '代码块 / 表格', trigger: '``` 回车', label: '代码块（可指定语言）' },
  { scope: 'editor.rich', group: '代码块 / 表格', trigger: '``` mermaid', label: 'Mermaid 图表' },
  { scope: 'editor', group: '插入与引用', trigger: '/', label: '斜杠命令（支持拼音缩写：dmk 代码块、lct 流程图、glk 高亮块…）' },
  { scope: 'editor', group: '插入与引用', trigger: '@', label: '引用文档' },
  { scope: 'editor', group: '插入与引用', trigger: '粘贴 URL（有选区）', label: '自动成 [选区](url) 链接' },
  { scope: 'editor', group: '插入与引用', trigger: '粘贴 / 拖入图片', label: '自动上传并插入' },
];

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcut(id: string): ShortcutDef {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`unknown shortcut id: ${id}`);
  return s;
}

export function getChord(id: string): string {
  return getShortcut(id).chord;
}

/** 按 scope 过滤（含 `editor.*` 对 `editor` 的继承）。 */
export function shortcutsForScopes(scopes: readonly Scope[], opts: { includeHidden?: boolean } = {}): ShortcutDef[] {
  const set = new Set<Scope>(scopes);
  for (const s of scopes) if (s.startsWith('editor.')) set.add('editor');
  return SHORTCUTS.filter((s) => set.has(s.scope) && (opts.includeHidden || !s.hidden));
}

export function inputRulesForScopes(scopes: readonly Scope[]): InputRule[] {
  const set = new Set<string>(scopes);
  for (const s of scopes) if (s.startsWith('editor.')) set.add('editor');
  return INPUT_RULES.filter((r) => set.has(r.scope));
}

/** CM6 keymap 键名，供 inlineFormatKeymap / listKeymap / tableAssist 消费。 */
export const CM_KEYS: Record<string, string> = Object.fromEntries(
  SHORTCUTS.filter((s) => s.owner === 'cm6').map((s) => [s.id, toCmKey(parseChord(s.chord))]),
);
