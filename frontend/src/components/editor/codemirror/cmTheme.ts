import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * CodeMirror 主题 — 色值全部引用 `--jz-*` CSS 变量。
 * `[data-theme]` 切换时浏览器自动重算变量，四主题（light/dark/starry/deepsea）
 * 免 JS 订阅自动跟随。
 */
export const jzCmTheme = EditorView.theme({
  '&': {
    color: 'var(--jz-text)',
    backgroundColor: 'transparent',
    fontSize: '14px',
    height: '100%',
    border: '1px solid var(--glass-border, var(--jz-border))',
    borderRadius: '10px',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'color-mix(in srgb, var(--jz-accent) 55%, var(--jz-border))',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.7',
    overflow: 'auto',
    borderRadius: '10px',
  },
  '.cm-content': {
    caretColor: 'var(--jz-accent)',
    padding: '12px 0 45vh', // 底部留白：最后一行不贴底
  },
  '.cm-line': { padding: '0 14px' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--jz-accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--jz-accent) 24%, transparent) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--jz-text-muted)',
    border: 'none',
    borderRight: '1px solid var(--jz-divider)',
    fontSize: '12px',
    userSelect: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
    minWidth: '36px',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--jz-accent) 6%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--jz-accent)',
    fontWeight: '600',
  },
  '.cm-placeholder': { color: 'var(--jz-text-muted)' },
  // 匹配括号
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--jz-accent) 18%, transparent)',
    outline: 'none',
  },
});

/**
 * Markdown 源码语法着色 —— 标记符号弱化、内容语义化染色，
 * 接近 Typora/Obsidian 源码模式手感。
 */
export const jzCmHighlight = syntaxHighlighting(
  HighlightStyle.define([
    // 标题：重音色 + 加粗，级别越高字号越大
    { tag: tags.heading1, color: 'var(--jz-accent)', fontWeight: '700', fontSize: '1.5em' },
    { tag: tags.heading2, color: 'var(--jz-accent)', fontWeight: '700', fontSize: '1.3em' },
    { tag: tags.heading3, color: 'var(--jz-accent)', fontWeight: '700', fontSize: '1.15em' },
    { tag: tags.heading4, color: 'var(--jz-accent)', fontWeight: '700' },
    { tag: tags.heading5, color: 'var(--jz-accent)', fontWeight: '600' },
    { tag: tags.heading6, color: 'var(--jz-accent)', fontWeight: '600' },
    // 行内语义
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.75' },
    { tag: tags.link, color: 'var(--jz-accent-soft, var(--jz-accent))', textDecoration: 'underline' },
    { tag: tags.url, color: 'var(--jz-text-muted)' },
    // 行内代码 / 代码块内容
    {
      tag: tags.monospace,
      color: 'var(--jz-accent-soft, var(--jz-accent))',
      backgroundColor: 'color-mix(in srgb, var(--jz-surface-2) 70%, transparent)',
      borderRadius: '3px',
    },
    // 引用
    { tag: tags.quote, color: 'var(--jz-text-muted)', fontStyle: 'italic' },
    // 列表符号 / 标记符（#、*、>、- 等元字符）弱化
    { tag: tags.processingInstruction, color: 'var(--jz-text-muted)' },
    { tag: tags.punctuation, color: 'var(--jz-text-muted)' },
    { tag: tags.meta, color: 'var(--jz-text-muted)' },
    { tag: tags.labelName, color: 'var(--jz-gold, var(--jz-text-muted))' },
    // 代码块里的通用代码 token（lang-markdown 嵌套语言时）
    { tag: tags.keyword, color: 'var(--jz-accent)' },
    { tag: tags.string, color: 'var(--jz-gold, #94a3b8)' },
    { tag: tags.comment, color: 'var(--jz-text-muted)', fontStyle: 'italic' },
    { tag: tags.contentSeparator, color: 'var(--jz-text-muted)' }, // --- 分隔线
  ]),
);
