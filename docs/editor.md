# 简斋 · 编辑器与图表

> 三种编辑器、20+ 自定义 Tiptap 节点、KaTeX / Mermaid / PlantUML 全链路。
> 架构见 [architecture.md](./architecture.md)。

---

## 1. 三种编辑器模式

| 模式 | React 组件 | 内核 | 持久化 |
|------|-----------|------|--------|
| 富文本 | `RichTextEditor.tsx` | Tiptap 3（ProseMirror） | 经 `tiptap-markdown` 转 Markdown 入 `raw_content` |
| Markdown | `MarkdownEditor.tsx` | **CodeMirror 6** | 直接编辑 Markdown 源码 |
| HTML | `HtmlEditor.tsx` | textarea | 源码 + 200ms 防抖预览；发布版可为完整 HTML 文档 |

`EditorSurface`（`components/editor/surface/EditorSurface.ts`）适配层统一 MD(CM)/HTML(textarea) 的 seek/选区/查找接口，`DocEditorPage` 与 `FindReplacePanel` 不直接摸 textarea。CM 受控策略 = 回声跳过 + 外部更新最小 diff（保 undo）；CM6 主题纯 CSS 变量（`--jz-*`）四主题零订阅跟随。

---

## 2. MD 源码模式（CodeMirror 6，语雀级）

- 语法高亮 + 行号 + 当前行；选区浮动格式条（B/I/S/code/U/链接/清除格式 + 文字颜色，操作后保持可连续叠加）
- 快捷键 Ctrl+B/I/E/K、Ctrl+Shift+X；回车续列表（-/1./>/任务复位/有序自增）+ 空项退出 + Tab/Shift+Tab 缩进
- **表格辅助**：Tab 跳格选内容 / 末格自动加行 / 回车加行（仅完整表格的数据行劫持按键，半成品/粘贴不干扰）；工具栏「表格 ▾」CJK 宽度对齐格式化 + 行列增删
- 数学可视化 Modal（`MathEditorModal` 与富文本共享）；分栏/tabs/doc-card/footnote 可直接插 MD 源码（`isMarkdownCapable` 判定）
- @ 不吞键（字面 @ 落档，邮箱/@media 转义出口）；斜杠菜单 caret 级定位（coordsAtPos）；Ctrl+/ 快捷键速查
- **行级双向滚动同步**：markdown-it 注入 data-line 锚点（仅编辑器 env）+ 原文↔预处理 lineMap（唯一行锚点 + LIS + 分段插值）；预览统一 `LivePreviewPane`

### MD Live Preview（Typora/Obsidian 式就地渲染，可开关）

`codemirror/extensions/livePreview.ts`：光标外隐藏 `**`/`*`/`~~`/`` ` ``/`#`/`[]()` 标记符（样式由 HighlightStyle 呈现）、`![]()` 就地缩略图（404 降级源码）、`$..$` 就地 KaTeX（`scanInlineMath` 防货币误识）、链接 Ctrl+点击打开。**当前行整行显源码**策略根除 IME 冲突；Compartment 开关 = 工具栏眼睛按钮 + localStorage `jz-md-livepreview`（默认开）。

---

## 3. 自定义节点 / 扩展速查

| 节点 | Markdown 语法 / 触发 | 实现文件 |
|------|----------------------|----------|
| 数学公式块 | `$$expr$$`（多行也支持） | `MathNode.tsx` |
| 数学公式行内 | `$expr$`（防 currency 误识） | `MathNode.tsx` |
| 折叠块 | `:::details 标题` ↔ `<details>` | `DetailsBlock.ts` |
| 分栏 / 标签页 | `:::cols-2` / `:::tabs` | `Columns.ts` / `Tabs.ts` |
| 内联 TOC | `[TOC]`（全文）/ `[TOC:section]`（本节子树） | `InlineToc.ts` |
| 文档卡片 | `[[doc-card:ID]]` | `DocCardEmbed.tsx` |
| 缩进 / 字号 / 字体 | Tab、工具栏下拉 | `Indent.ts` / `FontSize.ts` / `FontFamily.ts` |
| 上下标 | `^x^` / `~x~` | tiptap 内置 |
| 批注 Mark | hover tooltip | `AnnotationMark.tsx` |
| 代码块增强 | ```` ```js title="" ```` | `CodeBlockView.tsx` |
| Mermaid / PlantUML | ```` ```mermaid ```` / ```` ```plantuml ```` | `CodeBlockView.tsx` |
| 图片 | `![](url)` + 悬浮工具栏（旋转/缩放/对齐/裁剪/说明） | `ResizableImage.tsx` |
| 视频嵌入 | B 站 / YouTube URL | `VideoEmbed.tsx` |
| 块 hover 菜单 | 左侧 `+ / ⋯`（删除/复制/选中） | `BlockHoverMenu.tsx` |
| 块拖拽 | 抓 handle 拖动 | `tiptap-extension-global-drag-handle` |
| `@` 提及 | `@文档名` 跨库引用 | `MentionPicker.tsx` |
| 斜杠命令 | `/`（AI/数学/结构/图表分组） | `slashCommandRegistry.tsx` |

编辑辅助：查找替换 `FindReplacePanel`（Ctrl+F）、文档大纲面板（sticky 可固定）、全屏/沉浸模式（body 加 `jz-fullscreen-active` 隐藏 AdminLayout）。

---

## 4. 富文本表格（语雀级）

- **单元格底色/文字色**：`ColorTableCell/Header`，CellSelection 批量染色
- **表级属性**：`maxRows`（最多显示行数 → 限高滚动）/ `density`（紧凑/标准/宽松）/ `cellPadV/cellPadH`（自定义行/列间距）
- **条件序列化**（`ColorTable`）：带色/带表级样式/不可 GFM 的表 → 输出**原生 HTML**（含 `.jz-table-wrap` + `data-jz-*` + CSS 变量），无色无样式表保持**干净 GFM 管道**；roundtrip 经 parseHTML 复原
- **统一工具条**（`TableOverlay`）：caret 在表内时表格上方弹出（结构/样式/删除三组）；z 分层 grip/±1100 < 工具条 1200 < 下拉 12000；BubbleMenu 表格分支已退役
- **悬浮交互**：悬停出右缘+列/下缘+行按钮、列/行 grip（单击选整行列 / 拖动重排，prosemirror-tables 1.8 自带 `moveTableRow/Column`）；整表全选 `selectTableAll`
- **冻结首行/首列**：编辑器 / 阅读 / 导出三端 sticky

> **关键坑**：resizable 表格用 prosemirror-tables 的 `TableView` nodeView（只拷 `style` attr），**绕过 `ColorTable.renderHTML`** → 表级 `data-jz-*`/CSS 变量进不了编辑器 DOM；由 `TableMaxRows` 扩展（同步遍历 doc table 经 `nodeDOM` 写 DOM）+ 阅读端 `TableEnhancer` 补齐；密度预设走 `table[data-jz-density]` CSS 属性选择器（规避 DOMPurify 剥 CSS 变量）；**docx 导出彩色/间距丢失为已知限制**。

---

## 5. KaTeX 全链路

「编辑、阅读、导出三端共用一套 KaTeX」：

- **编辑器**：Tiptap InputRule 把 `$$..$$` 转 MathBlock；双击 → Modal 可视化输入 + 实时预览；PasteRule 同样转节点
- **阅读端**：`markdown-it`（`utils/markdown.ts → katexPlugin`）—— block 规则 `$$..$$` displayMode；inline 规则 `$..$`（前不能跟数字，防 `$5`/`$10`）；`throwOnError: false` 错误降级红框
- **导出端**：`exporter/services/common.py` 内嵌 KaTeX HTML + 样式（base64 字体），离线可显示

统一 CSS class：`.jz-math-block` / `.jz-math-inline` / `.jz-math-error`，三端一致。

---

## 6. Mermaid / PlantUML

### 渲染管线

- **Mermaid**：动态 `import('mermaid')` ~600KB（首次使用才加载）；编辑器 `CodeBlockView` 渲染 SVG，博客端 `CodeBlockEnhancer.hydrateMermaid`
- **PlantUML**：`encoder.encode(src)` → `/api` 代理到 plantuml.com SVG
- **per-block 配色**：代码块/图主题改为 per-block 节点属性（改一块不波及其他），可「同步样式到全文」；图表块**不参与**同步（保持独立）

### 三态切换（编辑器）

| 视图 | className | 行为 |
|------|-----------|------|
| 分栏 | `.jz-diagram-view-split` | 左源码右图 |
| 仅源码 | `.jz-diagram-view-source` | 隐藏预览 |
| 仅图表 | `.jz-diagram-view-preview` | 隐藏源码（语雀风默认） |

单击图表切回源码；偏好存 `localStorage['jz-diagram-prefs']`。

### 四主题适配

`utils/mermaid.ts → mermaidConfig(theme)`：把节点 surface 朝 accent 偏 8/14%、不透明 `edgeLabelBackground`；starry/deepsea 给 `.jz-diagram-block` 专属背景。

> **净化坑**：DOMPurify 剥 `foreignObject` 致流程图无字、剥 `dy` 似删除线 → `htmlLabels: false` + allowlist 补全 + 实时跟随四主题（订阅重水合）。

### 全屏 Modal

`utils/diagramFullscreen.ts`（编辑器 + 博客端共用）：滚轮缩放（0.2x~8x，锚定鼠标）、拖拽平移、键盘（Esc/0/+/-）、复制 SVG、下载 SVG/PNG（Canvas 2x 白底）。

### 离线导出为 SVG

导出 HTML/PDF/静态站时，`exporter/services/diagram_render.py` 用 headless Chromium + vendored `static/vendor/mermaid.min.js` 把 `` ```mermaid `` 块批量渲为**内联 SVG**（每次导出仅启动一次浏览器）；缺 Chromium/语法错误时降级「图表源码」面板。PlantUML 仍为源码面板。详见 [export-search.md](./export-search.md)。

---

## 7. 章节自动编号 + 目录生成（语雀式）

### 章节编号 = 显示层（不落盘）

序号**不写入** `raw_content`/`published_content`，源码保持干净 `## yy`；由渲染层实时计算前缀，增删标题自动重排。每篇文档独立开关 `Document.heading_numbering`（迁移 `knowledge 0008`）+ 编辑器工具栏「编号」Switch。

- **权威算法** `utils/headingNumber.ts`：`nextHeadingNumber`（增量步进）+ `computeHeadingNumbers`（批量），栈压缩——深度=祖先栈层数而非 markdown 原始级数，`h1→h2→h4` 得 `1 / 1.1 / 1.1.1`（跳过的 h3 不占位），`h1→h1` 得 `2`。**四端复用同一套**保证一致：
  - **阅读器**：`utils/markdown.ts` `heading_open` 规则 env 维护编号栈 → 注入 `<span class="jz-heading-num">` + `TocEntry.numbering`；`renderMarkdownWithToc(src, { numbering })` 的 **LRU 缓存 key 必须并入 numbering 标志**（否则开关切换命中脏缓存）。
  - **CM6 源码**：`codemirror/extensions/headingNumber.ts` ViewPlugin widget（`Compartment` 开关）。
  - **Tiptap 富文本**：`HeadingNumber.ts` ProseMirror 插件 node decoration（`data-jz-num` attr + CSS `::before`），`setHeadingNumbering` meta 命令切换、不重建编辑器。
  - **大纲 / 目录面板**：`DocumentOutline` / `TocPanel` 前缀编号。

### 目录生成（可跳转）

- **全文目录** `[TOC]`（沿用）+ **本节目录** `[TOC:section]`（只列所在标题的子树）。`InlineToc.ts` 加 `scope` attr；斜杠 `/目录`、`/本节目录` 双端可插（CM6 靠 `markdownSlashActions.ts` `MD_OVERRIDE_INSERTS`，富文本靠 `slashCommandRegistry.ts` `insertToc`/`insertSectionToc`）。
- **展开**：`markdown.ts` `expandTocPlaceholders` 位置感知——拦截 `html_block` 记录占位符在标题序列中的位置（`env._tocMarks`），section 取「紧邻在前标题」的子树，**复用 `heading_open` 已分配的锚点 id**（不重算 slug，避免去重后缀不一致）。

### 导入选项 + 导出端 + 内联编辑

- **导入**：上传下拉两复选框（章节编号 / 文首插入全文目录）→ `attachments.ts`/`uploadBatch.ts` 透传 → `editor/views.py` `_parse_import_options`（编号置字段；insert_toc 对 markdown 类在文首 prepend `[TOC]`，唯一文本改写）。
- **导出端对齐**：`exporter/services/markdown_render.py` 补齐 heading 锚点 + 编号栈 + `[TOC]`/`[TOC:section]` 展开（离线 HTML/PDF/静态站，读 `doc.heading_numbering`）。**坑**：markdown-it-py 的 `self.renderToken(tokens, idx, options, env)` 必须带 `env`（前端不用）；`common.py` 有两个 `render_markdown`（wrapper + 底层，都要接 `numbering`）。
- **普通编辑（内联 `PostInlineEditor`）**：博客内联「编辑」原只写 `raw_content`，但博客渲染 `published_content`（后端 `_apply_update` **故意不同步** raw→published）→ 内联插的目录/编辑上不了博客。修复 = `documentSave.ts` `patchDocumentBody` 一次 `updateDocument` **双写** `raw_content`+`published_content`（`_apply_update` 收两字段只 bump 一次 version）。
