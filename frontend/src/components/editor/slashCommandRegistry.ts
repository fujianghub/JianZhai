import type { Editor, Range } from '@tiptap/core';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { runAI } from '@/api/ai';
import { getResolvedAIModelId } from '@/utils/aiModel';
import { message } from '@/utils/notify';
import { getInsertMenuActions, type InsertMenuActions } from './insertMenuActions';
import {
  JzAiSparkIcon,
  JzAtIcon,
  JzAttachmentIcon,
  JzCalloutIcon,
  JzColumns2Icon,
  JzColumns3Icon,
  JzDetailsIcon,
  JzDocCardIcon,
  JzEmojiIcon,
  JzHrIcon,
  JzImageIcon,
  JzLinkCardIcon,
  JzMathIcon,
  JzMermaidIcon,
  JzQuoteIcon,
  JzTableIcon,
  JzTabsIcon,
  JzUmlIcon,
  JzVideoIcon,
} from '@/components/common/JzIcon';

/** Mermaid templates — shared by slash menu, CodeBlockView, and markdown insert. */
export const MERMAID_TEMPLATES = {
  flowchart: `graph TD\n  A[开始] --> B{判断}\n  B -- 是 --> C[执行]\n  B -- 否 --> D[跳过]\n  C --> E[结束]\n  D --> E`,
  sequence: `sequenceDiagram\n  participant U as 用户\n  participant S as 服务\n  U->>S: 请求\n  S-->>U: 响应`,
  class: `classDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog\n  Animal <|-- Dog`,
  state: `stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: stop`,
  gantt: `gantt\n  title 项目排期\n  section 准备\n  设计 :a1, 2026-05-20, 3d\n  开发 :after a1, 5d`,
} as const;

export type MermaidTemplateKey = keyof typeof MERMAID_TEMPLATES;

export const MERMAID_TYPE_LABELS: Record<MermaidTemplateKey, string> = {
  flowchart: '流程图',
  sequence: '时序图',
  class: '类图',
  state: '状态图',
  gantt: '甘特图',
};

export const PLANTUML_TEMPLATES = {
  sequence: `@startuml\nactor 用户 as U\nparticipant "Web 服务" as W\nparticipant "数据库" as DB\nU -> W: HTTP 请求\nW -> DB: 查询\nDB --> W: 结果\nW --> U: 响应\n@enduml`,
  class: `@startuml\nclass Animal {\n  +String name\n  +eat()\n}\nclass Dog\nAnimal <|-- Dog\n@enduml`,
  usecase: `@startuml\nleft to right direction\nactor 读者\nactor 管理员\nrectangle 简斋 {\n  读者 --> (浏览博客)\n  读者 --> (订阅 RSS)\n  管理员 --> (编辑文档)\n  管理员 --> (发布)\n}\n@enduml`,
  component: `@startuml\npackage "前端" {\n  [React SPA] as SPA\n}\npackage "后端" {\n  [Django + DRF] as API\n  [Celery Worker] as W\n}\ndatabase PostgreSQL\nSPA --> API\nAPI --> PostgreSQL\nAPI --> W\nW --> PostgreSQL\n@enduml`,
} as const;

export type PlantumlTemplateKey = keyof typeof PLANTUML_TEMPLATES;

const SLASH_RECENT_KEY = 'jz-slash-recent';
const SLASH_RECENT_MAX = 5;

export function trackRecentSlashCommand(title: string): void {
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(SLASH_RECENT_KEY) ?? '[]');
    const next = [title, ...prev.filter((t) => t !== title)].slice(0, SLASH_RECENT_MAX);
    localStorage.setItem(SLASH_RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecentSlashTitles(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SLASH_RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export type InsertMenuActionKind = 'image' | 'attachment' | 'mention' | 'emoji' | 'ai';

export interface SlashCommandItem {
  id: string;
  category: string;
  icon: ReactNode;
  title: string;
  description?: string;
  /** Yuque-style pinyin shortcuts shown as `/dmk` in the menu. */
  aliases?: string[];
  keywords?: string[];
  /** Only available in rich-text (Tiptap); greyed out in Markdown slash menu. */
  richTextOnly?: boolean;
  /** Quick-insert panel section (Yuque-style); omit to hide from green + menu. */
  menuSection?: string;
  menuOrder?: number;
  /** 2×2 grid in 基础 section */
  menuGrid?: boolean;
  /** Override title in quick-insert panel */
  menuTitle?: string;
  /** Handled via RichTextEditor callbacks instead of command body */
  menuAction?: InsertMenuActionKind;
  command: (props: { editor: Editor; range: Range }) => void | Promise<void> | boolean;
}

export function cursorInsertRange(editor: Editor): Range {
  const from = editor.state.selection.from;
  return { from, to: from };
}

export function executeSlashCommandAtCursor(
  editor: Editor,
  item: SlashCommandItem,
  localActions?: InsertMenuActions,
): void {
  const acts = localActions ?? getInsertMenuActions();
  if (item.menuAction) {
    trackRecentSlashCommand(item.title);
    const range = cursorInsertRange(editor);
    editor.chain().focus().deleteRange(range).run();
    switch (item.menuAction) {
      case 'image':
        acts?.pickImage?.();
        return;
      case 'attachment':
        acts?.pickAttachment?.();
        return;
      case 'mention':
        acts?.openMention?.();
        return;
      case 'emoji':
        acts?.openEmoji?.();
        return;
      case 'ai':
        acts?.openAI?.();
        return;
      default:
        return;
    }
  }
  trackRecentSlashCommand(item.title);
  void Promise.resolve(item.command({ editor, range: cursorInsertRange(editor) }));
}

export function getSlashCommandById(id: string, commands = getSlashCommands()): SlashCommandItem | undefined {
  return commands.find((c) => c.id === id);
}

function insertCodeBlock(editor: Editor, range: Range, language: string, template: string): void {
  void editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({
      type: 'codeBlock',
      attrs: { language },
      content: [{ type: 'text', text: template }],
    })
    .run();
}

function aliasDesc(...aliases: string[]): string {
  const primary = aliases[0];
  return primary ? `/${primary}` : '';
}

function iconText(text: string): ReactNode {
  return createElement('span', { style: { fontWeight: 650, fontSize: 12 } }, text);
}

/** Build the full rich-text slash command list. */
export function buildSlashCommands(): SlashCommandItem[] {
  const mermaidVariants: SlashCommandItem[] = (
    Object.keys(MERMAID_TEMPLATES) as MermaidTemplateKey[]
  ).map((key) => ({
    id: `mermaid-${key}`,
    category: '图表',
    icon: createElement(JzMermaidIcon, { size: 18 }),
    title: `Mermaid · ${MERMAID_TYPE_LABELS[key]}`,
    description: key === 'flowchart' ? 'graph TD' : key,
    aliases: key === 'flowchart' ? ['mermaid', 'tb', 'lct'] : undefined,
    keywords: ['mermaid', key, MERMAID_TYPE_LABELS[key], '图'],
    ...(key === 'flowchart'
      ? {
          menuSection: '画板类',
          menuOrder: 1,
          menuTitle: '流程图',
        }
      : {}),
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'mermaid', MERMAID_TEMPLATES[key]),
  }));

  return [
    {
      id: 'image',
      category: '媒体',
      icon: createElement(JzImageIcon, { size: 18 }),
      title: '图片',
      description: '上传图片并插入',
      aliases: ['tp', 'tupian'],
      keywords: ['image', '图片', 'photo', 'upload'],
      richTextOnly: true,
      menuSection: '基础',
      menuOrder: 1,
      menuGrid: true,
      menuAction: 'image',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        getInsertMenuActions()?.pickImage?.();
      },
    },
    {
      id: 'attachment',
      category: '媒体',
      icon: createElement(JzAttachmentIcon, { size: 18 }),
      title: '附件',
      description: '上传文件并插入链接',
      aliases: ['fj', 'fujian'],
      keywords: ['attachment', '附件', 'file'],
      richTextOnly: true,
      menuSection: '基础',
      menuOrder: 3,
      menuGrid: true,
      menuAction: 'attachment',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        getInsertMenuActions()?.pickAttachment?.();
      },
    },
    {
      id: 'mention',
      category: '结构',
      icon: createElement(JzAtIcon, { size: 18 }),
      title: '提及',
      description: '提及文档或内容',
      aliases: ['mention', 'at'],
      keywords: ['mention', '提及', '@'],
      richTextOnly: true,
      menuSection: '小工具',
      menuOrder: 1,
      menuAction: 'mention',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        getInsertMenuActions()?.openMention?.();
      },
    },
    {
      id: 'emoji-trigger',
      category: '段落',
      icon: createElement(JzEmojiIcon, { size: 18 }),
      title: '表情',
      description: '输入 : 唤起表情选择',
      aliases: ['emoji', 'bq'],
      keywords: ['emoji', '表情', 'smiley'],
      richTextOnly: true,
      menuSection: '布局和样式',
      menuOrder: 6,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent(':').run();
      },
    },
    {
      id: 'h1',
      category: '基础',
      icon: iconText('H₁'),
      title: '一级标题',
      description: aliasDesc('bt', 'h1') || '# 标题',
      aliases: ['bt', 'h1', 'biaoti'],
      keywords: ['heading 1', '标题', 'title'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      id: 'h2',
      category: '基础',
      icon: iconText('H₂'),
      title: '二级标题',
      description: aliasDesc('h2') || '## 标题',
      aliases: ['h2'],
      keywords: ['heading 2'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      id: 'h3',
      category: '基础',
      icon: iconText('H₃'),
      title: '三级标题',
      description: aliasDesc('h3') || '### 标题',
      aliases: ['h3'],
      keywords: ['heading 3'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      id: 'paragraph',
      category: '基础',
      icon: iconText('¶'),
      title: '正文',
      description: '清除标题/列表/引用块',
      aliases: ['zw'],
      keywords: ['paragraph', 'text', '正文', 'p'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      id: 'bullet-list',
      category: '列表',
      icon: iconText('•'),
      title: '无序列表',
      description: aliasDesc('lb') || '- 列表项',
      aliases: ['lb', 'wxlb'],
      keywords: ['ul', 'bullet', '无序'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: 'ordered-list',
      category: '列表',
      icon: iconText('1.'),
      title: '有序列表',
      description: aliasDesc('yxlb') || '1. 列表项',
      aliases: ['yxlb'],
      keywords: ['ol', 'ordered', '有序'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: 'task-list',
      category: '列表',
      icon: iconText('☐'),
      title: '任务列表',
      description: aliasDesc('rw', 'todo') || '[ ] 待办',
      aliases: ['rw', 'todo'],
      keywords: ['task', 'checkbox', '任务', '待办'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      id: 'quote',
      category: '段落',
      icon: createElement(JzQuoteIcon, { size: 18 }),
      title: '引用块',
      description: aliasDesc('yy') || '> 引用',
      aliases: ['yy', 'yinyong'],
      keywords: ['quote', 'blockquote', '引用'],
      menuSection: '布局和样式',
      menuOrder: 4,
      menuTitle: '引用',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      id: 'hr',
      category: '段落',
      icon: createElement(JzHrIcon, { size: 18 }),
      title: '分割线',
      description: aliasDesc('fgx') || '---',
      aliases: ['fgx'],
      keywords: ['hr', 'horizontal', 'rule', 'divider', '分割'],
      menuSection: '布局和样式',
      menuOrder: 5,
      menuTitle: '插入分割线',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      id: 'align-left',
      category: '对齐',
      icon: iconText('⇤'),
      title: '左对齐',
      description: 'Ctrl+Shift+L',
      keywords: ['align', 'left', '左', '对齐'],
      richTextOnly: true,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setTextAlign('left').run(),
    },
    {
      id: 'align-center',
      category: '对齐',
      icon: iconText('⇔'),
      title: '居中',
      description: 'Ctrl+Shift+E',
      keywords: ['align', 'center', '居中', '中', '对齐'],
      richTextOnly: true,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setTextAlign('center').run(),
    },
    {
      id: 'align-right',
      category: '对齐',
      icon: iconText('⇥'),
      title: '右对齐',
      description: 'Ctrl+Shift+R',
      keywords: ['align', 'right', '右', '对齐'],
      richTextOnly: true,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setTextAlign('right').run(),
    },
    {
      id: 'code-block',
      category: '代码 / 表格',
      icon: iconText('</>'),
      title: '代码块',
      description: aliasDesc('dmk', 'dm') || '```',
      aliases: ['dmk', 'dm', 'daimakuai'],
      keywords: ['code', 'pre', 'codeblock'],
      menuSection: '程序员专区',
      menuOrder: 1,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      id: 'table',
      category: '代码 / 表格',
      icon: createElement(JzTableIcon, { size: 18 }),
      title: '表格 3×3',
      description: aliasDesc('bg') || '带表头',
      aliases: ['bg', 'table', 'biaoge'],
      keywords: ['表格'],
      richTextOnly: true,
      menuSection: '基础',
      menuOrder: 2,
      menuGrid: true,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      id: 'mermaid-picker',
      category: '图表',
      icon: createElement(JzMermaidIcon, { size: 18 }),
      title: 'Mermaid 图表',
      description: aliasDesc('wbht', 'mermaid') || '选类型后插入',
      aliases: ['wbht', 'mermaid', 'tb', 'liuchengtu'],
      keywords: ['flowchart', 'diagram', '流程图', '图表', '文本绘图'],
      menuSection: '画板类',
      menuOrder: 2,
      menuTitle: 'Mermaid 图表',
      command: ({ editor, range }) =>
        insertCodeBlock(editor, range, 'mermaid', MERMAID_TEMPLATES.flowchart),
    },
    ...mermaidVariants.filter((c) => c.id !== 'mermaid-flowchart'),
    {
      id: 'plantuml-sequence',
      category: '图表',
      icon: createElement(JzUmlIcon, { size: 18 }),
      title: 'PlantUML · 时序图',
      description: aliasDesc('uml', 'puml') || '@startuml',
      aliases: ['uml', 'puml', 'plantuml'],
      keywords: ['sequence', '时序', '图', 'uml'],
      menuSection: '程序员专区',
      menuOrder: 3,
      menuTitle: 'UML 图',
      command: ({ editor, range }) =>
        insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.sequence),
    },
    {
      id: 'plantuml-class',
      category: '图表',
      icon: createElement(JzUmlIcon, { size: 18 }),
      title: 'PlantUML · 类图',
      description: 'classDiagram',
      keywords: ['plantuml', 'class', '类图'],
      command: ({ editor, range }) =>
        insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.class),
    },
    {
      id: 'plantuml-usecase',
      category: '图表',
      icon: createElement(JzUmlIcon, { size: 18 }),
      title: 'PlantUML · 用例图',
      description: 'usecase',
      keywords: ['plantuml', 'usecase', '用例'],
      command: ({ editor, range }) =>
        insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.usecase),
    },
    {
      id: 'plantuml-component',
      category: '图表',
      icon: createElement(JzUmlIcon, { size: 18 }),
      title: 'PlantUML · 组件图',
      description: 'component / 架构',
      keywords: ['plantuml', 'component', '组件', '架构'],
      command: ({ editor, range }) =>
        insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.component),
    },
    {
      id: 'video',
      category: '媒体',
      icon: createElement(JzVideoIcon, { size: 18 }),
      title: '嵌入视频',
      description: aliasDesc('sp', 'video') || 'Bilibili · YouTube',
      aliases: ['sp', 'video', 'shipin'],
      keywords: ['bilibili', 'youtube', '视频', '嵌入', 'b站'],
      richTextOnly: true,
      menuSection: '小工具',
      menuOrder: 4,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: 'videoEmbed',
            attrs: { src: '', platform: 'other', videoId: '', title: '' },
          })
          .run(),
    },
    {
      id: 'callout-tips',
      category: '色块',
      icon: createElement(JzCalloutIcon, { size: 18 }),
      title: '提示色块',
      description: aliasDesc('glk', 'gl') || ':::tips',
      aliases: ['glk', 'gl', 'gaoliang'],
      keywords: ['callout', 'tip', 'tips', '提示', '色块', '高亮'],
      menuSection: '基础',
      menuOrder: 4,
      menuGrid: true,
      menuTitle: '高亮块',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCallout({ kind: 'tips' }).run(),
    },
    {
      id: 'callout-info',
      category: '色块',
      icon: createElement(JzCalloutIcon, { size: 18 }),
      title: '说明色块',
      description: aliasDesc('info', 'sm') || ':::info',
      aliases: ['info', 'sm', 'shuoming'],
      keywords: ['callout', '说明', '色块'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCallout({ kind: 'info' }).run(),
    },
    {
      id: 'callout-warning',
      category: '色块',
      icon: createElement(JzCalloutIcon, { size: 18 }),
      title: '警告色块',
      description: aliasDesc('warn', 'jg') || ':::warning',
      aliases: ['warn', 'jg', 'jinggao'],
      keywords: ['callout', 'warning', '警告', '色块'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCallout({ kind: 'warning' }).run(),
    },
    {
      id: 'callout-danger',
      category: '色块',
      icon: createElement(JzCalloutIcon, { size: 18 }),
      title: '危险色块',
      description: ':::danger',
      aliases: ['wx'],
      keywords: ['callout', 'danger', '危险', '色块'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCallout({ kind: 'danger' }).run(),
    },
    {
      id: 'callout-success',
      category: '色块',
      icon: createElement(JzCalloutIcon, { size: 18 }),
      title: '成功色块',
      description: ':::success',
      keywords: ['callout', 'success', '成功', '色块'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCallout({ kind: 'success' }).run(),
    },
    {
      id: 'callout-color2',
      category: '色块',
      icon: createElement(JzCalloutIcon, { size: 18 }),
      title: '类比讲解 (紫)',
      description: ':::color2',
      keywords: ['callout', '类比', '紫色', 'color2'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCallout({ kind: 'color2' }).run(),
    },
    {
      id: 'callout-color1',
      category: '色块',
      icon: createElement(JzCalloutIcon, { size: 18 }),
      title: '专业术语 (蓝)',
      description: ':::color1',
      keywords: ['callout', '术语', '蓝色', 'color1'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCallout({ kind: 'color1' }).run(),
    },
    {
      id: 'math-block',
      category: '数学',
      icon: createElement(JzMathIcon, { size: 18 }),
      title: '公式（块级）',
      description: aliasDesc('gs', 'gsk') || '$$ ... $$',
      aliases: ['gs', 'gsk', 'gongshi'],
      keywords: ['math', '公式', 'latex', 'katex'],
      richTextOnly: true,
      menuSection: '程序员专区',
      menuOrder: 2,
      menuTitle: '公式',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertMathBlock('').run(),
    },
    {
      id: 'math-inline',
      category: '数学',
      icon: iconText('f(x)'),
      title: '公式（行内）',
      description: '$...$',
      keywords: ['math', '公式', 'inline', 'latex'],
      richTextOnly: true,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertMathInline('x').run(),
    },
    {
      id: 'toc',
      category: '结构',
      icon: iconText('TOC'),
      title: '目录',
      description: aliasDesc('toc', 'ml') || '自动汇总标题',
      aliases: ['toc', 'ml', 'mulu'],
      keywords: ['table of contents', '目录', '大纲'],
      richTextOnly: true,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertToc().run(),
    },
    {
      id: 'details',
      category: '结构',
      icon: createElement(JzDetailsIcon, { size: 18 }),
      title: '折叠块',
      description: aliasDesc('zdk', 'zkb') || ':::details',
      aliases: ['zdk', 'zkb', 'details', 'zhedie'],
      keywords: ['折叠', 'toggle', 'collapse'],
      richTextOnly: true,
      menuSection: '布局和样式',
      menuOrder: 1,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertDetails('详细内容').run(),
    },
    {
      id: 'columns-2',
      category: '结构',
      icon: createElement(JzColumns2Icon, { size: 18 }),
      title: '双栏布局',
      description: aliasDesc('fl', 'sk') || '左右并排',
      aliases: ['fl', 'sk', 'fenlan'],
      keywords: ['columns', '分栏', '两栏'],
      richTextOnly: true,
      menuSection: '布局和样式',
      menuOrder: 2,
      menuTitle: '分栏卡片',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertColumns(2).run(),
    },
    {
      id: 'columns-3',
      category: '结构',
      icon: createElement(JzColumns3Icon, { size: 18 }),
      title: '三栏布局',
      description: aliasDesc('fl3') || '三栏并排',
      aliases: ['fl3'],
      keywords: ['columns', '分栏', '三栏', '3col'],
      richTextOnly: true,
      menuSection: '布局和样式',
      menuOrder: 3,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertColumns(3).run(),
    },
    {
      id: 'tabs',
      category: '结构',
      icon: createElement(JzTabsIcon, { size: 18 }),
      title: '标签页',
      description: 'Tabs / 标签卡',
      keywords: ['tabs', '标签页', 'tab'],
      richTextOnly: true,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertTabs(2).run(),
    },
    {
      id: 'doc-card',
      category: '结构',
      icon: createElement(JzDocCardIcon, { size: 18 }),
      title: '文档卡片',
      description: aliasDesc('yq', 'jz') || '嵌入其他文档预览',
      aliases: ['yq', 'jz'],
      keywords: ['doc-card', '文档卡', 'embed', 'card', '简斋'],
      richTextOnly: true,
      menuSection: '小工具',
      menuOrder: 2,
      menuTitle: '简斋文档',
      command: ({ editor, range }) => {
        const raw = window.prompt('要嵌入哪个文档的 ID？');
        const id = Number(raw);
        if (!id) return;
        editor.chain().focus().deleteRange(range).insertDocCard(id).run();
      },
    },
    {
      id: 'footnote',
      category: '结构',
      icon: iconText('注'),
      title: '脚注',
      description: '上标编号 + 弹窗',
      keywords: ['footnote', '脚注', '注释'],
      richTextOnly: true,
      command: ({ editor, range }) => {
        const text = window.prompt('脚注内容：');
        if (!text?.trim()) return;
        editor.chain().focus().deleteRange(range).insertFootnote(text.trim()).run();
      },
    },
    {
      id: 'link-card',
      category: '结构',
      icon: createElement(JzLinkCardIcon, { size: 18 }),
      title: '外部链接卡片',
      description: aliasDesc('lj') || '粘贴 URL 生成预览卡',
      aliases: ['lj'],
      keywords: ['link', 'card', '外链', 'og', 'preview', '链接'],
      richTextOnly: true,
      menuSection: '小工具',
      menuOrder: 3,
      command: ({ editor, range }) => {
        const url = window.prompt('输入 URL（http:// 或 https://）：');
        if (!url || !/^https?:\/\//.test(url.trim())) return;
        editor.chain().focus().deleteRange(range).insertLinkCard(url.trim()).run();
      },
    },
    {
      id: 'ai',
      category: 'AI',
      icon: createElement(JzAiSparkIcon, { size: 18 }),
      title: 'AI 生成段落',
      description: aliasDesc('ai', 'aizs') || '描述你想写什么',
      aliases: ['ai', 'aizs'],
      keywords: ['gpt', '生成', 'claude', 'assist', '写作'],
      richTextOnly: true,
      menuSection: '智能专区',
      menuOrder: 1,
      menuTitle: 'AI 写作助手',
      menuAction: 'ai',
      command: async ({ editor, range }) => {
        const prompt = window.prompt('描述要生成的内容');
        if (!prompt?.trim()) return;
        editor.chain().focus().deleteRange(range).run();
        try {
          const model = await getResolvedAIModelId();
          const text = await runAI('outline', prompt, {
            extra: '直接生成正文，而非大纲',
            model,
          });
          editor.chain().focus().insertContent(text).run();
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'AI 调用失败');
        }
      },
    },
  ];
}

export function resetSlashCommandsCache(): void {
  cachedCommands = null;
}

let cachedCommands: SlashCommandItem[] | null = null;

export function getSlashCommands(): SlashCommandItem[] {
  if (!cachedCommands) cachedCommands = buildSlashCommands();
  return cachedCommands;
}

/** Score for sorting: higher = better match. */
export function matchSlashScore(item: SlashCommandItem, q: string): number {
  const aliases = (item.aliases ?? []).map((a) => a.toLowerCase());
  if (aliases.some((a) => a === q)) return 100;
  if (aliases.some((a) => a.startsWith(q))) return 80;
  if (item.id.toLowerCase().startsWith(q)) return 70;
  const hay = [
    item.title,
    item.description ?? '',
    item.category,
    ...(item.aliases ?? []),
    ...(item.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase();
  if (hay.includes(q)) return 50;
  return 0;
}

/** Filter slash commands — alias prefix match prioritized (Yuque `/dmk` style). */
export function filterSlashCommands(query: string, commands = getSlashCommands()): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands
    .map((c) => ({ c, score: matchSlashScore(c, q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ c }) => c);
}

export function primaryAlias(item: SlashCommandItem): string | undefined {
  return item.aliases?.[0];
}

export function detectMermaidKeyFromSource(source: string): MermaidTemplateKey | null {
  const trimmed = source.trim();
  for (const key of Object.keys(MERMAID_TEMPLATES) as MermaidTemplateKey[]) {
    const head = MERMAID_TEMPLATES[key].split('\n')[0]?.trim() ?? '';
    if (trimmed.startsWith(head)) return key;
  }
  if (trimmed.includes('sequenceDiagram')) return 'sequence';
  if (trimmed.includes('classDiagram')) return 'class';
  if (trimmed.includes('stateDiagram')) return 'state';
  if (trimmed.includes('gantt')) return 'gantt';
  if (trimmed.includes('graph ')) return 'flowchart';
  return null;
}

export function formatSlashDescription(item: SlashCommandItem): string {
  const alias = primaryAlias(item);
  const base = item.description ?? '';
  if (alias && !base.startsWith('/')) {
    return base ? `/${alias} · ${base}` : `/${alias}`;
  }
  return base;
}
