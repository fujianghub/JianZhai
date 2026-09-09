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

> **note 内列表崩溃坑**（2026-09-01，doc 1043《Juniper RPM》样本）：`htmlLabels:false` 的代价——`stateDiagram` 的 `note … end note` 块内连续 `1.`/`2.`（或 `-`/`*`/`+`/`1)`）列表行被 marked 词法成**单个 list token**、文本保留内部换行；note 宽到需要自动折行时 `splitLineToFitWidth` 对含 `\n` 的行直接 throw，**整图不渲染**。Mermaid 上游 bug（11.15.0–11.17.2 实测均炸），触发条件「≥2 列表项 + 折行」，短列表从不炸；`markdownAutoWrap:false` 无效；Typora 等用默认 `htmlLabels:true` 走浏览器 HTML 折行故正常，但简斋不可改回（见上条净化坑）。修=渲染时预处理 `neutralizeNoteListMarkers`（`utils/mermaid.ts`，`renderMermaid` 收口）/ `neutralize_note_list_markers`（`diagram_render.py` 镜像，`svg_map` 仍按原始源码做 key）：在列表标记与定界符之间插 **U+2060 word joiner**（`1⁠.`）破坏 markdown 列表识别，渲染像素级无损、天然幂等；仅动 `note left/right of X` 块体行，行内 `note … : text`、块外内容、其它图类型不碰。**勿改用 markdown 转义 `1\.`**——mermaid 的 markdown-to-lines 会把被转义的定界符整个丢掉（渲染成「1 activate」缺点号）。存储 `raw_content` 不动，存量文档即刻生效。

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

### EPUB 电子书导入（原件阅读，2026-09-01 一期）

`.epub` 进 `ALLOWED_DOC_EXT` 与 `ZIP_DOC_EXT`（EPUB 也是 zip 容器，坏文件同样 400），`_create_doc_from_upload` 走专用分支：**正文留空**（与 PDF/PPT 同为「文件即文章」的二进制文档，`detect_doc_format` 按首附件 `.epub`/`application/epub+zip` 返回 `epub`），附件 `mime_type` 钉为 `application/epub+zip`（浏览器多以 `application/octet-stream` 上传）。

- **入库前净化**（`services/epub_sanitize.py`）：阅读器在同源 `blob:` iframe 渲染章节、iframe sandbox 挡不住脚本，所以文件本身必须干净——`validate_epub_container` 拒路径穿越（`..`/绝对路径/盘符）、条目数 > 20000、解压 > 1.5 GiB、单条目压缩比 > 200 且 > 1 MiB（压缩炸弹）、缺 `mimetype` 或非 `application/epub+zip`；`sanitize_epub` 对 `.xhtml/.html/.htm/.xml/.svg` 正则剥 `<script>`、`on*=` 属性、`javascript:` URL、`iframe/object/embed/applet`，整体丢 `.js` 条目并从 OPF 删对应 `<item>` 与 `properties="scripted"`。**干净文件字节原样存**（`out is blob`），只有动过才重写容器（`mimetype` 首位 STORED，其余保留原压缩方式）；重写会 `logger.warning`。
- 一期不转 Markdown：转文档（一本书 = 文件夹 + 索引页 + 按章多篇、CSS 语义归一化层、Celery 异步进度）是二期，见 `docs/CHANGELOG.md` 对应批次的路线说明。
- 前端白名单三处同步：`utils/uploadBatch.ts UPLOAD_ALLOWED_EXT`（`UPLOAD_ACCEPT` 自动跟随；`AttachmentPanel` 已改为引用它，消除历史上的硬编码副本）、`api/attachments.ts previewKind` 加 `epub`、`types DocFormat`/`DocFormatTag`/`PostInlineEditor.BINARY_INLINE`/`PostDetail.binaryFormats`/`DocEditorPage EditorMode` 各加 `epub`。阅读器见 [frontend.md §5 EPUB 阅读器](./frontend.md#epub-阅读器epubreadertsx--epubsidebartsxfoliate-js2026-09-01)。
- 测试：`apps/editor/tests/test_epub_import.py`（12 项：净化幂等/重写/OPF 清理、穿越/炸弹/mimetype 拒收、API 建档与格式识别、脏文件落盘已净化、坏 zip 400）。

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

四个兼容 bug（前端 `utils/markdown.ts`；后端导出镜像 `exporter/services/markdown_preprocess.py`；前三个为纯渲染层——存储 `raw_content` 干净，第 4 个会**写坏存储**）：

1. **图表注释被 `-->` 截断（主凶）**：`preprocessMarkdown` 首步懒惰正则 `<!--[\s\S]*?-->` 在源码**内部箭头** ` --> ` 处提前截断 → 剩余源码（`classDef`、`:::jam` 等）泄漏成正文，`:::jam` 再被 `unglueContainerFences` 拆行触发**失控 callout 吞掉后文**。修复=`recoverYuqueDiagramComments`（后端 `recover_yuque_diagram_comments` 镜像）：闭合锚定「`-->` + 行尾」（flowchart 箭头后同行必有目标、真闭合必在行尾），把注释**还原成 ```` ```mermaid ```` fence**（`@startuml` 开头则 plantuml）并丢弃静态 SVG——阅读端原生渲染（主题跟随/全屏/源码切换），导出端走既有离线 SVG 管线；**必须在通用注释剥离之前运行**。docx 导出以等宽源码段落呈现（fence 分支；2026-07-27 起 docx 也跑同套还原预处理，此前该注释整块蒸发）。
2. **`<font>` 交替模式误合并**：语雀「整句染色+局部加粗」= `<font>文</font>**<font>词</font>**<font>文</font>…`；`normalizeYuqueEmphasis` 步骤 (0)（拆分加粗绕行内标签合并）的 A/B 连接符原为 `[^*\n]+?`（允许 `<`），把整个染色 span 当拆分两半合并 → 整句全粗。修复=收紧为 `[^*\n<]+?`（真实拆分模式两侧是纯文本）。
3. **CJK 双加粗吞并**：已删除的步骤 (1)（`**A**B**C**`→`**ABC**` 合并启发式）——无空格连接符与 `\w` lookaround 两道防线在中文全失效（中文无空格、CJK 不算 `\w`），任何含两个加粗的中文句子被吞并成巨型加粗，或错配「上一加粗闭合+下一加粗开启」**静默删除**加粗标记（表格单元格触发）。`**A**B**C**` 本是合法 CommonMark；后端 `normalize_yuque_emphasis` 从无此步骤，删除后前后端对齐。
4. **URL 内 4+ 连续下划线被相邻加粗拆分改写（2026-07-28；唯一污染存储层的一条）**：`normalizeYuqueEmphasis` 步骤 (2) `/_{4,}/g → '__ __'`（星号版 `\*{4,}` 同款）对 fence 外全文无差别生效，HillStone 文档站 URL 尾部 `TocPath=…%25257C_____0`（5 连下划线）被插空格+丢一个下划线 → 链接目标含空格不再解析为链接，整行退化纯文本 + linkify 部分自动链接；富文本编辑器**每次保存把破碎结构序列化回 `raw_content`**（`\[…\]` 转义 + `<…>` autolink + `\_` 被 URL 编码为 `%5C_`，逐轮升级、第 3 轮达不动点；内联编辑双写连坐 published）。「链接标题设置」等任何触发保存的操作都会引爆，功能本身无罪。修复=`normalizeYuqueEmphasis` **入口把 `https?://[^\s<>)"'`]+` 段掩码为 `\x00jzYqUrl{i}\x00`、出口精确还原**——整个强调归一化（含全部空白/合并规则）对 URL 免疫；后端镜像从无此拆分步骤，无需修。受损文档（444/438）已按同站姊妹链接佐证的原始形态重建数据；纯显示层受害文档（458）代码修复后自愈。实证套路：happy-dom + 无头 Tiptap（同线上 tiptap-markdown 配置）模拟「打开→保存」往返，与库中损坏内容逐字节比对定位轮次。

> 改 `applyYuqueCompatMode` 任何正则，回归须过五类用例：CJK 标点连接双加粗、font 交替染色句、含 ` --> ` 的图表注释、空格包裹公式（抢救 vs 货币文本不触发）、URL 含 4+ 连续下划线/星号不被改写（掩码勿绕过）（`markdown.preprocess.test.ts` + 后端 `test_markdown_preprocess.py` 已钉住）。

### 语雀空格包裹公式抢救（2026-07-26）

语雀导出会把公式节点包成**两侧带空格的行内美元** `$ … $`（真实样本：`$ [ B_{\text{total}}\approx2B ] $`、`$ MFU = \\frac{…}{…} $`），恰好撞上四端一致的**货币防误判边界规则**（开 `$` 后、闭 `$` 前不得有空白，见 §5）→ 整条公式退化为纯文本。可叠加两类畸变：`[ … ]` 是 ChatGPT display math `\[..\]` 进语雀丢反斜杠的残骸（`normalizeLatexDelimiters` 只认带反斜杠形态，管不到）；`\\frac` 是语雀对 `\` 的转义。

修复=`applyYuqueCompatMode` **首步** `rescueSpacePaddedDollarMath`（后端 `markdown_preprocess.rescue_space_padded_dollar_math` 镜像）。触发须同时满足三条件：**独立成行 + `$` 内侧留白 + 内容含 LaTeX 信号**（`\cmd` / `_{` / `^{`）→ 输出多行 `$$` 块，并还原 `\\`+字母 → `\`+字母（真换行 `\\` 后跟空白/`[`，不受影响）、剥掉包住整个公式体的裸 `[ … ]`（区间并集形态内部含 `[`/`]`，保留不动）。货币文本（`$ 5 到 10 $`）无信号永不触发，无留白 `$x$` 本就可渲染不动；**修复落在兼容层而非四端 tokenizer**——放宽边界规则需四端同步+货币回归，得不偿失。因 `preprocessMarkdown` 是渲染/加载时预处理，存量文档无需改数据即生效。

### 语雀彩色行内代码 + 相邻斜体粘连（2026-09-01）

真实样本=线上 doc 1002《Route Preference》。两类失效同批修复，均为渲染层预处理（`raw_content` 不动、存量即生效），前后端镜像（`markdown.ts` ↔ `markdown_preprocess.py`）。

**① 彩色行内代码**（「颜色块/表格不支持行内代码」双 bug 共同根因）：语雀把染色标签导出在**反引号内部**——`` `<font style="color:…">preference</font>` ``、`` `_<font>static-path</font>_` ``（斜体叠加）、一对反引号内多段混排的整行命令。旧兼容层要么剥反引号只留颜色（`unwrapBacktickedHtml`/`unwrapBacktickedEmphasis`，代码芯片丢失），要么形态不匹配时 `normalizeLegacyHtmlTags` 无守卫改写反引号内标签 → markdown-it 默认 `code_inline` 转义出字面 `<span …>` 垃圾。**表格管线本身无辜**：管道表格转 HTML 用的 `tableMd` 对单元格内 `` `x` `` 本就能出 `<code>`，只是兼容层先跑已把反引号剥掉。修复=`convertBacktickedStyledCode`：整段反引号转原生 `<code>` 芯片，**保码丢色**（色值全是语雀默认正文灰，芯片有 `--jz-code-inline-*` 六主题令牌；用户拍板）、`**`/`__`→`<strong>`、`_`/`*`→`<em>` 保留、残余 markdown 活性字符（`*_[]$`）转 HTML 实体防 `<code>` 标签间续解析；仅当反引号内是「纯文本+表现层标签」才接手（展示 `<div>` 之类真实代码样例不动）；**必须排在 `unwrapBacktickedEmphasis` 之前**（否则 `` `**<font>…</font>**` `` 反引号先被那步剥掉）；`normalizeLegacyHtmlTags` 加 `isInsideInlineCodeSpan` 守卫。纯加粗 `` `**x**` ``（无染色标签）保持旧 unwrap 行为（用户拍板）。编辑器加载同走此预处理，保存时 Tiptap code mark 会把芯片内粗斜体降级为纯代码（接受为优雅降级）。

**② 相邻斜体粘连（CJK 侧翼规则怪癖）**：语雀相邻两段斜体直接粘连 `_<font>A</font>__B_`——中间 `__` 被 markdown-it 当成**一个长度 2 的定界符串**，按 CommonMark 侧翼规则（前 `>` 标点、后 CJK 字母）**只能开不能闭** → 配对全乱：句首 `_` 变字面、句尾 `_` 借走 `__` 中一个配出半截斜体（doc 1002 全文 6 处字面 `_`）。修复=`normalizeItalicWrappingInlineHtml`——`normalizeBoldWrappingInlineHtml` 的 `_` 孪生（当年只修 `**` 漏了 `_`），`_(<font|span…>…</…>)+_` → `<em>…</em>` 直接转 HTML 整体绕开侧翼规则、**斜体保色**；A 消费掉 `__` 首个 `_` 后，裸残段 `_B_` 脱离长串可被正常配对（实测自愈）。正则要求 `_` 后紧跟标签结构，URL 下划线串/snake_case/裸 `_中文_` 永不命中（不需 URL 掩码）；夹裸文本的标签链刻意不接（对 `_` 做 bold 版的 inner 宽匹配会误伤 snake_case）。

**③ 反引号跨段错配 + 括号加粗误伤**（2026-09-08，样本 doc 1046「Route Preference」）：`unwrapBacktickedHtml` / `unwrapBacktickedEmphasis` / `convertBacktickedStyledCode` 此前各自用独立正则（`` `(<span…>…</span>)` `` 之类）全文扫描——正则在 `` `preference` `` 处配不上就**跳到下一个反引号重新起配**，`` `preference`<span>…该语句…</span>`preference` ``（两段代码夹一段彩色文本）的第 2、3 个反引号被当成一对剥掉，两段代码与 span 合并进一个 code_inline，转义成字面 `<span style=…>` 垃圾；`[^`]*?` 允许跨行的写法还把相邻两行的代码段连成一段（同篇 `` `external distance-value`<span>…</span> `` 与下一段 `` `no distance ospf` ``）。编辑器往返再把破碎结构写回 `raw_content`（`\``、`\*\**`）。修复=`mapInlineCodeSpans(src, fn)`（后端 `_map_inline_code_spans`）：从左到右扫描，长度 n 的反引号串只能由**同长度**串闭合、**不跨行**、未闭合的串保持字面——与 markdown-it 最终分段一致，兼容层看到的「段」就是渲染器看到的「段」；三函数全部改为在 `fn(body, ticks)` 回调里判断 body。顺带发现后端镜像从未生效：Python `re` 对未参与匹配的 `(\*\*|__)?…\1` 回引直接判失败（JS 视为空串），无标记形态在导出端从不剥反引号，现显式比对 opener/closer 真正对齐。**同批**：`normalizeBoldWithInteriorParens` 的 `**…(…)…**` 直接对原文匹配，被 `style="color: rgb(51, 51, 51)"` 属性里的括号命中，表格 `<span>***A***</span> | <span>***B***</span>` 从 A 格闭合 `**` 跨单元格配到 B 格开启 `**` 改成 `<strong></span> | <span></strong>`（隔一格 `**A**</span>|<span>x</span>|<span>**B**` 同样中招）；改为括号必须出现在**剥掉标签后的文本**里（括号前至少一个字符，`ORM (…)` 空格形态仍要转换）且正文标签成对配平（`inlineTagsBalanced`）；`normalizeBoldWrappingInlineHtml` 的 `reInner` 前导文本改为「纯文本 | 完整成对标签」，禁止以裸闭合标签起头。回归：前端 `markdown.preprocess.test.ts` 两个 describe 共 8 项 + 后端 6 项。

### PPT 有道云式阅读器（`.pptx` → 逐页图 + 缩略图 + 讲者备注）

**转换管线**（`editor/tasks.convert_pptx_to_slides`，Celery 异步，需 `libreoffice`(soffice) + `poppler-utils`(pdftoppm) 在 PATH）：

1. `soffice --headless --convert-to pdf` 转 PDF（soffice 加载坏源仍退 0，故靠 B1 前置拦截）；
2. `pdftoppm -jpeg -jpegopt quality=82` 逐页光栅化为 **JPEG**（非 PNG——94 页 deck 从 ~24MB 降到几 MB，批次 3fa9ba9），每页额外生成 **~320px 导轨缩略图**（`SlideImage.thumbnail`，缩略图轨用它、主图才用全分辨率，避免每个缩略图都拉全图致 850MB 解码）；
3. `extract_pptx_notes(pptx_path)` 用 **python-pptx** 抽讲者备注（`slide.notes_slide.notes_text_frame`），**best-effort**：失败不拖垮转换，按 `index` 与渲染页对齐（隐藏页漂移则该页留空、不越界）；
4. **保留第 1 步的中间 PDF**（2026-09-08，`_store_deck_pdf` → `DerivedFile(kind=deck_pdf)`，迁移 `editor 0005_derivedfile`；`DerivedFile` 是通用「服务端派生文件」表——FK Document + `unique(document, kind)`，kind ∈ deck_pdf / ocr_pdf / poster / cover，文件落 `media/derived/YYYY/MM/<uuid>.<ext>`（Caddy 对 `/slides/*` `/derived/*` 同样 immutable），查询经 `apps/editor/services/derived.py derived_of/derived_url`，详情端点用 `prefetched_derived` 缓存）：它含全部文字与超链接，前端用 pdf.js 在每张幻灯图上叠文字层/链接层（保真度与 JPEG 一致——图就是从它栅格化的）。落盘 best-effort（失败只 log 不影响 slides）；幂等守卫升级为「有 slides 无 deck → 只跑 `render_deck_pdf`（soffice 一步）补 PDF」自愈。**刻意不用 `Attachment` 承载**：`_primary_attachment`/`detect_doc_format` 按附件挑主件，派生 `.pdf` 混入会把 pptx 误判成 pdf 且出现在附件列表。

**数据模型** `SlideImage`（`unique_together (document, index)` 使重转幂等，`ordering = ["index"]`）：`index`(0-based 稳定序) / `image`(全分辨率 JPEG) / `thumbnail`(320px，legacy 行空 → `thumb_url` 回退全图) / `notes`(TextField，无备注/legacy 行为空)。`as_dict()` 带出 `notes`，blog + knowledge 两序列化器自动生效。

**转换状态可见**（批次 B2）：`Document.slide_status`(pending/failed…) + `slide_error`（迁移 `knowledge 0009`）持久化转换态，`_set_slide_state` 写入、`_failure_reason` 把异常翻成人话（须匹配 `pdftoppm` 的 JPEG 输出串，勿留 “no PNG” 死分支）。前端 `PptxReader` 据此区分 pending/failed、显示真实原因、**失败即停轮询**（详见 [frontend.md §5](./frontend.md#5-博客阅读器体验)）。

**任务健壮性与可观测（2026-09-08 批 4）**：`convert_pptx_to_slides` 改为 `bind=True, base=ConvertTask, acks_late, reject_on_worker_lost, soft_time_limit=520, time_limit=560`（显式小于全局 540/600，软限先触发才能落状态）；瞬时错误（`TimeoutExpired`/非 `FileNotFoundError` 的 `OSError`）在 worker 下最多重试 2 次（`_should_retry`，**直接调用/测试永不重试**，保持同步语义），`ConvertTask.on_failure` 兜底写 `failed`；源文件 `shutil.copyfileobj` 流式落盘不再整份读内存。每次运行落一行 **`ConversionJob`**（`kind/status/task_id/attempt/pages/src_bytes/out_bytes/duration_ms/error`，admin 可按 kind/status 筛，`SlideImage`/`DerivedFile` 同时注册 admin）；`Document.slide_status` 加 `choices`+`db_index`（常量 `Document.SLIDE_PENDING/DONE/FAILED`，迁移 `knowledge 0010`）。Beat `editor.sweep_stuck_conversions` 每 15 分钟把「pending 超 20 分钟且无 running 作业」的 deck 置 failed（硬超时 SIGKILL 跑不到 on_failure 的兜底）。作者可在阅读器失败态点「重新转换」→ `POST /api/v1/documents/<id>/reconvert-slides/`（`IsContentAuthor` + 共享池 scope，`services/slides.reset_slides` 清 slides/deck 后 `.delay()`）。**队列拆分**：`CELERY_TASK_QUEUES = celery/convert/export/ocr`，路由 `editor.convert_pptx`→convert、`exporter.run_export`→export、`editor.ocr_pdf`→ocr；不带 `-Q` 启动的 worker（dev systemd）自动消费全部队列，生产 compose 拆成 `celery`（`-Q celery,export` + beat）与 `celery-convert`（`-Q convert,ocr --concurrency=1`）。

**PDF/EPUB 服务端元数据与海报（2026-09-08 批 10）**：`extract_document_text` 任务顺带产出 `DerivedFile(poster)`（`services/posters.py make_pdf_poster`：`pdftoppm -jpeg -f 1 -l 1 -scale-to-x 480`，`page_count` 写在 poster 行上）与 `DerivedFile(cover)`（`extract_epub_cover`：读 `META-INF/container.xml` → OPF `properties="cover-image"` / `<meta name="cover">` / 兜底 id·href 含 cover 的图片项，零新依赖）；加密 PDF 跳过海报。序列化：blog 列表/详情与 knowledge 列表/详情多 `poster_url`（PPT 回落首张缩略图）与 `page_count`，`_published_qs` 与 knowledge list 查询集加 `derived_prefetch()`（`services/derived.derived_visual` 单次遍历取 poster/cover；`test_defer_body_perf` 期望 3 条查询）；`preview` 端点增 `doc_format/page_count/poster_url/size/encrypted`，正文为空时摘要取抽取文本前 160 字。**上传上限按类型**：`MAX_UPLOAD_SIZE_BY_EXT`（图片 20 MB / PDF 500 / PPT 300 / EPUB 200 / DOCX 100 / 其它 2 GiB，env `JZ_MAX_UPLOAD_<TYPE>_MB` 覆盖），四个上传入口与 zip 导入统一 `max_upload_size_for`；`DATA_UPLOAD_MAX_MEMORY_SIZE` 由误设的 2 GiB 改回 10 MB（Django 该项只约束非文件表单字段，测试 `test_data_upload_memory_size_only_caps_form_fields` 锁定语义）。回填：`backfill_document_text --all --missing-posters`（本地 465 篇已生成）。

**存量维护命令**：`manage.py reconvert_pptx`（回填旧 PNG/无缩略图 deck，重新光栅化，同时删旧 deck PDF 由任务重建）；`manage.py backfill_pptx_notes [--all]`（**只读源文件补 `notes`、不重新光栅化**，回填备注上线前转好的 deck）；`manage.py backfill_pptx_pdf [--all|--ids|--kb] [--force] [--dry-run]`（**只跑 soffice 补 deck PDF、不动 slides**，默认跳过已有 deck 的文档；本地 24 个 deck 已回填）。

**部署**：线上镜像须含 `libreoffice` + `poppler-utils`（系统包）+ `python-pptx`（新依赖）；改依赖后需重建镜像 + `migrate` + `backfill_pptx_notes --all` 才有备注；2026-09-08 批次上线后再跑 `backfill_pptx_pdf --all` 存量 deck 才有文字层（无 deck 的自动回退纯图）。

**字体识别与自动适配（2026-09-09，`apps/editor/services/office_fonts.py`，详见 `docs/plans/2026-09-09-pptx-font-adaptation.md`）**：阅读器画的是服务端光栅，字形 100% 由 worker 上 LibreOffice 的字体选择决定，此前完全放任 fontconfig：未知族名一律落 **DejaVu Sans**（微软雅黑 / Huawei Sans / 方正兰亭黑的西文全错、字宽偏大致换行点漂移 → 文本框溢出）、**宋体丢衬线**（fontconfig 先解析到默认 sans 再逐字回退 Noto Sans CJK），且 Noto CJK 竖向度量 **hhea 1.160/0.288 = 1.448 倍行高**（宋体/黑体/方正 ≈1.0、微软雅黑 ≈1.33）让段落最多膨胀 45%。现在 `render_deck_pdf` 先跑 `prepare_fonts(pptx, workdir)`（**永不抛**，失败退回系统默认）：① `inspect_pptx_fonts` 用 zip+正则扫 theme/master/layout/slide 的 `typeface`（python-pptx 只给运行级、漏主题槽位）+ `p:embeddedFontLst`，主题 `<a:font script=…>` 多语种兜底（Latha/DokChampa/新細明體…，每份 deck 约 30 个、几乎不出字）单独标 `scope=script` 不计入「已替代」；② `resolve_fonts` 四级：本机精确命中 → **度量兼容包**（`manage.py build_font_pack`，见下）→ `FONT_RULES` 精选表（宋/黑/楷/仿宋/繁日韩/无度量孪生的拉丁名）→ `classify_font_name` 关键词分类兜底（纯 ASCII 名走 Liberation 链，含 CJK 关键字走 Noto CJK 链）；**符号字体（Wingdings/Symbol…）与已有度量孪生的 Calibri/Arial/Times 一律 `system` 不生成规则**——LO 自己把 Wingdings 重编码到 OpenSymbol，覆盖会把项目符号变字母；③ `write_fontconfig` 生成本次专用 `fonts.conf`（`<include>` 系统配置 + `<dir>` 内嵌字体/字体包目录 + 持久 `<cachedir>` + 每个未安装族一条 `<match target="pattern">…mode="assign" binding="strong"`），经 `FONTCONFIG_FILE` 传给 soffice；**必须绝对路径**（相对路径 fontconfig 静默退化为无配置），**必须 assign 不能 prefer**（prefer 只前置候选，未知拉丁名照旧落 DejaVu）；④ 内嵌字体 `.fntdata`（EOT 容器）`unwrap_embedded_font` 去头/XOR 解出 TTF/OTF 放 workdir 由 `<dir>` 收进，MTX 压缩记 `compressed` 不阻塞（LO 7.x 自身不读 pptx 内嵌字体）。报告 `FontPlan.report()` 落 `workdir/fonts-report.json` → `_store_deck_pdf` 写进 **`DerivedFile(deck_pdf).meta["fonts"]`**（无迁移），序列化为 `slide_font_report`（blog 详情 / slides 轮询 / knowledge 文档），前端 `PptxReader` 工具条「字体 N」按钮 → `PptxFontReport` 弹层列原稿字体→渲染字体→方式。`_run()` 的 env 同时加 `XDG_CACHE_HOME`（每次转换新 HOME 曾让 fontconfig 缓存每次重建）与 `LANG=C.UTF-8`。**pdffonts 里的 `NotoSansCJKjp-*` 不是日文字形**——Noto CJK OTC 各语言面共享一个 CFF，其 FontName 就是 jp，字形由 cmap 面决定（探针 骨/直/曜 为 SC）。

**度量兼容字体包**（`manage.py build_font_pack [--out DIR] [--only 宋体 …] [--subset] [--force]`，产物 `infra/fonts/pack/`，**gitignore 不入库**，~190 MB）：fontconfig 改不了度量，唯一解是「同名 + 原度量」的字体文件（Carlito 之于 Calibri 的做法）——用 fonttools 从 Noto Sans/Serif CJK SC（OFL 1.1 **无 Reserved Font Name**，允许改名派生）抽单面、把 `hhea`/`OS/2`（typo/win 三套 + USE_TYPO_METRICS）改成目标的公开近似度量（宋体/黑体族 0.859/0.141、微软雅黑 1.058/0.262、等线 1.0/0.25、Huawei Sans 0.93/0.24），`name` 表写中英双族名记录（`宋体`+`SimSun`，fontconfig 两名皆精确命中），五族 × Regular/Bold 共 10 个 OTF + `pack.json` 清单（`aliases` 让 `resolve_fonts` 把 华文细黑/方正兰亭黑 等映射到 `黑体` 包）。`--subset` 裁到 GB+拉丁字集可省 1/3 体积但 CFF 子集化每面约 7 分钟，默认关。字体目录由 `settings.OFFICE_FONT_DIRS`（env `OFFICE_FONT_DIRS`，`os.pathsep` 分隔；默认 `/usr/share/fonts/jianzhai` + `infra/fonts/pack`，不存在即跳过）声明，生产由 compose 把 `infra/fonts/pack` 只读挂到 `/usr/share/fonts/jianzhai`（backend / celery / celery-convert 三处，Playwright 导出端顺带受益）。镜像层新增开源替代包（`fonts-noto-cjk-extra fonts-wqy-* fonts-arphic-ukai/uming fonts-lxgw-wenkai fonts-liberation2 fonts-crosextra-carlito/caladea fonts-noto-core fonts-unfonts-core fonts-ipafont-gothic`）与 `infra/fonts/60-jianzhai-office.conf`（`manage.py office_fonts_conf` 由 `FONT_RULES` 生成，**只含 prefer 别名**——系统级不得压过运维手装的真字体）。上线后 `reconvert_pptx --all` 存量重渲染。**实测（2026-09-09，40 份 deck）**：DejaVu 使用 22→0 份、超页文本行 0.68%→0、形状外文本块 4.15%→3.42%、探针宋体行距 1.45×→1.20×（= PowerPoint）。验证：`Test/scripts/pptx_font_smoke.py`（探针 deck 走真实 `render_deck_pdf`：无 DejaVu / OpenSymbol 仍在 / 四族 pack / 宋体段落行距 ≤1.2 倍字号 / 文字层可抽全部探针字）与 `Test/scripts/pptx_font_audit.py`（库内 40 份有效 deck 普查 + pdffonts + 「文本块不落在任何文本形状内」溢出率，`--compare` 前后对比）。

---

### 扫描件 OCR（2026-09-08，批 13）

本地库 26 个扫描 PDF 占 1.77 GB，文字层/查找/划线/搜索对它们全部无效——只有 OCR 有意义。实现（`apps/editor/services/ocr.py` + `tasks.ocr_pdf`）：

- **产物 = `DerivedFile(kind=ocr_pdf)`**：`ocrmypdf --skip-text --optimize 0 --jobs N -l chi_sim+eng --output-type pdf` 给原件加一层不可见文字，原件不动仍是下载对象；阅读器改渲染副本（序列化器 `reader_pdf_url`，`PublicAttachmentPreview` / `DocEditorPage` 优先取它），`extract_document_text` 已优先读副本（`source=ocr_pdf`）→ 站内搜索可搜。**`--skip-text` 使任务幂等**（已有文字的页原样复制）。
- **队列 `ocr` + 按页数定时限**：`queue_ocr(document_id, pages)` 用 `apply_async(soft_time_limit=min(OCR_MAX_SECONDS, max(120, pages × OCR_SECONDS_PER_PAGE)))`；大书按 `OCR_MAX_PAGES`（默认 1000）只做前 N 页并在 `DerivedFile.meta.partial` 记录，`backfill_ocr --max-pages` 可再收紧。生产单独 `celery-ocr` 容器（`-Q ocr --concurrency=1`），一本几小时的书不会挡住 PPT 转换。
- **触发**：`extract_document_text` 判定 `is_scanned && source=="pdf" && !encrypted` 且 `OCR_AUTO` 时自动排队（`source=="pdf"` 守卫防止副本仍被判扫描件时死循环）；存量 `manage.py backfill_ocr [--all|--kb|--ids] [--max-pages N] [--force] [--inline] [--dry-run]`（只选 `extract.is_scanned` 且无副本的 PDF）。
- **可观测**：`ConversionJob(kind=ocr)` 记录 pages/耗时/错误（`_ocr_failure_reason`：超时 / 未装 / ocrmypdf 退出码 + stderr 末行）；序列化器 `ocr_status`（`scanned` 未识别 / `queued` / `running` / `failed` / `done` / `''` 文字 PDF），前端 `PdfScanHint` 在阅读器上方提示「图片型 PDF：…」。加密 PDF 跳过（job 记 failed 说明）。
- **环境**：镜像层 `ocrmypdf tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng ghostscript`；dev 宿主机 `dnf install tesseract tesseract-langpack-chi_sim` + venv `pip install ocrmypdf`（`ocr_binary()` 会在解释器同目录找 venv 里的可执行文件，systemd 的 PATH 不含 `.venv/bin` 也能跑）。`OCR_ENABLED=false` 整体关闭。
- **已知限制**：tesseract 4.1 对中文会在字间插空格、偶有错字（`text_extract` 不做后处理，搜索用 jieba 分词受影响有限）；OCR 副本的 URL 与原件不同，PDF 阅读器的本地位置记忆按 URL 分叉（服务端位置按文档不受影响）。冒烟 `Test/scripts/ocr_smoke.py`（Pillow 现造两页图片型 PDF → 抽取判扫描 → 提示 → 真跑 ocrmypdf → 文字层/搜索/下载三断言，13 项）。

## 9. 语雀式链接三形态（2026-07-20）

链接可在三种显示形态间切换：**链接**（URL 原文）｜**标题**（目标页/文档标题文字，**默认**）｜**卡片**（`DocCardEmbed`/`LinkCardEmbed` 块节点），另有 **打开文档**（仅内部 `doc:` 链接，站内路由）与 **浏览器访问**（新标签）两动作。序列化格式零变更：`[URL](URL)` / `[标题](doc:ID)`（仍匹配 `MENTION_RE`，双向链接提取不受影响）/ 既有 `[[…]]` 占位符。

**共享工具** `utils/linkModes.ts`：`classifyHref`（`doc:ID` / `/d/ID` / 站内绝对地址 / 外链 / other）、`canonicalHref`（站内归一化 `doc:ID`）、`isBareUrlText`（模式判定启发式：显示文本本身是裸 URL ⇔ 链接模式，**无 mark 属性**——tiptap-markdown 序列化纯 `[text](url)`，属性活不过存盘往返）、`fetchTitleForHref`（doc→preview 接口 / 外链→link-preview OG，5s 超时全捕获返 null）。

- **Tiptap**：`LinkBubbleMenu.tsx` = 第二个 `BubbleMenu` 实例（`pluginKey: 'linkBubbleMenu'`，格式气泡在 `isActive('link')` 时让位）；`linkAutoTitle.ts` = `LinkPasteAutoTitle`（handlePaste 拦**空选区+单裸 URL** 粘贴，先插 `[URL](URL)` 再异步取标题；有选区放行给 extension-link 的 linkOnPaste）+ `applyAutoTitle`/`replaceLinkText`（**href+旧文本双匹配守卫**：取标题期间用户改过文字则匹配失败绝不覆盖，无需 transaction mapping）；`confirmLink` 空光标确认也走自动标题。卡片右上角 hover 胶囊菜单（`.jz-card-mode-menu`）回转行内链接/标题。
- **CM6**：`codemirror/pure/linkAt.ts` 纯函数（`findLinkAt` 行内定位、`linkToPlain/Title/Card`；卡片须整行——独占行原地替换、行内则移到下一行，mention 的 `@` 前缀经 `atFrom` 一并吞掉）+ `LinkFloatingMenu.tsx`（FloatingFormatToolbar 同款 portal）；`handleCmUpdate` 空选区检测（表格浮条优先、fence/行内代码经 `syntaxTree` 排除），命令派发前重新 `findLinkAt` 校验 href 未变。
- **阅读端 / 导出端**：见 [frontend.md §5](./frontend.md)（CardEnhancer 水合）与 [export-search.md §2](./export-search.md)（card_placeholders 零泄漏）。

> ⚠️ **Tiptap v3 三坑**（实测踩中，勿复犯）：
> 1. **Link 扩展协议白名单**（`isAllowedUri`，默认 http/https/mailto…）**拒收 `doc:`** → markdown 重载时 `[标题](doc:ID)` 的 link mark 被**静默剥成纯文本**（存量 bug：mention 行内链接在富文本模式一直坏着）。修=`Link.configure({ protocols: ['doc'] })`；新增内部协议须同步此白名单。
> 2. **`useEditor` 默认不随 transaction 重渲**：组件 render 里直接 `editor.isActive()/getAttributes()` 拿到**陈旧快照**（菜单激活态/按钮显隐全错）。任何依赖 editor 实时状态的 React UI 一律走 `useEditorState({ editor, selector })` 订阅。
> 3. **`useEditor` 的 1ms 兜底销毁定时器 vs passive effect 竞速**（2026-07-24，`@tiptap/react` 3.23.4 上游缺陷）：`EditorInstanceManager` 在 **render 阶段**同步建实例并立刻 `scheduleDestroy()`——`setTimeout(1ms)` 里若组件还没跑到 passive effect（`isComponentMounted` 仍 false）就把实例 `destroy()`（本意是清理 StrictMode 丢弃渲染）。**首次**懒加载挂载（PostDetail 内联编辑 chunk + Tiptap 首次初始化）太重时定时器抢跑，已提交渲染闭包里的 editor 已被销毁（`commandManager=null`），挂载 effect 里 `editor.commands.*` 即抛 `Cannot read properties of null (reading 'commands')` 打到根 ErrorBoundary；重试后 chunk 已热故第二次正常。**与 StrictMode 无关，prod 慢设备同样可触发**。修=RichTextEditor 挂载 effect 守卫升级为 `if (!editor || editor.isDestroyed) return`（setEditable / setHeadingNumbering / value 同步），`onEditorReady` 对已销毁实例传 null——跳过即可，`useEditor` 会立刻重建实例并随 `[editor]` 变化重跑 effect。同样貌报错先排本竞速，再怀疑 vite 缓存 desync（memory `project_editor_crash_cache_desync_2026-06-09`）。
