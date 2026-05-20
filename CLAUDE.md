# 简斋 / JianZhai - 开发指导文档

> 个人知识库 + 个人博客一体化系统
> 本文档作为 AI 编程助手（Cursor / Claude Code）的开发指南，反映当前实现的真实状态，并保留原始设计意图与风险说明。

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
| 实现阶段 | v0.1 – v0.5 主要功能均已落地，进入打磨期 |
| 多用户 | 支持。普通账号按 `owner` 隔离数据；`is_superuser` 跨租户可见 |

---

## 技术栈

### 后端（实际依赖见 `backend/pyproject.toml`）

| 类别 | 选型 | 版本 / 说明 |
|---|---|---|
| 语言 | Python | 3.12 |
| Web 框架 | Django | 5.2 |
| API 框架 | Django REST Framework | 3.15+ |
| 数据库 | PostgreSQL | 14+（psycopg 3） |
| 缓存 / 队列 | Redis | 5+（`django-redis`） |
| 异步任务 | Celery | 5.4+ |
| 全文搜索 | PostgreSQL `tsvector` + jieba | 写入前用 jieba 切词，存入 `search_vector` |
| PDF 导出 | Playwright（headless Chromium） | 通过 `pdf` 可选依赖安装 |
| Markdown 解析 | `markdown-it-py` + `mdit-py-plugins` | 链接解析、HTML 渲染 |
| Word 导出 | `python-docx` | Markdown AST → docx |
| 静态站打包 | Jinja2 + `apps/exporter/services/static_site.py` | 生成可独立部署的 zip |
| 认证 | Django Session 认证 | 多账号 + DRF SessionAuthentication |
| 文件存储 | 本地文件系统 | `Attachment.file` + UUID 路径 |
| 图片处理 | Pillow | 缩略图与元数据 |
| 测试 | pytest + pytest-django | |

### 前端（实际依赖见 `frontend/package.json`）

| 类别 | 选型 | 说明 |
|---|---|---|
| 框架 | React | 18.3 |
| 构建工具 | Vite | 5.4 |
| 语言 | TypeScript | 5.6 |
| UI 组件库 | Ant Design 5 | |
| 路由 | React Router v6 | |
| 状态管理 | Zustand | `stores/auth.ts`、`stores/theme.ts` |
| HTTP 客户端 | Axios | `api/client.ts` 封装 |
| 编辑器内核 | **Tiptap 3** (ProseMirror) | 富文本 / Markdown / HTML 三种编辑器并存 |
| Markdown 渲染 | `markdown-it` + 一系列插件（container/mark/sub/sup/task-lists） | |
| 富文本 ↔ Markdown | `tiptap-markdown` | 底层存 Markdown |
| 代码高亮 | `lowlight` + `highlight.js` | |
| 数学公式 | KaTeX | |
| 流程图 | Mermaid 11 + **PlantUML**（`plantuml-encoder`） | 自定义 Tiptap 节点 |
| 知识图谱 | `react-force-graph-2d` | 全局文档关系可视化 |
| PDF 预览 | `pdfjs-dist` | 附件内联预览 |
| Word 导入 | `mammoth` | docx → HTML/Markdown |
| Diff | `diff-match-patch` + 自渲染 | 版本对比 |
| 安全 | `dompurify` | 公开端 HTML 净化 |
| 拖拽 | `tiptap-extension-global-drag-handle` | 块拖拽手柄 |
| 图标 | `@ant-design/icons` | |

### 开发与部署

| 类别 | 工具 |
|---|---|
| 包管理 (Python) | `uv` / `venv`，依赖声明在 `pyproject.toml` |
| 包管理 (前端) | `pnpm` 9.12 |
| 格式化 | Black + isort + Ruff (Python)，Prettier (TS) |
| 容器 | `docker-compose.yml`（postgres + redis） |

---

## 项目目录结构（实际）

```
jianzhai/
├── backend/
│   ├── manage.py
│   ├── pyproject.toml
│   ├── .env / .env.example
│   ├── jianzhai/              # Django 项目配置
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── celery.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── apps/
│   │   ├── accounts/          # 多用户 + 登录会话 + scoping 共享工具
│   │   ├── knowledge/         # KnowledgeBase / Folder / Document
│   │   ├── editor/            # 附件、文件上传、Markdown/Word 导入
│   │   ├── versioning/        # DocumentVersion + diff + 回滚
│   │   ├── linking/           # 双向链接（解析 + 反向链接 + 知识图谱）
│   │   ├── search/            # tsvector + jieba + management 命令
│   │   ├── exporter/          # 异步导出（services/ 下分格式实现）
│   │   ├── comments/          # 文档级 + 段落级评论
│   │   ├── tags/              # 标签（可挂在 KB / Folder / Document）
│   │   └── blog/              # 公开博客 API + RSS
│   ├── media/                 # 用户上传（按 YYYY/MM/<uuid>.<ext> 分桶）
│   ├── exports/               # 导出产物
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .env / .env.example
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/               # 按资源拆分的 axios 客户端
│       │   ├── client.ts admin.ts archive.ts attachments.ts auth.ts
│       │   ├── blog.ts comments.ts docs.ts exports.ts folders.ts
│       │   ├── graph.ts kbs.ts linking.ts search.ts tags.ts
│       │   ├── users.ts versions.ts
│       ├── components/
│       │   ├── editor/        # Tiptap 编辑器（富文本/Markdown/HTML）+ 扩展
│       │   ├── tree/          # 知识库树形目录
│       │   ├── diff/          # 版本对比
│       │   ├── admin/         # 管理端可视化（如 ArchitectureSVG）
│       │   └── common/        # 搜索、附件预览、目录、TOC、主题切换等
│       ├── pages/
│       │   ├── admin/         # 后台：登录、KB 列表、工作区、编辑、
│       │   │                  # 导出、版本抽屉、用户、知识图谱、系统总览
│       │   ├── blog/          # 博客：首页、文章详情、归档、标签云、KB 浏览
│       │   └── DocLinkResolver.tsx
│       ├── stores/            # auth、theme
│       ├── hooks/
│       ├── types/             # 类型 + 第三方库声明（plantuml/tiptap-markdown）
│       ├── utils/             # markdown / mermaid / plantuml / paper / 字体等
│       └── styles/            # tiptap.css + 多套主题 / 阅读样式 CSS
├── docker-compose.yml
├── Test.html                  # 设计概念稿
├── README.md
└── .gitignore
```

---

## 数据模型设计（与实现一致）

### 核心模型清单

| 模型 | App | 说明 |
|---|---|---|
| `User` | django.contrib.auth | Django 内建 User，多账号 |
| `KnowledgeBase` | knowledge | 知识库（顶层容器） |
| `Folder` | knowledge | 文件夹，self-FK 可嵌套 |
| `Document` | knowledge | 文档（核心） |
| `DocumentVersion` | versioning | 文档历史快照（每文档保留最近 100 个） |
| `DocumentLink` | linking | `@提及` 解析后的链接关系（去重到 source/target/position） |
| `Tag` | tags | 标签 |
| `DocumentTag` / `KnowledgeBaseTag` / `FolderTag` | tags | 三种通过表，标签可挂在 KB / Folder / Document |
| `Comment` | comments | 评论（`block_id` 区分文档级 / 段落级） |
| `Attachment` | editor | 附件（KIND: image/document/other） |
| `ExportTask` | exporter | 导出任务（scope × format 状态机） |

### 通用模式

- **软删除**：`KnowledgeBase` / `Folder` / `Document` 均含 `is_deleted` + `deleted_at`，配合 `SoftDeleteManager`（默认排除已删）与 `all_objects`（包含已删）。`Folder.soft_delete()` 会级联软删子文件夹与文档。
- **唯一性**：`UniqueConstraint(..., condition=Q(is_deleted=False))` 保证 slug 在「未删除」范围内唯一，回收站不冲突。
- **多租户隔离**：`apps/accounts/scoping.py` 的 `scope_queryset(qs, user)`——匿名 → 空集；超级用户 → 不过滤；其他用户 → `filter(owner=user)`（或 `knowledge_base__owner=user`）。所有 viewset 都走它。

### Document 关键字段

```python
class Document(models.Model):
    knowledge_base = ForeignKey(KnowledgeBase)
    folder = ForeignKey(Folder, null=True, blank=True)   # null = KB 根目录

    title = CharField(max_length=200)
    slug = SlugField(max_length=220, allow_unicode=True)  # 在「同 KB + 未删除」内唯一

    # 双内容字段（核心设计）
    raw_content = TextField(blank=True)                   # 原始笔记（Markdown）
    published_content = TextField(blank=True)             # 发布版本（Markdown）

    status = CharField(choices=['draft', 'published'])
    visibility = CharField(choices=['private', 'public']) # 是否进入博客前台

    paper_style = CharField(max_length=40, blank=True)    # 博客阅读端纸张样式预设
    search_vector = SearchVectorField(null=True)          # PG 全文搜索

    order = IntegerField(default=0)
    is_deleted / deleted_at
    created_at / updated_at / published_at

    class Meta:
        indexes = [
            GinIndex(fields=['search_vector']),
            Index(fields=['knowledge_base', 'folder']),
            Index(fields=['visibility', 'status', '-published_at']),
        ]
```

`publish()` / `unpublish()` 方法封装了「拷贝 raw → published」和状态切换；首次发布时记录 `published_at`。

### KnowledgeBase 关键字段

```python
class KnowledgeBase(models.Model):
    owner = ForeignKey(User)
    name / slug
    description = TextField(blank=True)
    cover_image = CharField(max_length=500, blank=True)   # 封面 URL
    accent_color = CharField(max_length=20, blank=True)   # 主题色 "#1677ff"
    visibility = CharField(choices=['private', 'public'])
    order = IntegerField(default=0)
    is_deleted / deleted_at / created_at / updated_at
```

### 双向链接

```python
class DocumentLink(models.Model):
    source = FK(Document, related_name='outgoing_links')
    target = FK(Document, related_name='incoming_links')
    context = TextField()       # 引用处上下文（用于反向链接展示）
    position = IntegerField()   # 在 source.raw_content 中的字符偏移
    unique_together = ('source', 'target', 'position')
```

链接维护：`apps/linking/parser.py` 解析 `@[标题](doc:ID)` 语法；`apps/linking/signals.py` 在文档保存时同步更新 `DocumentLink` 表；删除文档前由前端 / 后端检查反向链接并提示。

### DocumentVersion

```python
class DocumentVersion(models.Model):
    document = FK(Document)
    content = TextField()
    message = CharField(max_length=300, blank=True)
    word_count = IntegerField()     # CJK 单字 + 字母数字 token
    created_by = FK(User, null=True)
    created_at = DateTimeField()
```

`create_snapshot(document, content, message, created_by)` 是入口；每次插入后会自动裁剪超过 `VERSION_HISTORY_LIMIT=100` 的旧版本。

### Attachment（上传）

```python
class Attachment(models.Model):
    document = FK(Document, null=True)         # 可独立于文档存在（媒体库）
    uploaded_by = FK(User, null=True)
    file = FileField(upload_to='uploads/YYYY/MM/<uuid>.<ext>')
    original_filename = CharField(max_length=255)
    kind = CharField(choices=[image|document|other])
    mime_type / size / created_at
```

---

## URL 总览

`backend/jianzhai/urls.py` 顶层挂载：

```
/admin/                  Django admin
/api/v1/auth/            登录、登出、CSRF、session、system-info、UserViewSet（管理员）
/api/v1/kbs|folders|documents/   knowledge 模型 CRUD（DRF Router）
/api/v1/tree/reorder/    批量调整节点排序与父子关系
/api/v1/uploads/         附件上传
/api/v1/imports/         Word/Markdown 文件单/批量导入为文档
/api/v1/attachments/     媒体库
/api/v1/documents/{id}/attachments/
/api/v1/documents/{id}/backlinks/
/api/v1/documents/{id}/versions/      （含 diff / restore 子路径）
/api/v1/documents/{id}/comments/
/api/v1/documents/{id}/tags/
/api/v1/kbs/{id}/tags/
/api/v1/folders/{id}/tags/
/api/v1/links/graph/     知识图谱
/api/v1/search/          全文搜索
/api/v1/exports/         异步导出任务（含 download/）
/api/v1/tags/            标签 CRUD
/api/v1/public/tags/     公开标签云
/api/v1/public/posts/    公开博客列表 / by-id / by-slug / adjacent / backlinks
/api/v1/public/kbs/      公开知识库列表 / tree
/api/v1/public/archive/  归档
/feed.xml                RSS
```

---

## 功能需求清单（含实现状态）

> ✅ 已实现 / 🟡 部分实现 / 🔲 待实现

### 模块 1：知识库与目录管理 ✅

- 创建 / 重命名 / 删除知识库（**软删除 + 回收站**，可通过 `all_objects` 查询已删）
- KB 支持封面、主题色、可见性、排序
- 文件夹多层嵌套（无层级硬限制，前端做合理 UX 限制）
- 树形目录拖拽排序（同级 + 跨级），通过 `POST /tree/reorder/` 批量提交
- 折叠 / 展开状态在前端本地持久化

### 模块 2：文档与编辑器 ✅

- 文档 CRUD + 软删除
- 编辑器有三种实现：**RichTextEditor**（Tiptap 富文本）/ **MarkdownEditor**（纯 Markdown）/ **HtmlEditor**（HTML 源码），底层统一以 Markdown 形式持久化
- 编辑器功能：
  - 基础排版：H1–H6、加粗 / 斜体 / 下划线 / 删除线、引用、有序 / 无序 / 任务列表
  - 代码：行内 + 代码块（lowlight 语法高亮）
  - 表格：增删行列
  - 媒体：图片上传（拖拽 + 粘贴 + 裁剪），附件上传，视频嵌入（自定义 `VideoEmbed` 节点）
  - 数学公式（KaTeX）、Mermaid、**PlantUML**、Callout 块（提示 / 警告 / 信息）
  - **`/` 命令**：`slashCommand.ts` + `SlashCommandList.tsx`
  - 块级拖拽手柄（`tiptap-extension-global-drag-handle`）
  - **`@` 提及双向链接**：`MentionPicker.tsx`，跨知识库可选
  - 批注 Mark（`AnnotationMark.ts`）
  - 查找替换面板（`FindReplacePanel.tsx`）
  - 文档大纲（`DocumentOutline.tsx`）
- 自动保存（前端定时写 `raw_content`）+ 手动发布 + 单独修改发布版本 + 撤回发布
- 文档元信息侧栏（标签、可见性、纸张样式 `paper_style`）

附加（超出原始设计）：

- `/api/v1/imports/` 与 `/api/v1/imports/batch/` 接受 `.md` / `.docx` / `.txt` / `.html`，可保留目录路径，自动建文件夹

### 模块 3：历史版本 ✅

- 主动「保存版本」生成 `DocumentVersion` 快照（带 `message`）
- 版本列表 + 字数变化
- 任意两版本 diff（行级 + 字符级；前端 `diff-match-patch`）
- 回滚作为新版本入栈
- 每文档保留最近 100 个版本（`VERSION_HISTORY_LIMIT`）

### 模块 4：双向链接 ✅

- `@` 触发文档搜索器（`MentionPicker`），插入 `@[标题](doc:{id})`
- 跨知识库引用允许
- 文档底部反向链接区（`BacklinkPanel.tsx`，调用 `/documents/{id}/backlinks/`）
- 删除文档时由前端检测反向引用并提示

### 模块 5：标签系统 ✅（功能扩展）

- 标签 CRUD（按用户隔离）
- **可挂在 Document / KnowledgeBase / Folder**（原始设计只覆盖 Document）
- 按标签筛选文档：`GET /documents/?tags=...`
- 标签云页（前端 `TagCloudPage.tsx`，公开端 `/api/v1/public/tags/`）

### 模块 6：评论 ✅

- 文档级评论 + 段落级评论（通过 `block_id` 定位渲染节点）
- Markdown 内容
- 单用户场景自动通过审核

### 模块 7：全文搜索 ✅

- 顶部 `GlobalSearch.tsx`（`Cmd+K` / `Ctrl+K` 快捷键）
- 搜索范围：标题 + 正文 + 标签名 + 评论
- jieba 切词 + PostgreSQL `SearchVector` / `SearchRank` / `SearchHeadline`
- Django Signal 在文档保存时更新 `search_vector`
- 提供管理命令（`apps/search/management/commands/`）用于重建索引

### 模块 8：导出 ✅

- 粒度：单文档 / 文件夹（含子级）/ 整知识库（`ExportTask.scope`）
- 格式：`md` / `html` / `pdf` / `docx` / `site`（zip）
- 各格式实现在 `apps/exporter/services/`：
  - `markdown_export.py` / `html_export.py` / `docx_export.py` / `pdf_export.py`（Playwright）/ `static_site.py`（Jinja2 模板）
- Celery 异步执行，前端轮询 `/api/v1/exports/{id}/`
- 静态站包含：每篇独立 HTML、CSS/JS、资源、`sitemap.xml`、`feed.xml`、本地静态搜索索引

### 模块 9：博客前台 ✅

- 完全匿名访问
- 首页、KB 浏览（含树形目录）、文章详情（TOC、阅读进度、相邻文章导航）、归档、标签云、RSS
- 公开 backlinks（`/public/posts/by-id/{id}/backlinks/`）
- 多套主题与「纸张」背景：`deepsea.css` / `starry.css` / `paper.css` / `book-card.css` 等，配合 `ReaderFontPicker` 与 `PaperPicker`
- 暗 / 亮主题切换（`stores/theme.ts`）

### 模块 10：附件与媒体管理 ✅

- 通过 `MultiPartParser` 上传
- 路径：`MEDIA_ROOT/uploads/{YYYY}/{MM}/{uuid}.{ext}`
- 三类型：`image` / `document`（pdf/docx/html/md）/ `other`
- 媒体库页（`/attachments/`）支持浏览与删除
- 前端附件预览：`AttachmentInlinePreview` / `PdfCanvas`（pdfjs-dist）/ `FilePreview`

### 模块 11：知识图谱 ✅（新增）

- `GET /api/v1/links/graph/` 返回节点（文档）+ 边（DocumentLink）
- 前端 `KnowledgeGraphPage.tsx` 基于 `react-force-graph-2d` 渲染
- 节点点击跳转文档；支持按知识库着色 / 过滤

### 模块 12：多用户与权限 ✅（增强）

- `accounts.UserViewSet` 提供管理员可见的用户管理
- 登录态、CSRF、session 查询、`system-info`
- 通过 `apps/accounts/scoping.py` 在每个 viewset 做 owner 维度的隔离
- 自定义权限类 `IsStaffUser` / `IsSuperUser`

---

## 非功能与已配置项

- **DRF 节流**：匿名 `120/min`
- **上传限制**：单文件 50MB（`DATA_UPLOAD_MAX_MEMORY_SIZE` / `FILE_UPLOAD_MAX_MEMORY_SIZE`）
- **CSRF**：`CSRF_COOKIE_HTTPONLY=False`（SPA 读取并塞回 `X-CSRFToken`），`CSRF_TRUSTED_ORIGINS` 默认包含 `:3001` / `:8002`
- **iframe**：`X_FRAME_OPTIONS = "SAMEORIGIN"`，让博客端可以 `<iframe>` 内联预览 HTML/PDF 附件
- **时区**：`Asia/Shanghai`，语言 `zh-hans`，`USE_TZ=True`
- **缓存**：`django_redis`
- **Celery**：broker `redis://localhost:6379/1`，result backend `:6379/2`

---

## 关键风险与注意事项（仍有效）

1. **Tiptap Markdown 互转保真度**
   - 复杂表格 / 合并单元格在富文本 ↔ Markdown 间可能丢失，必要时提示用户。

2. **双向链接的引用完整性**
   - 跨知识库引用：被引用文档移动 / 删除时由 `linking/signals.py` 维护一致性，删除时由前端弹确认。

3. **大文档性能**
   - 编辑器在 10000+ 字时仍流畅，但建议未来对超长文档启用 Tiptap 的 lazy rendering。
   - 自动保存目前传全文，可在 v0.6 优化为传 diff。

4. **PDF 导出资源占用**
   - Playwright 单次启动约 200MB 内存。`exporter.tasks` 通过 Celery 串行处理。
   - 安装 PDF 能力：`pip install -e .[pdf]` + `playwright install chromium`。

5. **PostgreSQL 中文全文搜索**
   - 默认 `tsvector` 不支持中文分词；写入与查询两端都需用 jieba 切词。

6. **超级用户的全租户可见**
   - `scope_queryset` 对超级用户不做过滤——在多账号环境下要小心 staff 误操作。

---

## 阶段交付计划（当前进度）

| 阶段 | 内容 | 状态 |
|---|---|---|
| **v0.1 MVP** | KB + Folder + Document CRUD + Markdown 编辑器 + 私密/公开切换 + 博客前台 | ✅ |
| **v0.2 编辑器增强** | Tiptap 富文本、`/` 命令、块拖拽、`@提及` 双向链接、反向链接区 | ✅ |
| **v0.3 协作辅助** | 历史版本（diff / 回滚）、PG 全文搜索（jieba） | ✅ |
| **v0.4 导出能力** | 单文档/文件夹/KB 导出，HTML/MD/PDF/DOCX + 整站 zip | ✅ |
| **v0.5 完善** | 评论、标签云、归档、RSS、移动端适配 | ✅ |
| **附加（已落地）** | 知识图谱、PlantUML、Word 导入、多账号权限、多主题与纸张、PDF 预览 | ✅ |
| **v0.6 后续优化候选** | 增量自动保存（diff 传输）、Tiptap lazy rendering、回收站 UI、导出预设 | 🔲 |

---

## 开发起步建议（针对新加入的协作者）

1. 复制 `.env.example` 为 `.env`，按需修改数据库 / Redis / SECRET_KEY
2. `docker compose up -d` 启动 Postgres + Redis
3. 后端：`uv sync` / `pip install -e .[dev]`，执行 `python manage.py migrate` 与 `createsuperuser`
4. 启动后端：`python manage.py runserver 0.0.0.0:8002`
5. 启动 Celery：`celery -A jianzhai worker -l info`
6. 前端：`cd frontend && pnpm install && pnpm dev`（默认 3001）
7. 访问 `http://localhost:3001`，使用 superuser 登录进入后台

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
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3001
CSRF_TRUSTED_ORIGINS=http://localhost:3001,http://localhost:8002
LANGUAGE_CODE=zh-hans
TIME_ZONE=Asia/Shanghai
```

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8002/api/v1
VITE_MEDIA_BASE_URL=http://localhost:8002/media
```

---

**文档版本**：v2.0
**最后更新**：2026-05-21
