import { Editor, Extension, Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import SlashCommandList, { type SlashCommandListRef } from './SlashCommandList';
import { runAI } from '@/api/ai';
import { message } from '@/utils/notify';

export interface SlashCommandItem {
  /** Section header shown above the item when no search query is active. */
  category: string;
  /** Short text or emoji to render as a glyph at the left of the row. */
  icon: string;
  title: string;
  description?: string;
  keywords?: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

/**
 * Mermaid 模板：每种图给一个最小可渲染样本，用户进来就能改字段而不是从空白开始。
 * Tiptap codeBlockLowlight 接收 language attr；CodeBlockEnhancer / 阅读端 markdown
 * 渲染器都会把 ``` mermaid 编译成 SVG。
 */
const MERMAID_TEMPLATES: Record<string, string> = {
  flowchart: `graph TD\n  A[开始] --> B{判断}\n  B -- 是 --> C[执行]\n  B -- 否 --> D[跳过]\n  C --> E[结束]\n  D --> E`,
  sequence: `sequenceDiagram\n  participant U as 用户\n  participant S as 服务\n  U->>S: 请求\n  S-->>U: 响应`,
  class: `classDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog\n  Animal <|-- Dog`,
  state: `stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: stop`,
  gantt: `gantt\n  title 项目排期\n  section 准备\n  设计 :a1, 2026-05-20, 3d\n  开发 :after a1, 5d`,
};

const SLASH_RECENT_KEY = 'jz-slash-recent';
const SLASH_RECENT_MAX = 5;

export function trackRecentSlashCommand(title: string): void {
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(SLASH_RECENT_KEY) ?? '[]');
    const next = [title, ...prev.filter((t) => t !== title)].slice(0, SLASH_RECENT_MAX);
    localStorage.setItem(SLASH_RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function getRecentSlashTitles(): string[] {
  try { return JSON.parse(localStorage.getItem(SLASH_RECENT_KEY) ?? '[]'); } catch { return []; }
}

const PLANTUML_TEMPLATES: Record<string, string> = {
  sequence: `@startuml\nactor 用户 as U\nparticipant "Web 服务" as W\nparticipant "数据库" as DB\nU -> W: HTTP 请求\nW -> DB: 查询\nDB --> W: 结果\nW --> U: 响应\n@enduml`,
  class: `@startuml\nclass Animal {\n  +String name\n  +eat()\n}\nclass Dog\nAnimal <|-- Dog\n@enduml`,
  usecase: `@startuml\nleft to right direction\nactor 读者\nactor 管理员\nrectangle 简斋 {\n  读者 --> (浏览博客)\n  读者 --> (订阅 RSS)\n  管理员 --> (编辑文档)\n  管理员 --> (发布)\n}\n@enduml`,
  component: `@startuml\npackage "前端" {\n  [React SPA] as SPA\n}\npackage "后端" {\n  [Django + DRF] as API\n  [Celery Worker] as W\n}\ndatabase PostgreSQL\nSPA --> API\nAPI --> PostgreSQL\nAPI --> W\nW --> PostgreSQL\n@enduml`,
};

function insertCodeBlock(
  editor: Editor,
  range: Range,
  language: string,
  template: string,
): void {
  editor
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

const COMMANDS: SlashCommandItem[] = [
  // ── 基础 ─────────────────────────────────────────────────────────────
  {
    category: '基础',
    icon: 'H₁',
    title: '一级标题',
    description: '# 标题',
    keywords: ['h1', 'heading 1', '标题', 'title'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    category: '基础',
    icon: 'H₂',
    title: '二级标题',
    description: '## 标题',
    keywords: ['h2', 'heading 2'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    category: '基础',
    icon: 'H₃',
    title: '三级标题',
    description: '### 标题',
    keywords: ['h3', 'heading 3'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    category: '基础',
    icon: '¶',
    title: '正文',
    description: '清除标题/列表/引用块',
    keywords: ['paragraph', 'text', '正文', 'p'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },

  // ── 列表 ─────────────────────────────────────────────────────────────
  {
    category: '列表',
    icon: '•',
    title: '无序列表',
    description: '- 列表项',
    keywords: ['ul', 'bullet', '无序'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    category: '列表',
    icon: '1.',
    title: '有序列表',
    description: '1. 列表项',
    keywords: ['ol', 'ordered', '有序'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    category: '列表',
    icon: '☐',
    title: '任务列表',
    description: '[ ] 待办',
    keywords: ['todo', 'task', 'checkbox', '任务', '待办'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },

  // ── 段落 ─────────────────────────────────────────────────────────────
  {
    category: '段落',
    icon: '❝',
    title: '引用块',
    description: '> 引用',
    keywords: ['quote', 'blockquote', '引用'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    category: '段落',
    icon: '⫯',
    title: '分割线',
    description: '---',
    keywords: ['hr', 'horizontal', 'rule', 'divider', '分割'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },

  // ── 对齐 ─────────────────────────────────────────────────────────────
  {
    category: '对齐',
    icon: '⇤',
    title: '左对齐',
    description: 'Ctrl+Shift+L',
    keywords: ['align', 'left', '左', '对齐'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setTextAlign('left').run(),
  },
  {
    category: '对齐',
    icon: '⇔',
    title: '居中',
    description: 'Ctrl+Shift+E',
    keywords: ['align', 'center', '居中', '中', '对齐'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setTextAlign('center').run(),
  },
  {
    category: '对齐',
    icon: '⇥',
    title: '右对齐',
    description: 'Ctrl+Shift+R',
    keywords: ['align', 'right', '右', '对齐'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setTextAlign('right').run(),
  },

  // ── 代码 / 表格 ──────────────────────────────────────────────────────
  {
    category: '代码 / 表格',
    icon: '</>',
    title: '代码块',
    description: '```',
    keywords: ['code', 'pre', 'codeblock'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    category: '代码 / 表格',
    icon: '⊞',
    title: '表格 3×3',
    description: '带表头',
    keywords: ['table', '表格'],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },

  // ── 图表 (Mermaid) ─────────────────────────────────────────────────
  {
    category: '图表',
    icon: '⤳',
    title: 'Mermaid · 流程图',
    description: 'graph TD',
    keywords: ['mermaid', 'flowchart', '流程', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'mermaid', MERMAID_TEMPLATES.flowchart),
  },
  {
    category: '图表',
    icon: '⤳',
    title: 'Mermaid · 时序图',
    description: 'sequenceDiagram',
    keywords: ['mermaid', 'sequence', '时序', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'mermaid', MERMAID_TEMPLATES.sequence),
  },
  {
    category: '图表',
    icon: '⤳',
    title: 'Mermaid · 类图',
    description: 'classDiagram',
    keywords: ['mermaid', 'class', '类图', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'mermaid', MERMAID_TEMPLATES.class),
  },
  {
    category: '图表',
    icon: '⤳',
    title: 'Mermaid · 状态图',
    description: 'stateDiagram',
    keywords: ['mermaid', 'state', '状态', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'mermaid', MERMAID_TEMPLATES.state),
  },
  {
    category: '图表',
    icon: '⤳',
    title: 'Mermaid · 甘特图',
    description: 'gantt',
    keywords: ['mermaid', 'gantt', '甘特', '图', '排期'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'mermaid', MERMAID_TEMPLATES.gantt),
  },
  {
    category: '图表',
    icon: '◬',
    title: 'PlantUML · 时序图',
    description: '@startuml ... @enduml',
    keywords: ['plantuml', 'puml', 'sequence', '时序', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.sequence),
  },
  {
    category: '图表',
    icon: '◬',
    title: 'PlantUML · 类图',
    description: 'classDiagram',
    keywords: ['plantuml', 'puml', 'class', '类图', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.class),
  },
  {
    category: '图表',
    icon: '◬',
    title: 'PlantUML · 用例图',
    description: 'usecase',
    keywords: ['plantuml', 'puml', 'usecase', '用例', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.usecase),
  },
  {
    category: '图表',
    icon: '◬',
    title: 'PlantUML · 组件图',
    description: 'component / 架构',
    keywords: ['plantuml', 'puml', 'component', '组件', '架构', '图'],
    command: ({ editor, range }) =>
      insertCodeBlock(editor, range, 'plantuml', PLANTUML_TEMPLATES.component),
  },

  // ── 媒体 ─────────────────────────────────────────────────────────────
  {
    category: '媒体',
    icon: '▶',
    title: '嵌入视频',
    description: 'Bilibili · YouTube',
    keywords: ['video', 'bilibili', 'youtube', '视频', '嵌入', 'b站', 'bili', 'media'],
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'videoEmbed', attrs: { src: '', platform: 'other', videoId: '', title: '' } })
        .run(),
  },

  // ── 色块 (Callouts) ─────────────────────────────────────────────────
  {
    category: '色块',
    icon: '💡',
    title: '提示色块',
    description: ':::tips',
    keywords: ['callout', 'tip', 'tips', '提示', '色块'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCallout({ kind: 'tips' }).run(),
  },
  {
    category: '色块',
    icon: 'ⓘ',
    title: '说明色块',
    description: ':::info',
    keywords: ['callout', 'info', '说明', '色块'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCallout({ kind: 'info' }).run(),
  },
  {
    category: '色块',
    icon: '⚠',
    title: '警告色块',
    description: ':::warning',
    keywords: ['callout', 'warning', 'warn', '警告', '色块'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCallout({ kind: 'warning' }).run(),
  },
  {
    category: '色块',
    icon: '✕',
    title: '危险色块',
    description: ':::danger',
    keywords: ['callout', 'danger', 'error', '危险', '色块'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCallout({ kind: 'danger' }).run(),
  },
  {
    category: '色块',
    icon: '✓',
    title: '成功色块',
    description: ':::success',
    keywords: ['callout', 'success', 'ok', '成功', '色块'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCallout({ kind: 'success' }).run(),
  },
  {
    category: '色块',
    icon: '🟪',
    title: '类比讲解 (紫)',
    description: ':::color2',
    keywords: ['callout', '类比', '紫色', 'color2', '色块'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCallout({ kind: 'color2' }).run(),
  },
  {
    category: '色块',
    icon: '🟦',
    title: '专业术语 (蓝)',
    description: ':::color1',
    keywords: ['callout', '术语', '蓝色', 'color1', '色块'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCallout({ kind: 'color1' }).run(),
  },
  // ── 数学 ─────────────────────────────────────────────────────────────
  {
    category: '数学',
    icon: '∑',
    title: '公式（块级）',
    description: '$$ ... $$',
    keywords: ['math', '公式', 'latex', 'katex', 'formula', 'equation'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertMathBlock('').run(),
  },
  {
    category: '数学',
    icon: 'f(x)',
    title: '公式（行内）',
    description: '$...$',
    keywords: ['math', '公式', 'inline', 'latex'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertMathInline('x').run(),
  },
  // ── 结构 ─────────────────────────────────────────────────────────────
  {
    category: '结构',
    icon: '📑',
    title: '目录',
    description: '自动汇总文档标题',
    keywords: ['toc', 'table of contents', '目录', '大纲'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertToc().run(),
  },
  {
    category: '结构',
    icon: '▾',
    title: '折叠块',
    description: ':::details Summary',
    keywords: ['details', '折叠', 'toggle', 'collapse'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertDetails('详细内容').run(),
  },
  {
    category: '结构',
    icon: '▥',
    title: '双栏布局',
    description: '左右并排',
    keywords: ['columns', '分栏', 'col', '两栏'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertColumns(2).run(),
  },
  {
    category: '结构',
    icon: '▦',
    title: '三栏布局',
    description: '三栏并排',
    keywords: ['columns', '分栏', '三栏', '3col'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertColumns(3).run(),
  },
  {
    category: '结构',
    icon: '🗂',
    title: '标签页',
    description: 'Tabs / 标签卡',
    keywords: ['tabs', '标签页', 'tab'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertTabs(2).run(),
  },
  {
    category: '结构',
    icon: '📎',
    title: '文档卡片',
    description: '嵌入其他文档预览',
    keywords: ['doc-card', '文档卡', 'embed', 'card', '引用'],
    command: ({ editor, range }) => {
      const raw = window.prompt('要嵌入哪个文档的 ID？（在该文档 URL 末尾可看到）');
      const id = Number(raw);
      if (!id) return;
      editor.chain().focus().deleteRange(range).insertDocCard(id).run();
    },
  },
  // ── AI ───────────────────────────────────────────────────────────────
  {
    category: 'AI',
    icon: '🤖',
    title: 'AI 生成段落',
    description: '描述你想写什么',
    keywords: ['ai', 'gpt', '生成', 'claude', 'assist'],
    command: async ({ editor, range }) => {
      const prompt = window.prompt('描述要生成的内容（如：写一段关于 React Server Components 的引言）');
      if (!prompt?.trim()) return;
      editor.chain().focus().deleteRange(range).run();
      try {
        const model = localStorage.getItem('jz-ai-model') || undefined;
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

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommandItem }) => {
          trackRecentSlashCommand(props.title);
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          const q = query.trim().toLowerCase();
          if (!q) return COMMANDS;
          return COMMANDS.filter((c) => {
            const hay = [c.title, c.description ?? '', c.category, ...(c.keywords ?? [])]
              .join(' ')
              .toLowerCase();
            return hay.includes(q);
          });
        },
        render: () => {
          let component: ReactRenderer<SlashCommandListRef> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandList, {
                props: { ...props, hasQuery: !!props.query },
                editor: props.editor,
              });
              if (!props.clientRect) return;
              popup = tippy(document.body, {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate(props) {
              component?.updateProps({ ...props, hasQuery: !!props.query });
              if (props.clientRect && popup) {
                popup.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
              }
            },
            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit() {
              popup?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
