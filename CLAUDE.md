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
| 实现阶段 | v0.9.10 + **编辑器追平语雀**（MD 源码改 CodeMirror 6 + Live Preview + 表格单元格染色/悬浮行列/冻结首行列）、**安全复审批次**（六领域加固）、**性能优化 9 Phase**、**Mermaid 离线导出 SVG**、**完整编辑两栏铺满**（叠加 v0.9.9 根管理员、v0.9.8 腾讯云部署 + 友邻闸门、v0.9.7 AI 多供应商、图标体系定稿） |
| 多用户 | 支持。普通账号按 `owner` 隔离；`is_superuser` 跨租户可见；单一**根管理员**（`ROOT_ADMIN_USERNAME`）位于权限顶端，不可被禁用/删除 |
| 博客形态 | 全开放（匿名）或**友邻可见**（`SITE_REQUIRE_LOGIN=true` → 需登录），由 `PublicOrLoginGated` 权限类逐请求判定 |
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
| 认证 | Django Session + DRF SessionAuthentication | 根管理员分级 + 友邻闸门权限类 |
| AI 助手 | `anthropic` SDK（Claude）+ `openai` SDK 兼容模式（通义千问 DashScope） | 多供应商；任一未配置时该供应商优雅降级 |
| 图片处理 | Pillow | 缩略图与元数据 |
| 生产部署 | Docker Compose + Caddy + Gunicorn | 套件在 `infra/`（腾讯云）；`backup.sh` 每日 `pg_dump` |

### 前端（`frontend/package.json`）

| 类别 | 选型 | 备注 |
|---|---|---|
| 框架 | React 18 / TypeScript 5 | |
| 构建 | Vite 5 | |
| UI 库 | Ant Design 5 | |
| 路由 | React Router v6 | |
| 状态 | Zustand | `stores/auth.ts`、`stores/theme.ts` |
| HTTP | Axios | `api/client.ts` 集中封装 |
| 编辑器内核 | **Tiptap 3** (ProseMirror) + **CodeMirror 6**（MD 源码模式） | 富文本(Tiptap) / Markdown(CM6) / HTML(textarea) |
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
| 拖拽 | `tiptap-extension-global-drag-handle` | 编辑器块拖拽 |
| 列表拖拽排序 | `@dnd-kit/core` + `sortable` | 题记列表整行拖拽 |
| 图标 | **自制 SVG 图标库 `JzIcon`（50 枚）+ `JzIconKit`（15 枚设计稿系列）** + AntD icons（主题切换） | 100% 自制覆盖菜单/导航，hugeicons 已卸载 |

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
│   │   ├── accounts/              # 多用户登录 + scoping + 根管理员分级 + 账号自服务
│   │   │   ├── models.py          # HeroSettings（首页名句单例）
│   │   │   ├── permissions.py     # is_root_admin / can_manage_user / PublicOrLoginGated（友邻闸门）
│   │   │   ├── hero.py            # Hero 名句：public 读 / admin CRUD / 批量导入
│   │   │   ├── views.py           # 登录 · me · 改密码/邮箱/用户名/头像 · UserViewSet
│   │   │   └── scoping.py         # scope_queryset
│   │   ├── ai/                    # AI 助手（多供应商代理：Anthropic Claude + 阿里通义千问）
│   │   │   ├── models.py          # AISettings + AIUsageLog + AIPromptTemplate + AIConversation
│   │   │   ├── prompts.py         # 系统 prompt（prompt caching）+ 8 内置操作 + 多轮构造
│   │   │   ├── pricing.py         # 模型价格表（Claude USD + Qwen CNY→USD）+ 花费估算
│   │   │   ├── services.py        # 供应商路由、失败降级链、日预算校验、run_once/stream/chat
│   │   │   ├── views.py           # run/stream/chat/capabilities/settings/usage(+csv)/templates/conversations/estimate
│   │   │   └── urls.py
│   │   ├── knowledge/             # KnowledgeBaseCategory / KnowledgeBase / Folder / Document（置顶/收藏/排序）
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
│       │   │   ├── JzIcon.tsx               # 50 个自制 SVG 图标（首页/编辑器/AI Tab 等）
│       │   │   ├── JzIconKit.tsx            # 15 枚用户设计稿系列（个人空间侧栏专用）
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
│       │   │   ├── AIManagementPage.tsx     # /admin/ai（多供应商 + 模板 + 对话 + 用量热图）
│       │   │   ├── HeroPage.tsx              # /admin/hero 名句轮播管理
│       │   │   ├── ProfilePage.tsx          # /admin/profile 账号自服务（改密码/邮箱/用户名/头像）
│       │   │   ├── TrashPage.tsx            # 回收站 UI
│       │   │   ├── ExportsPage.tsx UsersPage.tsx VersionsDrawer.tsx
│       │   │   ├── KnowledgeGraphPage.tsx SystemOverviewPage.tsx AdminDashboard.tsx
│       │   │   └── LoginPage.tsx RequireAuth.tsx
│       │   ├── blog/              # 公开博客（匿名 / 友邻可见）
│       │   │   ├── BlogLayout.tsx BlogHome.tsx PostDetail.tsx
│       │   │   ├── KBPostsPage.tsx ArchivePage.tsx TagCloudPage.tsx
│       │   ├── FavoritesPage.tsx  # 收藏页（博客 /favorites + 后台 /admin/favorites 共用）
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
| `User` | django.contrib.auth | 多账号；根管理员 = `is_superuser` 且 username == `ROOT_ADMIN_USERNAME`（非 DB 字段，靠 `permissions.is_root_admin` 判定） |
| `HeroSettings` | accounts | **单例**：首页名句轮播（`quotes` JSON：text/dynasty/author/source、`animation`、`rotation_seconds`） |
| `KnowledgeBaseCategory` | knowledge | KB 大类分组（name / accent_color） |
| `KnowledgeBase` | knowledge | 顶层容器（owner / visibility / cover / accent_color / category / doc_sort_mode） |
| `Folder` | knowledge | self-FK 可嵌套 |
| `Document` | knowledge | **含 `version` 乐观并发字段** |
| `DocumentVersion` | versioning | 历史快照（保留 100 个/文档） |
| `DocumentLink` | linking | `@提及` 解析结果（含 context + position） |
| `Tag` | tags | 用户隔离 |
| `DocumentTag / KnowledgeBaseTag / FolderTag` | tags | 三种通过表 |
| `Comment` | comments | `block_id` 区分文档级 / 段落级 |
| `Attachment` | editor | 附件（KIND: image / document / other） |
| `ExportTask` | exporter | 异步导出任务状态机 |
| `AISettings` | ai | **单例**：默认模型 / 主开关 / max_tokens / `enable_thinking` / `daily_budget_usd_per_user` / `fallback_enabled` |
| `AIUsageLog` | ai | 调用审计：用户 / 模型 / token / 耗时 / 成功率 / `document` / `knowledge_base` / `fallback_from` / `prompt_chars` |
| `AIPromptTemplate` | ai | 用户自定义 AI 操作（owner / name / icon / instruction / requires_selection / replace_mode） |
| `AIConversation` | ai | 多轮对话历史（owner / title / `messages` JSON / model / document） |

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

### AISettings + AIUsageLog（v0.9.7 起多供应商）

```python
class AISettings(models.Model):
    """单例。Admin 在 /admin/ai 页设置。"""
    default_model = CharField(max_length=80, default='claude-opus-4-7')  # 可为 Claude 或 Qwen
    enabled = BooleanField(default=True)                 # 主开关
    max_tokens = PositiveIntegerField(default=1024)
    enable_thinking = BooleanField(default=False)        # Claude 4 扩展思考
    daily_budget_usd_per_user = FloatField(default=0.0)  # 0 = 不限；超出 429
    fallback_enabled = BooleanField(default=True)        # 首 token 前失败时自动降级
    updated_at = DateTimeField(auto_now=True)

class AIUsageLog(models.Model):
    """单次调用审计。每次 run_once / run_stream / run_chat_stream 后写一行。"""
    user = FK(User, null=True)
    operation = CharField(max_length=32)           # continue/polish/.../tpl_<id>
    model = CharField(max_length=80)
    streaming = BooleanField()
    input_tokens / output_tokens = PositiveIntegerField()
    duration_ms = PositiveIntegerField()
    succeeded = BooleanField()
    error = CharField(max_length=200, blank=True)
    document / knowledge_base = FK(null=True)      # 成本归因
    fallback_from = CharField(max_length=80, blank=True)  # 降级前的原模型
    prompt_chars = PositiveIntegerField()          # 估算输入用
    created_at = DateTimeField()

# 另：AIPromptTemplate（用户自定义操作）、AIConversation（多轮对话 messages JSON）
```

**供应商路由**（`services.py`）：`AVAILABLE_MODELS` 每项带 `provider`（`anthropic` / `qwen`）；`_provider_for(model)` 选客户端，Qwen 走 DashScope OpenAI 兼容端点（`DASHSCOPE_API_KEY`）。`FALLBACK_CHAIN` 定义降级路径（Opus→Sonnet→Haiku、Max→Plus→Turbo、VL-Max→VL-Plus）。`check_daily_budget(user)` 在调用前校验日预算。

---

## URL 总览

`backend/jianzhai/urls.py` 顶层挂载：

```
/django-admin/                Django admin（/admin 留给前端 SPA；生产由 Caddy 代理 /django-admin/*）
/api/v1/auth/                 登录 / 登出 / CSRF / session(含 require_login) / me / system-info / UserViewSet
/api/v1/auth/me/avatar|change-password|change-email|change-username/   账号自服务
/api/v1/auth/hero/  /hero/batch/   Hero 名句：员工读写 + 批量导入
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
/api/v1/ai/capabilities/      模型列表（含 provider/vision/thinking）+ 各供应商配置状态 + 用户模板
/api/v1/ai/settings/          Admin: GET/PATCH AI 全局设置
/api/v1/ai/usage/  /usage/csv/   用量聚合（按模型/日/操作/KB/文档）+ CSV 导出
/api/v1/ai/run/  /stream/      非流式 / SSE 流式 AI 调用
/api/v1/ai/chat/              多轮对话 SSE 流式
/api/v1/ai/templates/  /templates/{id}/   用户自定义操作模板 CRUD
/api/v1/ai/conversations/  /conversations/{id}/   对话历史 列表/查看/删除
/api/v1/ai/estimate/          token / 花费预览（不真正调用）
/api/v1/public/posts/         公开博客（含 by-id / by-slug / adjacent / backlinks）；受友邻闸门约束
/api/v1/public/kbs/           公开 KB（含 tree）
/api/v1/public/tags/          公开标签云
/api/v1/public/archive/       归档
/api/v1/public/hero/          首页 Hero 名句（匿名精简形态）
/feed.xml                     RSS
```

> **友邻闸门**：所有 `/api/v1/public/*` 经 `PublicOrLoginGated` 权限——`SITE_REQUIRE_LOGIN=false` 时全开放；为 `true` 时未登录返回 403，前端引导登录。

---

## 功能模块清单（含实现状态）

> ✅ 已实现 / 🟡 部分 / 🔲 待实现

### 模块 1：知识库与目录管理 ✅

- 创建 / 重命名 / 删除知识库（**软删除 + 回收站**）
- KB 支持封面、主题色、可见性、排序
- 文件夹多层嵌套
- 树形目录拖拽排序：`POST /tree/reorder/` 批量提交
- 折叠 / 展开状态本地持久化
- KB 大类分组、文档置顶、收藏夹（`FavoritesPage`，后台侧栏「收藏」入口位于知识图谱与导出之间）、多种排序
- **统一上传体系**（个人空间 KBWorkspace + 博客端 KBPostsPage 共用）：文件选择器（单/多选）、文件夹选择器（保留目录结构）、**拖拽混合上传**（多文件 + 多文件夹，`UploadDropZone` 递归遍历 webkitGetAsEntry）；客户端按后端规则预过滤（18 种扩展名 / 50MB / 跳过隐藏文件）；**分片上传**（8 文件/请求，`utils/uploadBatch.ts`，每片完成即刷新列表渐进出现）；导入请求超时独立放宽（单 5min / 批 30min，全局 axios 仍 30s）

### 模块 2：文档与编辑器 ✅

- 文档 CRUD + 软删除
- **三种编辑器并存**：RichTextEditor (Tiptap) / MarkdownEditor (**CodeMirror 6 内核**) / HtmlEditor (textarea)，统一以 Markdown 持久化
- **MD 源码模式（CM6，语雀级体验）**：语法高亮 + 行号 + 当前行；选区浮动格式条（B/I/S/code/U/链接/清除格式，操作后保持可连续叠加）；快捷键 Ctrl+B/I/E/K、Ctrl+Shift+X；回车续列表（-/1./>/任务复位/有序自增）+ 空项退出 + Tab/Shift+Tab 缩进；**表格辅助**（Tab 跳格选内容/末格自动加行/回车加行——仅完整表格的数据行劫持按键，半成品/粘贴不干扰；工具栏「表格 ▾」一键 CJK 宽度对齐格式化 + 行列增删）；数学可视化 Modal（`MathEditorModal` 与富文本共享）；分栏(:::cols-N/::col)/tabs(:::tabs/::tab)/doc-card/footnote 可直接插 MD 源码（`isMarkdownCapable` 判定）；callout 记住上次颜色（Dropdown.Button 主键直插）；选区粘贴 URL 自动成链；@ 不吞键（字面 @ 落档，取消保留——邮箱/@media 转义出口）；斜杠菜单 caret 级定位（coordsAtPos）；Ctrl+/ 快捷键速查面板；**行级双向滚动同步**（markdown-it 注入 data-line 锚点[仅编辑器 env] + 原文↔预处理 lineMap[唯一行锚点+LIS+分段插值]）；预览统一 LivePreviewPane（TOC+共享渲染管道）
- **MD Live Preview（Typora/Obsidian 式就地渲染，可开关）**：`codemirror/extensions/livePreview.ts`——光标外隐藏 **/*/~~/\`/#/[]() 标记符（样式由 HighlightStyle 呈现）、`![]()` 就地缩略图（404 降级源码）、`$..$` 就地 KaTeX（`scanInlineMath` 防货币误识）、链接 Ctrl+点击打开；**当前行整行显源码**策略根除 IME 冲突；Compartment 开关=工具栏眼睛按钮 + localStorage `jz-md-livepreview`（默认开）；光标进表格自动浮出 `TableFloatingBar` 操作条（格式化/插删行列）；浮动格式条含文字颜色
- **富文本表格（语雀级）**：`ColorTableCell/Header` 单元格底色/文字色（CellSelection 批量染色）；表级属性 `maxRows`（最多显示行数→限高滚动）/`density`（紧凑/标准/宽松）/`cellPadV/cellPadH`（自定义行/列间距）—— `ColorTable` 条件序列化 `tableHasCustomStyle`（**带色/带表级样式/不可 GFM 的表输出原生 HTML（含 .jz-table-wrap + data-jz-* + CSS 变量），无色无样式表保持干净 GFM 管道**），roundtrip 经 parseHTML 复原
  - **统一工具条**（`TableOverlay`）：caret 在表内时表格上方弹出美化工具条（结构:全选/合并/拆分/表头 · 样式:底色/文字色/密度含三档+自定义间距/行数 · 删除:删行/列/表），错开表头与 grip（grip 偏移 -22）防重叠；z 分层 grip/±1100 < 工具条 1200 < 下拉 12000；BubbleMenu 表格分支已退役，右键菜单含全选/选行列/密度/行数/颜色
  - **悬浮交互**：悬停出右缘+列/下缘+行按钮、列上缘/行左缘 grip（单击选整行列 / 拖动重排，prosemirror-tables 1.8 自带 moveTableRow/Column）；整表全选 `selectTableAll`（CellSelection 覆盖对角）
  - **关键坑**：resizable 表格用 prosemirror-tables 的 `TableView` nodeView（只拷 `style` attr），**绕过 ColorTable.renderHTML** → 表级 data-jz-*/CSS 变量进不了编辑器 DOM；由 `TableMaxRows` 扩展（同步遍历 doc table 经 `nodeDOM` 写 DOM，非 rAF）+ 阅读端 `TableEnhancer`（测前 N 行高设 maxHeight + data-jz-pad 兜底 setProperty）补齐；密度预设走 `table[data-jz-density]` CSS 属性选择器（纯 CSS，规避 DOMPurify 剥 CSS 变量风险）；docx 导出彩色/间距丢失为已知限制
- **EditorSurface 适配层**（`components/editor/surface/EditorSurface.ts`）：MD(CM)/HTML(textarea) 统一 seek/选区/查找接口，DocEditorPage 与 FindReplacePanel 不再直接摸 textarea；CM 受控策略=回声跳过+外部更新最小 diff（保 undo）；CM6 主题纯 CSS 变量（--jz-*）四主题零订阅跟随；vite manualChunks 拆 codemirror/tiptap 独立 chunk（CM 语言包保持懒加载）
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
- **离线资源**：HTML/PDF 单文件内嵌本地 `/media/` 为 base64；zip 类导出复制到 `assets/` 并重写路径。
- **Mermaid 离线渲染为 SVG**（`services/diagram_render.py`）：HTML / PDF / 静态站导出在生成 HTML 前，用与 PDF 相同的 headless Chromium + 自带 mermaid 包（`static/vendor/mermaid.min.js`，无需 node_modules）把所有 `` ```mermaid `` 块批量渲染为**内联 SVG**（每次导出仅启动一次浏览器）。`render_markdown(text, diagram_svgs=…)` 经 `env` 注入；`collect_mermaid_sources` 用同一分词器取键确保对得上。Playwright/Chromium 缺失或语法错误时，该块优雅降级为「图表源码」面板。PlantUML 仍为源码面板（需独立服务器渲染）。
- Celery `exporter.run_export` 异步；broker 不可达时 create 内联 fallback；前端 `/admin/exports` 轮询 + `downloadExport()`（fetch + blob，避免跨域 cookie 问题）
- 测试：`backend/apps/exporter/tests/`（含 anthology interactive/print、iframe 隔离、HTML 扁平化用例）；PDF 用例在无 Playwright 时 skip

### 模块 9：博客前台 ✅

- 匿名访问；`SITE_REQUIRE_LOGIN=true` 时切「友邻可见」需登录（见模块 16）
- 首页（KB 网格 + 「藏经阁」hero + Hero 名句轮播，见模块 15）/ KB 浏览（树形目录）/ 文章详情（TOC + 相邻文章 + 反链）/ 归档 / 标签云 / RSS
- 多套主题与「纸张」背景（编辑器与阅读端共用 `paper_style`）
- 暗 / 亮主题切换；4 套主题：`light` / `dark` / `starry` / `deepsea`

### 模块 10：附件与媒体管理 ✅

`MultiPartParser`，路径 `MEDIA_ROOT/uploads/{YYYY}/{MM}/{uuid}.{ext}`，三类型：`image` / `document` / `other`；媒体库浏览删除；附件预览（`PdfCanvas` / `FilePreview` / `AttachmentInlinePreview`）。

### 模块 11：知识图谱 ✅

`GET /api/v1/links/graph/` 返回节点+边 → `KnowledgeGraphPage` 用 `react-force-graph-2d` 渲染；按 KB 着色 / 过滤。

### 模块 12：多用户与权限 ✅（v0.9.9 根管理员 + 账号自服务）

- `accounts.UserViewSet` 管理；session + CSRF；`apps/accounts/scoping.py` 隔离。
- **权限分级**（`apps/accounts/permissions.py`）：
  - **根管理员** `is_root_admin(user)` = `is_superuser` 且 username == `ROOT_ADMIN_USERNAME`；只有根可禁用/降权/重置**其他超管**，且根本身不可被禁用/删除。
  - `can_manage_user(actor, target)` 统一裁决：非根员工不能动超管/彼此；禁止自我降权/自禁用。
  - 权限类 `IsStaffUser` / `IsSuperUser` / `PublicOrLoginGated`（友邻闸门）。
- **邮箱必填**：`UserSerializer.email` 在新建时 `required=True, allow_blank=False`（已有账号仍可 PATCH 留空）。
- **账号自服务**（均需登录，校验当前密码）：`POST /auth/me/change-password|change-email|change-username/` + `/auth/me/avatar/`；`me` 返回 `is_root`。前端 `ProfilePage` 提供改密码/邮箱/用户名/头像 Tab。

### 模块 13：AI 助手 ✅（v0.9.7 多供应商全面增强）

**架构**：前端永不持有 API key，所有调用走 `apps/ai/` 后端代理。

```
浏览器 ──/ai/stream|chat──► Django ──路由 provider──► Anthropic Claude SDK
       ◄──SSE: data:{"delta":"…"}──         └────────► DashScope（通义千问 · OpenAI 兼容）
```

**模型路由 / 多供应商**：
- 用户偏好存 localStorage (`jz-ai-model`)，每次调用带 `model` 字段
- `AVAILABLE_MODELS` 白名单：**Claude** Opus 4.7（默认）/ Sonnet 4.6 / Haiku 4.5 + **通义千问** Max / Plus / Turbo / VL-Max / VL-Plus；每项带 `provider`/`vision`/`thinking`
- `provider_configured()` 独立检查 `ANTHROPIC_API_KEY` 与 `DASHSCOPE_API_KEY`；`/ai/capabilities` 回传各供应商配置状态，前端卡片分别显示
- Admin 在 `/admin/ai` 设全局默认 + 主开关 + `max_tokens` + 扩展思考 + 每用户日预算 + 失败降级开关

**操作集**：8 内置（续写 / 润色 / 扩写 / 纠错 / 总结 / 大纲 / 中英互译，`prompts.py`）+ 用户**自定义模板**（`AIPromptTemplate`，操作 id 形如 `tpl_<id>`，并入 capabilities）。

**进阶能力**：
- **多轮对话**（`/ai/chat/` + `AIConversation`，messages JSON，UI 上限 50 轮）
- **视觉输入**：`images`（`data:image/*;base64`）传给 Claude / Qwen-VL
- **扩展思考**：`enable_thinking=True` 且模型支持时分配 `max_tokens//2` 思考预算
- **失败降级**：首 token 前异常按 `FALLBACK_CHAIN` 自动降级，记 `fallback_from`
- **日预算**：`check_daily_budget(user)` 超额 429；`pricing.py` 估算花费（Claude USD + Qwen CNY→USD）
- **Prompt caching**：系统 prompt 标 `cache_control: ephemeral`（Anthropic）

**用量追踪**：每次调用写一行 `AIUsageLog`（token / 耗时 / 成功率 / 文档 / KB / 降级）；`/admin/ai` 用量 Tab 按日聚合 + 按模型/操作/KB 分组 + GitHub 风格日历热图 + CSV 导出。

**前端入口**（所有编辑模式 + 阅读端）：编辑器工具栏 `AIAssistantMenu`（含模型切换）、选区 `SelectionAI`（✨）、右下角 `DocAIPanel`（🤖 抽屉）、斜杠 `/ai`、顶栏 `AIModelBadge`；AI 输出**实时 Markdown 渲染**。

**限流**：30 req/min/user (`UserRateThrottle` scope=`ai_write`)。

### 模块 14：视觉系统 ✅（新）

- **后台风格**：「Apple 玄黑·玻璃拟态」+ 翡翠 #10b981 重音，作用域 `.jz-admin-glass`
  - light / dark / starry / deepsea 全部适配（亮玻璃 vs 暗玻璃自动切换）
  - 大圆角 14-18px + 颜色偏移柔阴影 + backdrop-filter blur
  - 翡翠胶囊菜单 active 态 + 印章 logo
- **博客风格**：宣纸 #f3ebd6 + 朱砂 #b94a3b 古风，保留 v0.5 之前主调
- **图标体系（2026-06-06 定稿，100% 自制，hugeicons 已卸载）— 三个区域三种语言**：
  - **个人空间侧栏** = `JzIconKit.tsx`（15 枚，用户设计稿 SVG 生成）：全员 0.72 淡染填充、**无底座裸放**（40px 占位 + 悬停微放大）；**同明度多彩 tone**（`jz-ico-tone-*` 十色「简斋雅色」+ 暗主题提亮 + starry/deepsea 环境光校准）；尺寸逐枚微调（常规 23 / AI 25 / 用户管理 31 / 个人资料 28 / 回收站 21 + viewBox 裁框）；工作台快捷入口与最近知识库卡同语言（裸放 + 专属色）
  - **博客顶栏** = 最初版 v0.9 浅染族（`JzIcon.tsx`）：归档/标签/搜索/RSS 走 `--jz-icon-fill/spot` 主题变量 + 翡翠 hover，保留圆角方块底座 + 光泽扫过；登录 JzUserIcon 玄青 tone
  - **主题切换四枚** = AntD Sun/Moon/Star + 手写 WaveIcon（设计稿版已否决回退）
- **自制 SVG 图标库** `JzIcon.tsx`（50 枚）：24×24 / 1.5px stroke / `currentColor`；印泥色彩点 + `--jz-icon-accent-active` hover/选中染色发光；覆盖首页 / AI Tab / 编辑器 sidebar / PostDetail 等
- **后台侧栏**：含「收藏」入口（缃金星形 + tone 色，知识图谱与导出之间）
- **Favicon**：朱砂印章 SVG（径向渐变印泥 + 颗粒滤镜 + 四角磨痕 + 双线印框 + 压痕「簡」）
- **PWA**：`manifest.webmanifest` + apple-touch-icon + theme-color
- **白边修复**：`html / body / #root` 全局 reset margin/padding，铺满整屏

### 模块 15：首页题记（Hero 名句轮播）✅（v0.9.5，v0.9.10 增强）

- 单例 `HeroSettings`（`apps/accounts/models.py`）：`quotes` JSON（每条 text / dynasty / author / source）、`animation`（fade / slide / typewriter / ink-wash）、`play_order`（**random 默认** / sequential，迁移 0005）、`rotation_seconds`、`enabled`。
- 端点（`apps/accounts/hero.py`）：`GET /public/hero/`（匿名精简，含 `play_order`）、`GET|PATCH /auth/hero/`（员工读写）、`POST /auth/hero/batch/`（批量导入，`replace` / `append`）。
- 批量解析：强分隔（`—`/`–`/`-`/` by `）优先于弱分隔（`·`/`•`），中文「苏轼 · 定风波」不被拆错；行首 `[朝代]〔朝代〕【朝代】(朝代)` 识别为朝代前缀。
- 前端：`/admin/hero`（员工，菜单/标题名「**题记**」）管理页 + 博客首页轮播渲染；古风单行三色 `〔朝代〕作者〈篇名〉` + 「」角标 + 卷尾金线。
- **随机播放**（v0.9.10）：`utils/heroPlayback.ts` 的 `buildPlayOrder`（Fisher-Yates）——random 模式每次页面打开重新洗牌，整轮不重复；**悬停暂停**轮播、**点击切下一条**（`.jz-hero-rotator-shell`）。
- **管理页**（v0.9.10）：题记列表 **dnd-kit 整行拖拽排序**（把手列 ⠿，替代上移/下移）；预览卡 ‹ › 翻看任意条；「导出」Modal 反向生成批量导入格式文本（复制 / 下载 .txt，`quotesToBatchText`）；宣纸纹理预览框 + 水墨光晕美化。

### 模块 16：友邻闸门 + 生产部署 ✅（v0.9.8）

- **友邻可见**：`SITE_REQUIRE_LOGIN`（settings）+ `PublicOrLoginGated` 权限类（逐请求判定）。`true` → 全部 `/public/*` 需登录；`session` 端点回传 `require_login` 供前端 `BlogLayout` 引导登录。
- **腾讯云部署套件** `infra/`：`backend.Dockerfile`（Gunicorn）、`frontend.Dockerfile`、`docker-compose.prod.yml`（caddy + backend + celery + postgres + redis + backup）、`Caddyfile`（HTTPS 反代 + SPA fallback）、`deploy.sh`、`backup.sh`（每日 `pg_dump`）、`.env.example.prod`、`README.md`（含域名/备案/DNS 指南）。

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

1. **Tiptap Markdown 互转保真度** — 带单元格底色/表级样式/不可 GFM 的表会条件序列化为原生 HTML（含 `.jz-table-wrap` + `data-jz-*` + CSS 变量）以保真，无色无样式表仍走干净 GFM 管道；复杂合并单元格、docx 导出的彩色/间距仍可能丢失。
2. **双向链接** — `linking/tasks.py` 仅接受**同 owner** 且未软删的目标文档；`sync_document_links` 对源文档 `select_for_update` 并把锁结果**赋值给本地变量**（v0.9.2 修复了"取了锁就丢"导致的并发争用），bulk_create 完整运行在 atomic 块内。保存后 Celery 异步解析 `raw_content`。
3. **乐观并发** — PATCH / 发布版 PATCH / `publish` / `unpublish` 均可带 `expected_version`；序列化器在事务内 `select_for_update` 校验；冲突返回 409 + 最新文档快照。
4. **大文档性能** — 编辑器 10k+ 字时仍流畅，但建议未来对超长文档启用 Tiptap lazy rendering。
5. **PDF 导出资源** — Playwright 单次启动约 200MB；Celery 串行处理。`pip install -e .[pdf]` + `playwright install chromium`。
6. **PG 中文搜索** — `tsvector` 不支持中文分词，写入和查询两端都用 jieba；升级索引逻辑后需 `reindex_search`。
7. **超级用户跨租户可见** — `scope_queryset` 对 superuser 不过滤；多账号时小心 staff 误操作。
8. **AI Token 成本** — 默认 `claude-opus-4-7`；控成本可在 `/admin/ai` 切 Haiku 或调低 `max_tokens`（已对接运行时）。
9. **Vite dev 缓存 desync（编辑器崩溃陷阱）** — 长跑的 dev server（systemd `jianzhai-frontend.service`）与**第二个 vite/vitest 实例**若共用 `node_modules/.vite`，第二实例会以新 `browserHash` 重新预打包进同一目录，而主 server 仍在内存服旧 hash → 编辑器分片懒加载拉到不一致模块副本，**完整编辑**抛 `@codemirror/state multiple instances`、**编辑**抛 `Cannot read properties of null (reading 'useRef')`（React 解析为 null）。这**不是**代码/配置 bug（`vite.config` 的 `dedupe`/`optimizeDeps`/`manualChunks` 仍正确）。防护：并行验证实例（设了 `JZ_API_PROXY_TARGET`）走独立 `cacheDir: node_modules/.vite-verify`（已在 `vite.config.ts`）。**复现时根治**：`systemctl restart jianzhai-frontend.service` + 浏览器 hard-reload（Ctrl+Shift+R 清客户端旧 hash）。**切勿**在主 dev server 运行时于同一 `frontend/` 目录另起共用缓存的 vite/vitest——验证请用带 `JZ_API_PROXY_TARGET` 的实例或独立 node_modules 的 worktree。

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
| **v0.9.3 HTML/Mermaid 体验 + 安全下载** | HtmlPostReader 懒加载 + 异步元数据 + sessionStorage LRU；renderMarkdownWithToc 模块级 LRU；Mermaid 全屏 Modal（滚轮缩放/拖拽/下载 PNG）；编辑器加全屏按钮；Mermaid 四主题适配（diagram surface 派生色 + 不透明 edgeLabel）；工具栏 hover 染色 + 胶囊缩放按钮；downloadExport 抛弃 fetch+blob 改原生 a href（消除 Chrome 不安全下载警告）；新 `pnpm dev:https` 用 @vitejs/plugin-basic-ssl 解决 LAN IP HTTP 下载告警；AI 用量日历热图（GitHub 风格 SVG + USD 估算）；apps/ai/pricing.py 模型价格表；重写开发指南 simple/detailed 两篇到 v0.9.3 真实状态；11 个新测试 | ✅ |
| **v0.9.5 Hero + 组织** | 首页 Hero 名句轮播（朝代/作者/篇名 + fade/slide/typewriter/ink-wash 四动画 + 批量导入 + `/admin/hero`）；KB 大类分组、文档置顶、收藏夹、多种排序；回收站 UI；快速捕获 | ✅ |
| **v0.9.7 AI 全面增强** | 多供应商（Anthropic Claude + 阿里通义千问，provider 路由 + 各自配置状态）；自定义操作模板；多轮对话；视觉图片输入；扩展思考；每用户日预算（429）；失败自动降级链；prompt caching；用量按 KB/文档归因 + CSV；AI 输出实时 Markdown 渲染；22 项优化 | ✅ |
| **v0.9.8 部署 + 友邻闸门** | 腾讯云部署套件 `infra/`（Dockerfile + docker-compose.prod + Caddy HTTPS 反代 + deploy/backup.sh + 部署指南）；`SITE_REQUIRE_LOGIN` 友邻可见博客闸门（`PublicOrLoginGated`） | ✅ |
| **v0.9.9 账号体系** | 根管理员分级（`ROOT_ADMIN_USERNAME`，不可被禁用/删除，统一 `can_manage_user` 裁决）；新建账号邮箱必填；用户自助改密码/邮箱/用户名/头像；KB 上传实时进度条 + 批量全选 + 可视化颜色选择器 | ✅ |
| **v0.9.10 题记增强** | 播放顺序可配置（random 默认洗牌 / sequential）；悬停暂停 + 点击切换；题记列表 dnd-kit 拖拽排序；导出备份文本；首页 + 管理页样式打磨；「首页题记」改名「题记」 | ✅ |
| **图标体系定稿**（v0.9.10 后续） | 三区三语言：侧栏接入用户设计稿 `JzIconKit`（15 枚淡染裸放 + tone 十色）；博客顶栏回归最初版浅染族；主题四枚回 AntD；工作台快捷入口/最近 KB 卡同语言；侧栏新增「收藏」入口；PostDetail 等全部换自制图标，卸载 hugeicons | ✅ |
| **MD 编辑器换 CM6**（2026-06-07） | MD 源码模式 textarea → **CodeMirror 6**（语雀级：语法高亮/行号/浮动格式条/智能续列表/表格辅助/数学 Modal/行级双向滚动同步/斜杠补块）；`EditorSurface` 适配层统一 MD(CM)/HTML(textarea) seek/选区/查找；vite `manualChunks` 拆 codemirror/tiptap 独立 chunk；坑：lang-markdown 懒加载致 dev 下 `@codemirror/state` 多实例 → `resolve.dedupe` + `optimizeDeps.include` 根治 | ✅ |
| **追赶语雀第二批**（2026-06-07） | 富文本表格**单元格底色/文字色**（CellSelection 批量染色）+ 条件 HTML 序列化（无色无样式保持干净 GFM 管道）；悬浮行列增删按钮 + grip 单击选行列/拖动重排（pm-tables 自带 moveTableRow/Column）；**MD Live Preview**（Typora/Obsidian 式就地渲染，当前行显源码根除 IME 冲突）；表格浮动操作条 `TableFloatingBar` | ✅ |
| **安全复审批次**（2026-06-07） | 六领域复审修复合并 main（a72e516）：TLS 条件硬化、友邻闸门加固、`raw_content` 泄漏封堵、AI 预算**调用前预留**、iframe 去同源；deploy-tencent 两提交 cherry-pick 进 main；遗留 media 鉴权待办 | ✅ |
| **编辑器高危修复 + 表格保真**（2026-06-07） | 表格**冻结首行/首列**（编辑器/阅读/导出三端 sticky）；`convertLayoutBlocks` 根治 callout 劫持 details/cols/tabs + `::col` 不可解析；`.jz-table-wrap` 滚动容器（预处理/md/导出三路包裹）修宽长表被古书题签 `overflow:hidden` 裁切；Mermaid 净化修复（DOMPurify 剥 foreignObject 致无字 + dy 被剥似删除线 → `htmlLabels:false` + allowlist + 实时跟随四主题） | ✅ |
| **性能优化 9 Phase**（2026-06-08） | defer 大正文字段（列表/树/版本/博客/搜索）；软删复合索引；消除 N+1；AISettings 单例缓存 + 预算 DB 聚合；公开聚合接口缓存 + 持久连接健康检查；懒加载 pdfjs+mammoth（DocAIPanel chunk 2.25MB→660KB）；getCapabilities 并发去重；富文本打字防抖 + 滚动同步；静态站流式写盘；255+275 测试绿 | ✅ |
| **布局 + 导出保真**（2026-06-08） | **完整编辑两栏铺满**（≥1280 editor flex:1、大纲改流内 sticky 右栏、正文限宽 860 居中，去 body 内联 flexDirection 放行 row）；**Mermaid 离线导出 SVG**（HTML/PDF/静态站用 headless Chromium + vendored mermaid.min.js 渲为内联 SVG，每次导出仅启动一次浏览器，缺失/语法错误优雅降级源码面板）；图表操作条按钮去玻璃底修复亮色页灰字 | ✅ |
| **v1.0 候选** | 增量自动保存 / Tiptap lazy rendering / 超大 KB 树分页 / Yjs 协作 | 🔲 |

---

## 开发起步建议

1. 复制 `.env.example` 为 `.env`，配置 DB / Redis / SECRET_KEY
2. `docker compose up -d` 启动 Postgres + Redis
3. 后端：`pip install -e .[dev]` + `python manage.py migrate` + `createsuperuser`
4. （可选）启用 AI：`pip install anthropic` + 在 `.env` 加 `ANTHROPIC_API_KEY`；通义千问加 `DASHSCOPE_API_KEY`（OpenAI 兼容，无需额外依赖）。`createsuperuser` 时用户名设为 `JIANZHAI_ROOT_ADMIN_USERNAME` 即为根管理员
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

# 账号 / 博客形态（v0.9.8–0.9.9）
JIANZHAI_ROOT_ADMIN_USERNAME=fengfujiang   # 根管理员账号（不可被禁用/删除）
SITE_REQUIRE_LOGIN=False                    # True = 友邻可见（匿名访客需登录）

# AI 助手（可选 · 多供应商，任配其一即可）
ANTHROPIC_API_KEY=sk-ant-api03-...          # Anthropic Claude
DASHSCOPE_API_KEY=sk-...                     # 阿里通义千问（DashScope OpenAI 兼容）
CLAUDE_MODEL_DEFAULT=claude-opus-4-7
CLAUDE_MAX_TOKENS=1024
```

> 生产部署见 `infra/.env.example.prod`（域名、HTTPS、备份等）。

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8002/api/v1
VITE_MEDIA_BASE_URL=http://localhost:8002/media
```

---

**文档版本**：v3.12（对应实现 v0.9.10 + 编辑器换 CM6 / 追赶语雀 / 安全复审 / 性能 9 Phase / Mermaid 导出 SVG / 两栏铺满）  
**最后更新**：2026-06-08
