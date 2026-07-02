import {
  MERMAID_TEMPLATES,
  PLANTUML_TEMPLATES,
  type SlashCommandItem,
  filterSlashCommands,
  getSlashCommands,
} from './slashCommandRegistry';

/**
 * richTextOnly 命令中，渲染管道（convertLayoutBlocks / markdown-it-footnote /
 * convertBlockPlaceholders）已支持等价源码语法的覆盖集合 —— MD 模式直接插
 * 源码，不再提示「请切换到富文本」。
 */
const MD_OVERRIDE_INSERTS: Record<string, string> = {
  'columns-2': '\n:::cols-2\n左栏内容\n::col\n右栏内容\n:::\n\n',
  'columns-3': '\n:::cols-3\n第一栏\n::col\n第二栏\n::col\n第三栏\n:::\n\n',
  tabs: '\n:::tabs\n::tab 标签一\n内容一\n::tab 标签二\n内容二\n:::\n\n',
  footnote: '正文[^1]\n\n[^1]: 脚注内容\n',
  // TOC placeholders are richTextOnly in the registry, but the CM6 source
  // editor can still emit the literal marker (the reader expands it).
  toc: '[TOC]\n\n',
  'toc-section': '[TOC:section]\n\n',
};

/** 在 MD 模式经特殊交互（弹选择器/Modal）完成、而非纯文本插入的命令。 */
const MD_INTERACTIVE_IDS = new Set(['mention', 'doc-card', 'math-block', 'math-inline']);

/** MD 模式可用（直接插入或有专属交互），用于菜单置灰与回车选择判定。 */
export function isMarkdownCapable(item: SlashCommandItem): boolean {
  if (MD_INTERACTIVE_IDS.has(item.id)) return true;
  if (item.id in MD_OVERRIDE_INSERTS) return true;
  return !item.richTextOnly && getMarkdownInsertForCommand(item) !== null;
}

/** 命令是否走 MD 专属交互（返回交互类型，否则 null）。 */
export function markdownInteractiveKind(
  item: SlashCommandItem,
): 'mention' | 'doc-card' | 'math-block' | 'math-inline' | null {
  return MD_INTERACTIVE_IDS.has(item.id)
    ? (item.id as 'mention' | 'doc-card' | 'math-block' | 'math-inline')
    : null;
}

/** Markdown snippet inserted when a slash command is chosen (replaces `/query`). */
export function getMarkdownInsertForCommand(item: SlashCommandItem): string | null {
  const override = MD_OVERRIDE_INSERTS[item.id];
  if (override !== undefined) return override;
  if (item.richTextOnly) return null;

  switch (item.id) {
    case 'h1':
      return '# ';
    case 'h2':
      return '## ';
    case 'h3':
      return '### ';
    case 'paragraph':
      return '\n\n';
    case 'bullet-list':
      return '- ';
    case 'ordered-list':
      return '1. ';
    case 'task-list':
      return '- [ ] ';
    case 'quote':
      return '> ';
    case 'hyperlink':
      return '[链接文字](https://)';
    case 'table':
      return '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n\n';
    case 'hr':
      return '\n---\n\n';
    case 'code-block':
      return '```\n\n```\n';
    case 'mermaid-picker':
      return wrapFence('mermaid', MERMAID_TEMPLATES.flowchart);
    case 'mermaid-flowchart':
      return wrapFence('mermaid', MERMAID_TEMPLATES.flowchart);
    case 'mermaid-sequence':
      return wrapFence('mermaid', MERMAID_TEMPLATES.sequence);
    case 'mermaid-class':
      return wrapFence('mermaid', MERMAID_TEMPLATES.class);
    case 'mermaid-state':
      return wrapFence('mermaid', MERMAID_TEMPLATES.state);
    case 'mermaid-gantt':
      return wrapFence('mermaid', MERMAID_TEMPLATES.gantt);
    case 'plantuml-sequence':
      return wrapFence('plantuml', PLANTUML_TEMPLATES.sequence);
    case 'plantuml-class':
      return wrapFence('plantuml', PLANTUML_TEMPLATES.class);
    case 'plantuml-usecase':
      return wrapFence('plantuml', PLANTUML_TEMPLATES.usecase);
    case 'plantuml-component':
      return wrapFence('plantuml', PLANTUML_TEMPLATES.component);
    case 'callout-tips':
      return ':::tips\n\n:::\n';
    case 'callout-info':
      return ':::info\n\n:::\n';
    case 'callout-warning':
      return ':::warning\n\n:::\n';
    case 'callout-danger':
      return ':::danger\n\n:::\n';
    case 'callout-success':
      return ':::success\n\n:::\n';
    case 'callout-color2':
      return ':::color2\n\n:::\n';
    case 'callout-color1':
      return ':::color1\n\n:::\n';
    case 'details':
      return ':::details 摘要\n\n内容\n:::\n';
    case 'math-block':
      return '$$\n\n$$\n';
    case 'math-inline':
      return '$x$';
    default:
      return null;
  }
}

function wrapFence(lang: string, body: string): string {
  return '```' + lang + '\n' + body + '\n```\n\n';
}

/** Find `/query` trigger before cursor; returns replace range in source string. */
export function findSlashTrigger(
  source: string,
  cursor: number,
): { from: number; to: number; query: string } | null {
  const before = source.slice(0, cursor);
  const slash = before.lastIndexOf('/');
  if (slash < 0) return null;
  const query = before.slice(slash + 1);
  if (/[\s\n]/.test(query)) return null;
  return { from: slash, to: cursor, query };
}

export function applyMarkdownSlashCommand(
  source: string,
  from: number,
  to: number,
  item: SlashCommandItem,
): string | null {
  const insert = getMarkdownInsertForCommand(item);
  if (insert === null) return null;
  return source.slice(0, from) + insert + source.slice(to);
}

export function filterMarkdownSlashCommands(query: string): SlashCommandItem[] {
  return filterSlashCommands(query, getSlashCommands());
}

export { detectMermaidKeyFromSource } from './slashCommandRegistry';
