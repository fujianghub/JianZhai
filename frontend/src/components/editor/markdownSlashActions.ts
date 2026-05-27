import {
  MERMAID_TEMPLATES,
  PLANTUML_TEMPLATES,
  type SlashCommandItem,
  filterSlashCommands,
  getSlashCommands,
} from './slashCommandRegistry';

/** Markdown snippet inserted when a slash command is chosen (replaces `/query`). */
export function getMarkdownInsertForCommand(item: SlashCommandItem): string | null {
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
    case 'columns-2':
      return '<!-- 双栏布局请切换到富文本编辑器 -->\n\n';
    case 'columns-3':
      return '<!-- 三栏布局请切换到富文本编辑器 -->\n\n';
    case 'tabs':
      return '<!-- 标签页请切换到富文本编辑器 -->\n\n';
    case 'toc':
      return '[TOC]\n\n';
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
