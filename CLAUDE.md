# 简斋 / JianZhai - 开发指导文档

> 个人知识库 + 个人博客一体化系统
> 本文档作为 AI 编程助手（Cursor / Claude Code）的开发指南，反映当前实现的真实状态。

---

## 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | 简斋 / JianZhai |
| 定位 | 个人知识库 + 公开博客（双形态合一） |
| 部署 | 本地单机，`localhost` 访问 |
| 后端端口 | 8002 |
| 前端端口 | 3001 |
| 仓库结构 | Monorepo（`backend/` + `frontend/`） |
| 实现阶段 | v0.9.2 — MD/Mermaid 体验大修 + 架构 P0/P1 修复在 v0.9.1 之上 |
| 多用户 | 支持。普通账号按 `owner` 隔离数据；`is_superuser` 跨租户可见 |
| 核心理念 | **一份内容两形态**：`raw_content`（私人笔记）+ `published_content`（发布版） |

---

## 技术栈

### 后端（`backend/pyproject.toml`）

| 类别 | 选型 | 备注 |
|---|---|---|
| 语言 | Python 3.12 | |
| Web | Django 5.2 + DRF 3.15 | |
| DB | PostgreSQL 14+ | psycopg 3，全文搜索用 tsvector |
| 缓存 / 队列 | Redis 5+ | `django-redis` |
| 异步任务 | Celery 5.4 | 导出 / 搜索索引更新 |
| 全文搜索 | `tsvector` + jieba | jieba 切词后写入 `search_vector` |
| Markdown 解析 | `markdown-it-py` + `mdit-py-plugins` | |
| PDF 导出 | Playwright (headless Chromium) | 可选依赖 |
| Word 导出 | `python-docx` | |
| 静态站打包 | Jinja2 + `apps/exporter/services/static_site.py` | 生成 zip |
| 认证 | Django Session + DRF SessionAuthentication | |
| AI 助手 | `anthropic` SDK（可选） | 未装时端点优雅降级 |
| 图片处理 | Pillow | 缩略图与元数据 |

### 前端（`frontend/package.json`）

| 类别 | 选型 | 备注 |
|---|---|---|
| 框架 | React 18 / TypeScript 5 | |
| 构建 | Vite 5 | |
| UI 库 | Ant Design 5 | |
| 路由 | React Router v6 | |
| 状态 | Zustand | `stores/auth.ts`、`stores/theme.ts` |
| HTTP | Axios | `api/client.ts` 集中封装 |
| 编辑器内核 | **Tiptap 3** (ProseMirror) | 富文本 + Markdown + HTML 三种编辑器 |
| 数学 | KaTeX 0.16 | 可视化输入 Modal + 实时预览 |
| Markdown 渲染 | `markdown-it` + `markdown-it-container`/`sub`/`sup`/`mark`/`task-lists` | |
| ↔ Markdown 转换 | `tiptap-markdown` | |
| 代码高亮 | `lowlight` + `highlight.js` | |
| 流程图 | Mermaid 11 + PlantUML（`plantuml-encoder`） | 自定义 Tiptap 节点 |
| 知识图谱 | `react-force-graph-2d` | |
| PDF 预览 | `pdfjs-dist` | 附件内联预览 |
| Word 导入 | `mammoth` | |
| Diff | `diff-match-patch` | 版本对比 |
| 安全 | `dompurify` | 公开端 HTML 净化 |
| 拖拽 | `tiptap-extension-global-drag-handle` | |
| 图标 | **自制 SVG 图标库 `JzIcon`** + AntD icons | |

---

## 项目目录结构

```
jianzhai/
├── backend/
│   ├── manage.py
│   ├── pyproject.toml
│   ├── .env / .env.example
│   ├── jianzhai/                  # Django 项目配置
│   │   ├── settings.py            # 注册 11 个 app、Celery、缓存、限流
│   │   ├── urls.py
│   │   ├── celery.py
│   │   └── {wsgi,asgi}.py
│   ├── apps/
│   │   ├── accounts/              # 多用户登录 + scoping 工具
│   │   ├── ai/                    # AI 助手 (Anthropic Claude 代理)
│   │   │   ├── models.py          # AISettings + AIUsageLog
│   │   │   ├── prompts.py         # 系统 prompt + 8 种操作模板
│   │   │   ├── services.py        # SDK 封装、模型路由、用量日志
│   │   │   ├── views.py           # /ai/run /ai/stream /ai/capabilities /ai/settings /ai/usage
│   │   │   └── urls.py
│   │   ├── knowledge/             # KnowledgeBase / Folder / Document
│   │   │   └── management/
│   │   │       └── commands/
│   │   │           └── seed_architecture_kb.py   # 一键种公开 KB
│   │   ├── editor/                # Attachment + 上传 + Word/MD 导入
│   │   ├── versioning/            # DocumentVersion 快照 + diff + 回滚
│   │   ├── linking/               # 双向链接解析 + 反链 + 知识图谱
│   │   ├── search/                # tsvector + jieba + management 命令
│   │   ├── exporter/              # 异步导出 (services/* 分格式)
│   │   ├── comments/              # 文档级 + 段落级评论
│   │   ├── tags/                  # 标签：可挂 KB / Folder / Document
│   │   └── blog/                  # 公开博客 API + RSS
│   ├── media/                     # 用户上传 (uploads/YYYY/MM/<uuid>.<ext>)
│   ├── exports/                   # 导出产物
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html                 # 含 favicon / manifest / og 元数据
│   ├── public/
│   │   ├── favicon.svg            # 朱砂印章 + 颗粒 + 压痕
│   │   └── manifest.webmanifest   # PWA
│   └── src/
│       ├── main.tsx / App.tsx
│       ├── api/                   # axios 客户端（按资源拆分）
│       │   ├── client.ts ai.ts admin.ts archive.ts attachments.ts auth.ts
│       │   ├── blog.ts comments.ts docs.ts exports.ts folders.ts
│       │   ├── graph.ts kbs.ts linking.ts search.ts tags.ts
│       │   ├── users.ts versions.ts
│       ├── components/
│       │   ├── editor/            # Tiptap 编辑器 + 自定义节点
│       │   │   ├── RichTextEditor.tsx MarkdownEditor.tsx HtmlEditor.tsx
│       │   │   ├── MathNode.tsx DetailsBlock.ts Columns.ts Tabs.ts
│       │   │   ├── InlineToc.ts DocCardEmbed.tsx FontSize.ts Indent.ts
│       │   │   ├── BlockHoverMenu.tsx AIAssistant.tsx
│       │   │   └── ...（共 20+ 自定义节点 / 扩展）
│       │   ├── common/            # 跨页公共组件
│       │   │   ├── JzIcon.tsx               # 20 个自制 SVG 图标
│       │   │   ├── SelectionAI.tsx          # 选区 AI ✨ 浮按钮
│       │   │   ├── DocAIPanel.tsx           # 右下角 AI 抽屉
│       │   │   ├── DocHoverCard.tsx         # doc:N 链接悬浮卡
│       │   │   ├── AIModelBadge.tsx         # 顶栏当前模型徽标
│       │   │   └── ...（搜索 / 附件 / 评论 / 标签 / TOC 等）
│       │   ├── tree/              # KBTreeNav
│       │   ├── diff/              # DiffView
│       │   └── admin/             # ArchitectureSVG
│       ├── pages/
│       │   ├── admin/             # 登录后界面
│       │   │   ├── AdminLayout.tsx          # 侧栏 + 顶栏（玻璃风）
│       │   │   ├── KBListPage.tsx KBWorkspace.tsx DocEditorPage.tsx
│       │   │   ├── AIManagementPage.tsx     # /admin/ai 独立 Tab 页
│       │   │   ├── ExportsPage.tsx UsersPage.tsx VersionsDrawer.tsx
│       │   │   ├── KnowledgeGraphPage.tsx SystemOverviewPage.tsx
│       │   │   └── LoginPage.tsx RequireAuth.tsx
│       │   ├── blog/              # 公开博客（匿名）
│       │   │   ├── BlogLayout.tsx BlogHome.tsx PostDetail.tsx
│       │   │   ├── KBPostsPage.tsx ArchivePage.tsx TagCloudPage.tsx
│       │   └── DocLinkResolver.tsx
│       ├── stores/                # Zustand: auth、theme
│       ├── hooks/
│       ├── types/                 # 类型 + 第三方声明
│       ├── utils/                 # markdown / paper / mermaid / plantuml / tagColor / ...
│       └── styles/                # theme.css + tiptap.css + paper.css + 多主题
├── docker-compose.yml             # postgres + redis
├── Test.html                      # 设计概念稿
├── README.md
└── .gitignore
```

---

## 数据模型设计

### 核心模型清单

| 模型 | App | 说明 |
|---|---|---|
| `User` | django.contrib.auth | 多账号 |
| `KnowledgeBase` | knowledge | 顶层容器（owner / visibility / cover / accent_color） |
| `Folder` | knowledge | self-FK 可嵌套 |
| `Document` | knowledge | **含 `version` 乐观并发字段** |
| `DocumentVersion` | versioning | 历史快照（保留 100 个/文档） |
| `DocumentLink` | linking | `@提及` 解析结果（含 context + position） |
| `Tag` | tags | 用户隔离 |
| `DocumentTag / KnowledgeBaseTag / FolderTag` | tags | 三种通过表 |
| `Comment` | comments | `block_id` 区分文档级 / 段落级 |
| `Attachment` | editor | 附件（KIND: image / document / other） |
| `ExportTask` | exporter | 异步导出任务状态机 |
| `AISettings` | ai | **单例**：默认模型 / 主开关 / max_tokens |
| `AIUsageLog` | ai | AI 调用审计：用户 / 模型 / token / 耗时 / 成功率 |

### 通用模式

- **软删除**：`KnowledgeBase` / `Folder` / `Document` 均含 `is_deleted` + `deleted_at`，配合 `SoftDeleteManager`（默认排除已删）与 `all_objects`（含已删）。`Folder.soft_delete()` 级联子文件夹与文档。
- **唯一性**：`UniqueConstraint(..., condition=Q(is_deleted=False))` 保证 slug 在「未删除」范围内唯一，回收站不冲突。
- **多租户隔离**：`apps/accounts/scoping.py` 的 `scope_queryset(qs, user)`——匿名 → 空集；超级用户 → 不过滤；其他 → `filter(owner=user)`。
- **乐观并发**：`Document.version`；PATCH / 发布版 PATCH / `publish` / `unpublish` 均可带 `expected_version`；服务端 `select_for_update` 校验，冲突 409 + 文档快照；前端 `documentSave` 与编辑器自动加载最新版。

### Document 关键字段

```python
class Document(models.Model):
    knowledge_base = ForeignKey(KnowledgeBase)
    folder = ForeignKey(Folder, null=True, blank=True)

    title = CharField(max_length=200)
    slug = SlugField(max_length=220, allow_unicode=True)

    # 双内容
    raw_content = TextField(blank=True)
    published_content = TextField(blank=True)

    status = CharField(choices=['draft', 'published'])
    visibility = CharField(choices=['private', 'public'])
    paper_style = CharField(max_length=40, blank=True)   # 阅读端纸张样式预设
    search_vector = SearchVectorField(null=True)

    version = PositiveIntegerField(default=1)            # 乐观并发令牌
    order = IntegerField(default=0)
    is_deleted / deleted_at / created_at / updated_at / published_at

    class Meta:
        indexes = [
            GinIndex(fields=['search_vector']),
            Index(fields=['knowledge_base', 'folder']),
            Index(fields=['visibility', 'status', '-published_at']),
        ]
```

### AISettings + AIUsageLog

```python
class AISettings(models.Model):
    """单例。Admin 在 /admin/ai 页设置。"""
    default_model = CharField(max_length=80, default='claude-opus-4-7')
    enabled = BooleanField(default=True)           # 主开关
    max_tokens = PositiveIntegerField(default=1024)
    updated_at = DateTimeField(auto_now=True)

class AIUsageLog(models.Model):
    """单次调用审计。每次 run_once / run_stream 后写一行。"""
    user = FK(User, null=True)
    operation = CharField(max_length=32)           # continue/polish/...
    model = CharField(max_length=80)
    streaming = BooleanField()
    input_tokens / output_tokens = PositiveIntegerField()
    duration_ms = PositiveIntegerField()
    succeeded = BooleanField()
    error = CharField(max_length=200, blank=True)
    created_at = DateTimeField()
```

---

## URL 总览

`backend/jianzhai/urls.py` 顶层挂载：

```
/admin/                       Django admin
/api/v1/auth/                 登录 / 登出 / CSRF / session / system-info / UserViewSet
/api/v1/kbs|folders|documents/   knowledge CRUD（DRF Router）
/api/v1/tree/reorder/         批量调整节点排序与父子关系
/api/v1/uploads/              附件上传
/api/v1/imports/              Word/Markdown 单/批量导入
/api/v1/attachments/          媒体库
/api/v1/documents/{id}/preview/    轻量预览（hover 卡 / doc-card 嵌入用）
/api/v1/documents/{id}/backlinks/
/api/v1/documents/{id}/versions/   含 diff / restore 子路径
/api/v1/documents/{id}/comments/
/api/v1/documents/{id}/tags/
/api/v1/kbs/{id}/tags/  /folders/{id}/tags/
/api/v1/links/graph/          知识图谱
/api/v1/search/               全文搜索
/api/v1/exports/              异步导出任务（含 download/）
/api/v1/tags/                 标签 CRUD
/api/v1/ai/capabilities/      AI 模型列表 + 配置状态
/api/v1/ai/settings/          Admin: GET/PATCH AI 全局设置
/api/v1/ai/usage/             用量聚合 + 最近记录
/api/v1/ai/run/               非流式 AI 调用
/api/v1/ai/stream/            SSE 流式 AI 调用
/api/v1/public/posts/         公开博客（含 by-id / by-slug / adjacent / backlinks）
/api/v1/public/kbs/           公开 KB（含 tree）
/api/v1/public/tags/          公开标签云
/api/v1/public/archive/       归档
/feed.xml                     RSS
```

---

## 功能模块清单（含实现状态）

> ✅ 已实现 / 🟡 部分 / 🔲 待实现

### 模块 1：知识库与目录管理 ✅

- 创建 / 重命名 / 删除知识库（**软删除 + 回收站**）
- KB 支持封面、主题色、可见性、排序
- 文件夹多层嵌套
- 树形目录拖拽排序：`POST /tree/reorder/` 批量提交
- 折叠 / 展开状态本地持久化

### 模块 2：文档与编辑器 ✅

- 文档 CRUD + 软删除
- **三种编辑器并存**：RichTextEditor / MarkdownEditor / HtmlEditor，统一以 Markdown 持久化
- **乐观并发防覆盖**：PATCH 带 `expected_version`，冲突 409 → 前端提示 + 拉取最新
- 自动保存 5 秒防抖；状态指示器（idle/pending/saving/saved/error）
- 手动发布 + 单独编辑发布版本 + 撤回发布
- 编辑器扩展（自定义 Tiptap 节点 / Mark）：
  - **数学公式**：`MathBlock` / `MathInline`（KaTeX 渲染 + 双击 Modal 可视化输入 + 实时预览）
  - **折叠块**：`DetailsBlock`（`<details>` + `:::details Summary` 序列化）
  - **分栏 / 标签页**：`Columns` + `Column` + `Tabs` + `TabPanel`
  - **内联 TOC**：`InlineToc`（`[TOC]` 占位符）
  - **文档卡片嵌入**：`DocCardEmbed`（`[[doc-card:ID]]` 预览卡）
  - **缩进 / 字号 / 字体族**：`Indent` + `FontSize` + `FontFamily`
  - **上下标**：`Superscript` + `Subscript`
  - **批注 Mark**：`AnnotationMark`（hover tooltip）
  - **代码块增强**：`CodeBlockView` 含语言选择 / 复制 / 字号
  - **图片**：`ResizableImage` + `ImageNodeView`（**悬浮工具栏**：旋转/缩放/对齐/裁剪 + 说明文字）
  - **视频嵌入**：`VideoEmbed`（B 站 / YouTube）
  - **块 hover 菜单**：`BlockHoverMenu`（左侧 `+ / ⋯` 浮出，删除/复制/选中此块）
- 编辑辅助：
  - **斜杠命令** `/`：含 AI / 数学 / 结构 / 图表 等多分组
  - **`@` 提及**：跨知识库引用
  - **块拖拽**：`tiptap-extension-global-drag-handle`
  - **查找替换**：`FindReplacePanel`（Ctrl+F）
  - **文档大纲面板**：可固定 sticky，长文档常驻
  - **全屏 / 沉浸模式**：body 加 `jz-fullscreen-active` 隐藏 AdminLayout，固定退出按钮 + 内置大纲抽屉

### 模块 3：历史版本 ✅

主动「保存版本」生成快照（带 `message`）；diff（行级+字符级，`diff-match-patch`）；回滚作为新版本入栈；每文档保留 100 个。

### 模块 4：双向链接 ✅

- `@` 弹文档搜索器（`MentionPicker`）
- `apps/linking/parser.py` 解析 `@[title](doc:ID)` 语法 → signals 同步更新 `DocumentLink`
- 反向链接区（`BacklinkPanel`）+ `doc:N` 链接 hover 卡片（`DocHoverCard`）

### 模块 5：标签系统 ✅

- 可挂 Document / KnowledgeBase / Folder
- 空 `color` 字段自动用 djb2 hash 派生 12 色（`utils/tagColor.ts`），同名稳定同色
- 标签云页 + 按标签筛选 + 公开标签云

### 模块 6：评论 ✅

文档级 + 段落级（`block_id` 定位）；Markdown 内容；单用户自动通过审核。

### 模块 6.5：数学公式（KaTeX）✅（v0.9.2）

- **编辑器**：`MathBlock` / `MathInline` Tiptap 节点 + 双击 Modal 可视化输入
  - `addInputRules`：行首 `$$expr$$` + 回车自动转 MathBlock
  - `addPasteRules`：粘贴含 `$$..$$` 或 `$..$` 的文本自动转节点
- **博客阅读端**：`markdown-it` 已接入自写 KaTeX 插件（`utils/markdown.ts → katexPlugin`），`$$..$$` 块级、`$..$` 行内均渲染（防 currency 误识：`$5` `$10` 不会被解析）
- **离线导出**：HTML/PDF/static-site 全部内嵌 KaTeX HTML + 样式
- **错误处理**：`throwOnError: false` + `.jz-math-error` 红框降级，不抛异常
- 共用 CSS class `.jz-math-block` / `.jz-math-inline`，编辑器、阅读端、导出端三端一致

### 模块 7：全文搜索 ✅

- 全局 `⌘K` 搜索框
- **索引范围**：标题 + `raw_content`（HTML 会先剥标签）+ **标签名** + **评论正文**
- jieba 切词后合并写入 PG `search_vector` GinIndex（`apps/search/services.py` → `collect_search_text`）
- **异步刷新**：`Document` 保存 + `DocumentTag` / `Comment` 增删改 → Celery `refresh_document_vector`
- 管理命令全量重建：`python manage.py reindex_search`（升级后建议跑一次）
- 结果 snippet：正文无命中时回退到标签名 / 评论片段

### 模块 8：导出 ✅

- 粒度：单文档 / 文件夹（树节点「导出」）/ 整 KB；格式：md / html / pdf（Playwright）/ docx / site (zip)
- `apps/exporter/services/` 按格式拆分；产物在 `exports/`（`export_root()` 随 `MEDIA_ROOT` 解析）
- **正文策略**：除整站 zip 仅 scope 内 `status=published` 外，各格式均 `doc_export_body()` — 优先 `published_content`，空则 `raw_content`
- **HTML 合订本（多文档）**：`render_html(scope, mode="interactive")` 输出**单文件 anthology**——固定左侧目录 + **一次只显示一篇**的 `.export-doc-panel`（默认首篇，目录点击/`#doc-N` 链接切换，URL hash 同步，内联 ES5 JS 驱动）。
  - **Markdown 篇**：经 `markdown_preprocess` + `markdown_render`（容器/callout、任务列表、脚注、表格、`doc:N` 锚点）渲染为 `.jz-markdown.export-markdown` 片段。
  - **HTML 篇**：完整页面写入 `<iframe class="export-html-frame" srcdoc>`（仅 `/media/` → base64 重写 + 注入 vh-override），样式与外壳**互不污染**，原样保留作者 `<head>` 样式；**单篇** HTML 导出仍 `export()` 原样写出（不套外壳）。
  - 样式：`BASE_CSS` + `export-markdown.css` + `export-anthology.css`（后者仅 html_export 加载，不进 export_stylesheet/静态站）。
- **HTML/PDF 合订本（PDF）**：`render_html(scope, mode="print")`——展开全部 panel、去目录与脚本、篇章间 `page-break-before`；HTML 篇**不用 iframe**，改为抽取 `<head>` 内 `<style>` + body 扁平嵌入（`export-html-print`），避免 Chromium 打印空白 iframe。Playwright 用 `emulate_media("screen")` 保留屏幕样式（分页由 `.is-print` 类的常开断页规则驱动，不依赖 `@media print`）。外链 `<link>` CSS **不内嵌**（离线限制）。
- **离线资源**：HTML/PDF 单文件内嵌本地 `/media/` 为 base64；zip 类导出复制到 `assets/` 并重写路径。Mermaid/PlantUML 在离线导出中为带语言标签的代码块，无运行时渲染。
- Celery `exporter.run_export` 异步；broker 不可达时 create 内联 fallback；前端 `/admin/exports` 轮询 + `downloadExport()`（fetch + blob，避免跨域 cookie 问题）
- 测试：`backend/apps/exporter/tests/`（含 anthology interactive/print、iframe 隔离、HTML 扁平化用例）；PDF 用例在无 Playwright 时 skip

### 模块 9：博客前台 ✅

- 完全匿名访问
- 首页（KB 网格 + 「藏经阁」hero）/ KB 浏览（树形目录）/ 文章详情（TOC + 相邻文章 + 反链）/ 归档 / 标签云 / RSS
- 多套主题与「纸张」背景（编辑器与阅读端共用 `paper_style`）
- 暗 / 亮主题切换；4 套主题：`light` / `dark` / `starry` / `deepsea`

### 模块 10：附件与媒体管理 ✅

`MultiPartParser`，路径 `MEDIA_ROOT/uploads/{YYYY}/{MM}/{uuid}.{ext}`，三类型：`image` / `document` / `other`；媒体库浏览删除；附件预览（`PdfCanvas` / `FilePreview` / `AttachmentInlinePreview`）。

### 模块 11：知识图谱 ✅

`GET /api/v1/links/graph/` 返回节点+边 → `KnowledgeGraphPage` 用 `react-force-graph-2d` 渲染；按 KB 着色 / 过滤。

### 模块 12：多用户与权限 ✅

`accounts.UserViewSet` 管理；session + CSRF；`apps/accounts/scoping.py` 隔离；自定义权限类 `IsStaffUser` / `IsSuperUser`。

### 模块 13：AI 助手 ✅（新）

**架构**：前端永不持有 API key，所有调用走 `apps/ai/` 后端代理。

```
浏览器 ──POST /api/v1/ai/stream/──► Django ──messages.stream──► Anthropic Claude
       ◄──── SSE: data:{"delta":"..."} ─────────────────────────
```

**模型路由**：
- 用户偏好存 localStorage (`jz-ai-model`)，每次调用带 `model` 字段
- 后端校验 `AVAILABLE_MODELS` 白名单（Opus 4.7 / Sonnet 4.6 / Haiku 4.5），默认 `claude-opus-4-7`
- Admin 在 `/admin/ai` 设全局默认 + 主开关 + `max_tokens`（经 `get_max_tokens()` 注入每次 SDK 调用）

**操作集（8 种）**：续写 / 润色 / 扩写 / 纠错 / 总结 / 大纲 / 中英互译。所有 prompt 模板在 `apps/ai/prompts.py`。

**用量追踪**：每次调用写一行 `AIUsageLog`（含 token / 耗时 / 成功率）；`/admin/ai` 用量 Tab 按日聚合 + 按模型 / 操作分组。

**前端入口**（统一在所有编辑模式 + 阅读端可用）：
- 编辑器工具栏：`AIAssistantMenu`（含模型切换下拉）
- 选中文字：`SelectionAI`（紫色 ✨ 浮按钮 → 操作菜单或自由提问）
- 右下角：`DocAIPanel`（🤖 蓝色浮按钮 → 抽屉式全文 AI）
- 斜杠命令：`/ai` 直接生成段落
- 顶栏徽标：`AIModelBadge`（实时显示当前模型）

**限流**：30 req/min/user (`UserRateThrottle` scope=`ai_write`)。

### 模块 14：视觉系统 ✅（新）

- **后台风格**：「Apple 玄黑·玻璃拟态」+ 翡翠 #10b981 重音，作用域 `.jz-admin-glass`
  - light / dark / starry / deepsea 全部适配（亮玻璃 vs 暗玻璃自动切换）
  - 大圆角 14-18px + 颜色偏移柔阴影 + backdrop-filter blur
  - 翡翠胶囊菜单 active 态 + 印章 logo
- **博客风格**：宣纸 #f3ebd6 + 朱砂 #b94a3b 古风，保留 v0.5 之前主调
- **自制 SVG 图标库** `components/common/JzIcon.tsx`（20 个）：
  - 24×24 / 1.5px stroke / `currentColor` / linecap round
  - 每个图标有专属「印泥色」彩点（朱砂/翡翠/暗金/青蓝/紫罗兰/橙）
  - CSS 变量 `--jz-icon-accent-active` 在 hover/选中态统一染色 + drop-shadow 发光
  - 覆盖：后台菜单 7 / 博客导航 5 / AI Tab 4 / 编辑器 sidebar Tab 4
- **Favicon**：朱砂印章 SVG（径向渐变印泥 + 颗粒滤镜 + 四角磨痕 + 双线印框 + 压痕「簡」）
- **PWA**：`manifest.webmanifest` + apple-touch-icon + theme-color
- **白边修复**：`html / body / #root` 全局 reset margin/padding，铺满整屏

---

## 非功能与已配置项

- **DRF 节流**：匿名 `120/min`；AI `30/min/user`
- **上传**：单文件 50MB
- **CSRF**：`CSRF_COOKIE_HTTPONLY=False`，SPA 读取并塞 `X-CSRFToken`
- **iframe**：`X_FRAME_OPTIONS = "SAMEORIGIN"` 让博客端可内嵌 HTML/PDF
- **时区 / 语言**：`Asia/Shanghai` / `zh-hans`
- **缓存**：`django_redis`
- **Celery**：broker `redis://localhost:6379/1`，result backend `:6379/2`

---

## 关键风险与注意事项

1. **Tiptap Markdown 互转保真度** — 复杂表格、合并单元格在富文本 ↔ Markdown 间可能丢失。
2. **双向链接** — `linking/tasks.py` 仅接受**同 owner** 且未软删的目标文档；`sync_document_links` 对源文档 `select_for_update` 并把锁结果**赋值给本地变量**（v0.9.2 修复了"取了锁就丢"导致的并发争用），bulk_create 完整运行在 atomic 块内。保存后 Celery 异步解析 `raw_content`。
3. **乐观并发** — PATCH / 发布版 PATCH / `publish` / `unpublish` 均可带 `expected_version`；序列化器在事务内 `select_for_update` 校验；冲突返回 409 + 最新文档快照。
4. **大文档性能** — 编辑器 10k+ 字时仍流畅，但建议未来对超长文档启用 Tiptap lazy rendering。
5. **PDF 导出资源** — Playwright 单次启动约 200MB；Celery 串行处理。`pip install -e .[pdf]` + `playwright install chromium`。
6. **PG 中文搜索** — `tsvector` 不支持中文分词，写入和查询两端都用 jieba；升级索引逻辑后需 `reindex_search`。
7. **超级用户跨租户可见** — `scope_queryset` 对 superuser 不过滤；多账号时小心 staff 误操作。
8. **AI Token 成本** — 默认 `claude-opus-4-7`；控成本可在 `/admin/ai` 切 Haiku 或调低 `max_tokens`（已对接运行时）。

---

## 阶段交付计划

| 阶段 | 内容 | 状态 |
|---|---|---|
| **v0.1 MVP** | KB + Folder + Document CRUD + Markdown 编辑器 + 私密/公开切换 + 博客前台 | ✅ |
| **v0.2 编辑器增强** | Tiptap 富文本、`/` 命令、块拖拽、`@提及` 双向链接、反向链接区 | ✅ |
| **v0.3 协作辅助** | 历史版本（diff / 回滚）、PG 全文搜索（jieba） | ✅ |
| **v0.4 导出能力** | 单文档/文件夹/KB 导出，HTML/MD/PDF/DOCX + 整站 zip | ✅ |
| **v0.5 完善** | 评论、标签云、归档、RSS、移动端适配 | ✅ |
| **v0.6 AI + 编辑器扩展** | apps/ai、玄黑玻璃后台；MathNode / DetailsBlock / Columns / Tabs / DocCardEmbed / FontSize / Indent / 上下标 / BlockHoverMenu / 图片悬浮工具栏 | ✅ |
| **v0.7 UI 打磨** | 白边修复、博客 sticky 顶栏 + 卡片质感、4 主题适配、印章式 favicon、PWA | ✅ |
| **v0.8 编辑体验** | 大纲固定 / 全屏退出 / 全屏目录 / 所有编辑模式 AI / 路由 bug | ✅ |
| **v0.9 视觉系统** | 自制 SVG 图标库 + 双色调彩点 + 主题联动染色 | ✅ |
| **v0.9.1 维护** | 搜索含标签/评论；链接租户边界；原子 version；AI max_tokens；编辑器竞态修复 | ✅ |
| **v0.9.2 MD/图表 + 架构** | KaTeX 全链路渲染；Mermaid/PlantUML 默认渲染图 + 单击切源码；暗主题画布对比度；docN 链接重写；linking 锁修复；AI 服务端长度上限；exporter CSS 线程安全；prod SECRET_KEY 兜底 | ✅ |
| **v1.0 候选** | 增量自动保存 / Tiptap lazy rendering / 回收站 UI / 超大 KB 树分页 / Yjs | 🔲 |

---

## 开发起步建议

1. 复制 `.env.example` 为 `.env`，配置 DB / Redis / SECRET_KEY
2. `docker compose up -d` 启动 Postgres + Redis
3. 后端：`pip install -e .[dev]` + `python manage.py migrate` + `createsuperuser`
4. （可选）启用 AI：`pip install anthropic` + 在 `.env` 加 `ANTHROPIC_API_KEY`
5. （可选）种公开 KB：`python manage.py seed_architecture_kb`
6. 启动后端：`python manage.py runserver 0.0.0.0:8002`
7. 启动 Celery：`celery -A jianzhai worker -l info`
8. 前端：`pnpm install && pnpm dev`（3001，`host: 0.0.0.0`，局域网用 `http://<机器IP>:3001`）
9. 浏览器访问前台；本机开发可用 http://localhost:3001，使用 superuser 登录后台

**局域网**：浏览器 Origin 为 `http://<IP>:3001` 时须在 `backend/.env` 配置 `JIANZHAI_PUBLIC_ORIGIN`（或与之一致的 `SITE_PUBLIC_URL`），settings 会自动合并进 `CSRF_TRUSTED_ORIGINS` / `CORS_ALLOWED_ORIGINS` 并将 IP 加入 `ALLOWED_HOSTS`；**修改 `.env` 后必须完全重启 Django**（`.env` 不会被 runserver 热加载）。勿在 `frontend/.env` 将 `VITE_API_BASE_URL` 设为跨机的 `http://localhost:8002/...`（会跨域且 CSRF 仍按页面 Origin 校验）。

---

## 附：环境变量清单

```env
# backend/.env
DEBUG=True
SECRET_KEY=
DATABASE_URL=postgresql://jianzhai:password@localhost:5432/jianzhai
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
MEDIA_ROOT=./media
SITE_PUBLIC_URL=http://localhost:3001
# 局域网：与浏览器地址栏 origin 一致，自动合并 CSRF/CORS（见 settings.py）
# JIANZHAI_PUBLIC_ORIGIN=http://192.168.x.x:3001
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3001
CSRF_TRUSTED_ORIGINS=http://localhost:3001,http://localhost:8002
LANGUAGE_CODE=zh-hans
TIME_ZONE=Asia/Shanghai

# AI 助手（可选）
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_MODEL_DEFAULT=claude-opus-4-7
CLAUDE_MAX_TOKENS=1024
```

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8002/api/v1
VITE_MEDIA_BASE_URL=http://localhost:8002/media
```

---

**文档版本**：v3.2  
**最后更新**：2026-05-29
