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
| 色块 Callout | `:::kind 自定义标题`（标题经节点 `title` 属性 round-trip，2026-07-24 前重载即丢） | `CalloutExtension.ts` / `CalloutView.tsx` |
| 折叠块 | `:::details 标题` ↔ `<details>` | `DetailsBlock.ts` |
| 分栏 / 标签页 | `:::cols-2` / `:::tabs` | `Columns.ts` / `Tabs.ts` |
| 内联 TOC | `[TOC]`（全文）/ `[TOC:section]`（本节子树） | `InlineToc.ts` |
| 文档卡片 | `[[doc-card:ID]]` | `DocCardEmbed.tsx` |
| 链接卡片（网页） | `[[link-card:URL]]` | `LinkCardEmbed.tsx` |
| 链接气泡菜单 | 光标落在链接上 | `LinkBubbleMenu.tsx`（详见 §9） |
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

「编辑、阅读、导出三端共用一套 KaTeX」（2026-07-23 数学批次后为真实现状；此前导出端为孤儿 CSS 无实现）：

- **编辑器（Tiptap）**：InputRule 把 `$$..$$` 转 MathBlock、**行内打完 `$x$` 转 MathInline**（两条正则在纯模块 `editor/mathPatterns.ts`，输入/粘贴规则共享，货币/转义/`$$` 防误判）；双击 → Modal 可视化输入 + 实时预览；PasteRule 批量转节点
- **MD 编辑器（CM6）**：LivePreview 行内 `$..$` 就地 KaTeX（`pure/inlineMathScan.ts`，防货币与阅读端对齐）；块级 `$$` 保持源码（未做就地预览）
- **阅读端**：`markdown-it`（`utils/markdown.ts → katexPlugin`）—— block 规则 `$$..$$` displayMode；inline 规则 `$..$`（前不能跟数字，防 `$5`/`$10`）；`throwOnError: false` 错误降级红框；`tableMd` 实例同挂（表格内公式）
- **反斜杠定界符归一化**：`\(x\)` → `$x$`、`\[..\]` → `$$..$$`（ChatGPT/论文来源），前端 `normalizeLatexDelimiters`（`markdown.ts`，挂 `preprocessMarkdown` → 阅读/富文本载入/粘贴三路全覆盖）+ 后端 `markdown_preprocess.normalize_latex_delimiters` **镜像，改边界规则须两端同步**；块级锚定「`\[` 起行 `\]` 收行」避开 CommonMark 转义方括号，行内代码/代码围栏均有守卫
- **导出端**：`markdown_render.install_math_rules` 装数学 tokenizer（**escape 后、emphasis 前拦截**，否则公式里 `_`/`*`/`\` 被 CommonMark 吃掉）；`math_render.py` 与 `diagram_render` 同构——headless Chromium + vendored `static/vendor/katex/`（js+css+woff2，与前端同版本）把全 scope 公式批量预渲染为 KaTeX HTML（`collect_math_sources` → `build_scope_math_html` → env `math_html` 按 `_math_key` 查表），HTML/PDF/静态站离线可显；`katex_stylesheet()` woff2 字体 base64 内嵌（约 359KB，**仅含公式的导出才注入**）；Chromium 缺失降级为转义源码 span（`jz-math-source`，原文完好）；**docx 无 OMML（已知限制）**，公式以 Cambria Math run 保留 `$..$` 原文
- **搜索**：`collect_search_text` 入索引前先归一化定界符再整段剥除公式（LaTeX 命令碎片是噪声词元）

统一 CSS class：`.jz-math-block` / `.jz-math-inline` / `.jz-math-error`，全端一致。

> **坑**：后端 tokenizer 镜像前端 JS 时，行首公式曾全体失效——Python `"" in "0123456789"` 恒为 `True`（空串是任意串子串），行首 `prev=""` 被货币守卫误拒；空串必须先排除。凡把 JS 的 `/\d/.test(ch)` 译成 Python `ch in digits` 都要防这一手。

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
  - **CM6 源码**：`codemirror/extensions/headingNumber.ts` ViewPlugin widget（`Compartment` 开关）；`changeMayAffectNumbering` **变更门控**——普通打字只把既有装饰经 `changes` 平移，仅含换行/`#`/fence 字符或落在标题/fence 行的编辑才全文重建（此前每键 O(N) 重扫，开编号后大文档首要热点）。
  - **Tiptap 富文本**：`HeadingNumber.ts` ProseMirror 插件 node decoration（`data-jz-num` attr + CSS `::before`），`setHeadingNumbering` meta 命令切换、不重建编辑器。
  - **大纲 / 目录面板**：`DocumentOutline` / `TocPanel` 前缀编号。

### 目录生成（可跳转）

- **全文目录** `[TOC]`（沿用）+ **本节目录** `[TOC:section]`（只列所在标题的子树）。`InlineToc.ts` 加 `scope` attr；斜杠 `/目录`、`/本节目录` 双端可插（CM6 靠 `markdownSlashActions.ts` `MD_OVERRIDE_INSERTS`，富文本靠 `slashCommandRegistry.ts` `insertToc`/`insertSectionToc`）。
- **展开**：`markdown.ts` `expandTocPlaceholders` 位置感知——拦截 `html_block` 记录占位符在标题序列中的位置（`env._tocMarks`），section 取「紧邻在前标题」的子树，**复用 `heading_open` 已分配的锚点 id**（不重算 slug，避免去重后缀不一致）。

### 导入选项 + 导出端 + 内联编辑

- **导入**：上传下拉两复选框（章节编号 / 文首插入全文目录）→ `attachments.ts`/`uploadBatch.ts` 透传 → `editor/views.py` `_parse_import_options`（编号置字段；insert_toc 对 markdown 类在文首 prepend `[TOC]`，唯一文本改写）。
- **导出端对齐**：`exporter/services/markdown_render.py` 补齐 heading 锚点 + 编号栈 + `[TOC]`/`[TOC:section]` 展开（离线 HTML/PDF/静态站，读 `doc.heading_numbering`）。**坑**：markdown-it-py 的 `self.renderToken(tokens, idx, options, env)` 必须带 `env`（前端不用）；`common.py` 有两个 `render_markdown`（wrapper + 底层，都要接 `numbering`）。
- **普通编辑（内联 `PostInlineEditor`）**：博客内联「编辑」原只写 `raw_content`，但博客渲染 `published_content`（后端 `_apply_update` **故意不同步** raw→published）→ 内联插的目录/编辑上不了博客。修复 = `documentSave.ts` `patchDocumentBody` 一次 `updateDocument` **双写** `raw_content`+`published_content`（`_apply_update` 收两字段只 bump 一次 version）。

---

## 8. Office 文档导入 / 阅读（Word 一体化 + PPT 有道云式）

上传附件走 `editor/views.py`；`ALLOWED_UPLOAD_EXT` 含 `.doc/.docx/.ppt/.pptx/.pdf` 等。**OOXML（`.docx`/`.pptx`）是 zip 容器**，截断/半下载会破坏尾部中央目录 → `_is_valid_zip`（`zipfile.is_zipfile`）在入库前**前置校验**，坏文件直接 **400** 让用户重导出，不再入库后异步转换才失败（批次 B1）。

### Word 一体化保真导入（`.docx` → Markdown 阅读管线）

`services/docx_import.py`：

- **`convert_docx(blob)`** 用 **mammoth** 抽正文为 HTML→Markdown。**latent bug 修复**：mammoth 需 `BytesIO(blob)` 而非裸 bytes——历史上 docx 正文**从未真正被提取**（默默走空文档回退），改传 `BytesIO` 后表格/图片才落地。
- **标题结构恢复**：Word 常把标题存为 outline level 而非 `Heading N` 命名样式，导入前先注入 `HeadingN` 样式 id 让 mammoth 默认样式映射能识别。
- **图片保真**：`_handle_image` 把内嵌图（含 EMF/WMF 元文件，mammoth 光栅化为 png）收集为 `EmbeddedImage`；`materialize_docx_images(doc, images)` 落为文档附件并改写引用 → 最终以 **Markdown 阅读路径**渲染（表格/图片保真）。缺 mammoth 时正文留空并告警，不崩。
- **字体颜色保真**（`_mark_run_colors`）：**mammoth 会丢弃 run 级直接颜色格式**（`w:rPr/w:color`——非命名样式，样式映射管不到），故字体色历来全部丢失。修复=转换前在 **docx XML 层**遍历 `w:r`，把带显式颜色（非 `auto`、非近黑）的 run 文本包上 `jzcolor<hex>b…jzcolore` 哨兵（纯 alnum，mammoth/markdownify 当普通文本原样带过），最终 md（含回注的原生表格 HTML）再用正则换回 `<span style="color:#hex">`；表格单元格内的彩字同样保真。DOMPurify 放行 `span/style/color`。**导出端（docx/pdf）彩色仍为已知限制**。

### 语雀 MD 远程图（`cdn.nlark.com` 防盗链 + 异步并行镜像）

语雀导出的 `.md` 内嵌图是 `https://cdn.nlark.com/...` **远程 URL**（非 base64）。两个坑叠加致「图片解析不到」：

1. **防盗链**：`cdn.nlark.com` 对**带外域 `Referer`** 的请求返回 **403**（无 referer 才 200）——浏览器直连远程图必带 referer → 图裂。**修复=前端** `addImgLazyAttrs`（`utils/markdown.ts`）给每个 `<img>` 注入 `referrerpolicy="no-referrer"`，浏览器不发 referer → 远程图立即可显（本地 `/media` 图无害）。
2. **同步镜像超时**：`image_mirror.mirror_images_for_document` 历来在**上传请求内同步**下载并改写为 `/media`；但 CDN 按 IP 限流，40+ 张图串行（每张 5–15s）远超请求超时 → 镜像半途中断 → 图仍是远程 URL。**修复=改异步**：`editor/tasks.mirror_document_images` Celery 任务（`views._create_doc_from_upload` 里 `.delay()`，**仅当含需镜像的远程图才派发**——无图 note 不空转），镜像内部用 `ThreadPoolExecutor(_FETCH_CONCURRENCY=6)` 并行下载（实测 42 张 73s 全部落地，串行 >200s 超时）。上传秒回，读者先看远程图（referrerpolicy 兜底）、任务完成后刷新即本地图（持久 + 离线可用，规避语雀 URL 过期/限流）。

> 编辑器内保存（`DocumentSerializer.update`）的镜像仍**同步**——那是低频、通常 0 张新外链的路径，且前端 referrerpolicy 已保证渲染，故未改。

### 语雀 MD 图表注释还原 + 强调正则 CJK 误伤（2026-07-19）

语雀把 mermaid 图导出为 **HTML 注释包源码 + 静态 SVG 图片**：

```
<!-- 这是一个文本绘图，源码为：flowchart LR
    A --> B -->
![](https://cdn.nlark.com/.../xxx.svg)
```

三个渲染层 bug（前端 `utils/markdown.ts`；后端导出镜像 `exporter/services/markdown_preprocess.py`）：

1. **图表注释被 `-->` 截断（主凶）**：`preprocessMarkdown` 首步懒惰正则 `<!--[\s\S]*?-->` 在源码**内部箭头** ` --> ` 处提前截断 → 剩余源码（`classDef`、`:::jam` 等）泄漏成正文，`:::jam` 再被 `unglueContainerFences` 拆行触发**失控 callout 吞掉后文**。修复=`recoverYuqueDiagramComments`（后端 `recover_yuque_diagram_comments` 镜像）：闭合锚定「`-->` + 行尾」（flowchart 箭头后同行必有目标、真闭合必在行尾），把注释**还原成 ```` ```mermaid ```` fence**（`@startuml` 开头则 plantuml）并丢弃静态 SVG——阅读端原生渲染（主题跟随/全屏/源码切换），导出端走既有离线 SVG 管线；**必须在通用注释剥离之前运行**。docx 导出降级为源码面板（已知低保真目标）。
2. **`<font>` 交替模式误合并**：语雀「整句染色+局部加粗」= `<font>文</font>**<font>词</font>**<font>文</font>…`；`normalizeYuqueEmphasis` 步骤 (0)（拆分加粗绕行内标签合并）的 A/B 连接符原为 `[^*\n]+?`（允许 `<`），把整个染色 span 当拆分两半合并 → 整句全粗。修复=收紧为 `[^*\n<]+?`（真实拆分模式两侧是纯文本）。
3. **CJK 双加粗吞并**：已删除的步骤 (1)（`**A**B**C**`→`**ABC**` 合并启发式）——无空格连接符与 `\w` lookaround 两道防线在中文全失效（中文无空格、CJK 不算 `\w`），任何含两个加粗的中文句子被吞并成巨型加粗，或错配「上一加粗闭合+下一加粗开启」**静默删除**加粗标记（表格单元格触发）。`**A**B**C**` 本是合法 CommonMark；后端 `normalize_yuque_emphasis` 从无此步骤，删除后前后端对齐。

> 改 `applyYuqueCompatMode` 任何正则，回归须过三类用例：CJK 标点连接双加粗、font 交替染色句、含 ` --> ` 的图表注释（`markdown.preprocess.test.ts` + 后端 `test_markdown_preprocess.py` 已钉住）。

### PPT 有道云式阅读器（`.pptx` → 逐页图 + 缩略图 + 讲者备注）

**转换管线**（`editor/tasks.convert_pptx_to_slides`，Celery 异步，需 `libreoffice`(soffice) + `poppler-utils`(pdftoppm) 在 PATH）：

1. `soffice --headless --convert-to pdf` 转 PDF（soffice 加载坏源仍退 0，故靠 B1 前置拦截）；
2. `pdftoppm -jpeg -jpegopt quality=82` 逐页光栅化为 **JPEG**（非 PNG——94 页 deck 从 ~24MB 降到几 MB，批次 3fa9ba9），每页额外生成 **~320px 导轨缩略图**（`SlideImage.thumbnail`，缩略图轨用它、主图才用全分辨率，避免每个缩略图都拉全图致 850MB 解码）；
3. `extract_pptx_notes(pptx_path)` 用 **python-pptx** 抽讲者备注（`slide.notes_slide.notes_text_frame`），**best-effort**：失败不拖垮转换，按 `index` 与渲染页对齐（隐藏页漂移则该页留空、不越界）。

**数据模型** `SlideImage`（`unique_together (document, index)` 使重转幂等，`ordering = ["index"]`）：`index`(0-based 稳定序) / `image`(全分辨率 JPEG) / `thumbnail`(320px，legacy 行空 → `thumb_url` 回退全图) / `notes`(TextField，无备注/legacy 行为空)。`as_dict()` 带出 `notes`，blog + knowledge 两序列化器自动生效。

**转换状态可见**（批次 B2）：`Document.slide_status`(pending/failed…) + `slide_error`（迁移 `knowledge 0009`）持久化转换态，`_set_slide_state` 写入、`_failure_reason` 把异常翻成人话（须匹配 `pdftoppm` 的 JPEG 输出串，勿留 “no PNG” 死分支）。前端 `PptxReader` 据此区分 pending/failed、显示真实原因、**失败即停轮询**（详见 [frontend.md §5](./frontend.md#5-博客阅读器体验)）。

**存量维护命令**：`manage.py reconvert_pptx`（回填旧 PNG/无缩略图 deck，重新光栅化）；`manage.py backfill_pptx_notes [--all]`（**只读源文件补 `notes`、不重新光栅化**，回填备注上线前转好的 deck）。

**部署**：线上镜像须含 `libreoffice` + `poppler-utils`（系统包）+ `python-pptx`（新依赖）；改依赖后需重建镜像 + `migrate` + `backfill_pptx_notes --all` 才有备注。

---

## 9. 语雀式链接三形态（2026-07-20）

链接可在三种显示形态间切换：**链接**（URL 原文）｜**标题**（目标页/文档标题文字，**默认**）｜**卡片**（`DocCardEmbed`/`LinkCardEmbed` 块节点），另有 **打开文档**（仅内部 `doc:` 链接，站内路由）与 **浏览器访问**（新标签）两动作。序列化格式零变更：`[URL](URL)` / `[标题](doc:ID)`（仍匹配 `MENTION_RE`，双向链接提取不受影响）/ 既有 `[[…]]` 占位符。

**共享工具** `utils/linkModes.ts`：`classifyHref`（`doc:ID` / `/d/ID` / 站内绝对地址 / 外链 / other）、`canonicalHref`（站内归一化 `doc:ID`）、`isBareUrlText`（模式判定启发式：显示文本本身是裸 URL ⇔ 链接模式，**无 mark 属性**——tiptap-markdown 序列化纯 `[text](url)`，属性活不过存盘往返）、`fetchTitleForHref`（doc→preview 接口 / 外链→link-preview OG，5s 超时全捕获返 null）。

- **Tiptap**：`LinkBubbleMenu.tsx` = 第二个 `BubbleMenu` 实例（`pluginKey: 'linkBubbleMenu'`，格式气泡在 `isActive('link')` 时让位）；`linkAutoTitle.ts` = `LinkPasteAutoTitle`（handlePaste 拦**空选区+单裸 URL** 粘贴，先插 `[URL](URL)` 再异步取标题；有选区放行给 extension-link 的 linkOnPaste）+ `applyAutoTitle`/`replaceLinkText`（**href+旧文本双匹配守卫**：取标题期间用户改过文字则匹配失败绝不覆盖，无需 transaction mapping）；`confirmLink` 空光标确认也走自动标题。卡片右上角 hover 胶囊菜单（`.jz-card-mode-menu`）回转行内链接/标题。
- **CM6**：`codemirror/pure/linkAt.ts` 纯函数（`findLinkAt` 行内定位、`linkToPlain/Title/Card`；卡片须整行——独占行原地替换、行内则移到下一行，mention 的 `@` 前缀经 `atFrom` 一并吞掉）+ `LinkFloatingMenu.tsx`（FloatingFormatToolbar 同款 portal）；`handleCmUpdate` 空选区检测（表格浮条优先、fence/行内代码经 `syntaxTree` 排除），命令派发前重新 `findLinkAt` 校验 href 未变。
- **阅读端 / 导出端**：见 [frontend.md §5](./frontend.md)（CardEnhancer 水合）与 [export-search.md §2](./export-search.md)（card_placeholders 零泄漏）。

> ⚠️ **Tiptap v3 两坑**（本批实测踩中，勿复犯）：
> 1. **Link 扩展协议白名单**（`isAllowedUri`，默认 http/https/mailto…）**拒收 `doc:`** → markdown 重载时 `[标题](doc:ID)` 的 link mark 被**静默剥成纯文本**（存量 bug：mention 行内链接在富文本模式一直坏着）。修=`Link.configure({ protocols: ['doc'] })`；新增内部协议须同步此白名单。
> 2. **`useEditor` 默认不随 transaction 重渲**：组件 render 里直接 `editor.isActive()/getAttributes()` 拿到**陈旧快照**（菜单激活态/按钮显隐全错）。任何依赖 editor 实时状态的 React UI 一律走 `useEditorState({ editor, selector })` 订阅。
