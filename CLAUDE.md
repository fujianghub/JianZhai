# 简斋 / JianZhai - 开发指导文档

> 个人知识库 + 个人博客一体化系统
> 本文档作为 AI 编程助手（Cursor / Claude Code）的开发指南，包含功能需求与技术栈说明。

---

## 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | 简斋 / JianZhai |
| 定位 | 单用户个人知识库 + 公开博客（双形态合一） |
| 部署 | 本地单机，`localhost` 访问 |
| 后端端口 | 8002 |
| 前端端口 | 3001 |
| 仓库结构 | Monorepo（`backend/` + `frontend/`） |

---

## 技术栈

### 后端

| 类别 | 选型 | 版本 / 说明 |
|---|---|---|
| 语言 | Python | 3.12 |
| Web 框架 | Django | 5.2 |
| API 框架 | Django REST Framework (DRF) | 最新稳定版 |
| 数据库 | PostgreSQL | 14+ |
| 缓存 / 队列 | Redis | 7+ |
| 异步任务 | Celery | 用于导出 PDF / 整站打包等耗时任务 |
| 全文搜索 | PostgreSQL `tsvector` + jieba | 中文分词预处理后写入 search_vector 字段 |
| PDF 导出 | Playwright (headless Chromium) | 服务端渲染 HTML 截图为 PDF |
| Markdown 解析 | `markdown-it-py` + `mdit-py-plugins` | 解析、渲染、提取双向链接 |
| Word 导出 | `python-docx` | Markdown AST 转 docx |
| 静态站打包 | Jinja2 + 自定义打包脚本 | 生成可独立部署的 HTML 站点 |
| 认证 | Django 自带 Session 认证 | 单用户场景够用，预留 JWT 扩展位 |
| 文件存储 | 本地文件系统 | 通过 Django `MEDIA_ROOT` 管理 |
| 测试 | pytest + pytest-django | |

### 前端

| 类别 | 选型 | 说明 |
|---|---|---|
| 框架 | React | 18+ |
| 构建工具 | Vite | 快速冷启动 |
| 语言 | TypeScript | 强类型 |
| UI 组件库 | Ant Design 5 | 与带宽平台技术栈对齐 |
| 路由 | React Router v6 | |
| 状态管理 | Zustand | 轻量，比 Redux 简洁 |
| HTTP 客户端 | Axios | |
| 编辑器内核 | **Tiptap** (基于 ProseMirror) | 支持富文本、`/` 命令、块拖拽 |
| Markdown ↔ 富文本互转 | Tiptap Markdown 扩展 | 底层存储 Markdown |
| 代码块高亮 | lowlight + highlight.js | Tiptap 内置集成 |
| 数学公式 | KaTeX | Tiptap Math 扩展 |
| 流程图 | Mermaid | 自定义 Tiptap 节点 |
| Diff 展示 | `diff-match-patch` + 自渲染 | 历史版本对比 |
| 图标 | `@ant-design/icons` | |

### 开发与部署

| 类别 | 工具 |
|---|---|
| IDE | Cursor (Ubuntu) |
| 包管理 (Python) | uv 或 pip + venv |
| 包管理 (前端) | pnpm |
| 代码格式化 | Black + isort (Python), Prettier (TS) |
| Lint | Ruff (Python), ESLint (TS) |
| 容器 (可选) | Docker Compose（postgres + redis 一键启动） |

---

## 项目目录结构

```
jianzhai/
├── backend/
│   ├── manage.py
│   ├── pyproject.toml
│   ├── jianzhai/              # Django 项目配置
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── celery.py
│   ├── apps/
│   │   ├── accounts/          # 用户（即使单用户也独立 app）
│   │   ├── knowledge/         # 知识库 / 文件夹 / 文档核心模型
│   │   ├── editor/            # 编辑器相关 API（草稿、自动保存）
│   │   ├── versioning/        # 历史版本与 diff
│   │   ├── linking/           # 双向链接 @ 提及
│   │   ├── search/            # 全文搜索
│   │   ├── exporter/          # 导出（HTML/MD/PDF/DOCX/静态站）
│   │   ├── comments/          # 文档级 + 段落级评论
│   │   ├── tags/              # 标签系统
│   │   └── blog/              # 博客前台 API（公开内容）
│   ├── media/                 # 用户上传文件
│   ├── exports/               # 导出文件临时存储
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/               # axios 封装与 API 调用
│   │   ├── components/
│   │   │   ├── editor/        # Tiptap 编辑器封装
│   │   │   ├── tree/          # 知识库树形目录
│   │   │   ├── diff/          # 版本对比组件
│   │   │   └── common/
│   │   ├── pages/
│   │   │   ├── admin/         # 后台编辑界面
│   │   │   └── blog/          # 博客前台
│   │   ├── stores/            # Zustand stores
│   │   ├── hooks/
│   │   ├── types/
│   │   └── utils/
│   └── public/
├── docker-compose.yml         # postgres + redis
├── README.md
└── .gitignore
```

---

## 数据模型设计

### 核心模型清单

| 模型 | 说明 |
|---|---|
| `User` | 用户（单用户，复用 Django 自带 User 模型） |
| `KnowledgeBase` | 知识库（顶层容器） |
| `Folder` | 文件夹，可嵌套（self-referencing FK） |
| `Document` | 文档（核心模型） |
| `DocumentVersion` | 文档版本快照 |
| `DocumentLink` | 文档间的双向链接关系 |
| `Tag` | 标签 |
| `DocumentTag` | 文档与标签的多对多 |
| `Comment` | 评论（文档级 + 段落级） |
| `Attachment` | 附件（图片、文件） |

### Document 模型关键字段

```python
class Document(models.Model):
    knowledge_base = ForeignKey(KnowledgeBase)
    folder = ForeignKey(Folder, null=True, blank=True)  # null = 知识库根目录
    title = CharField(max_length=200)
    slug = SlugField(unique_per_kb=True)                # 用于公开 URL

    # 双内容字段（核心设计）
    raw_content = TextField()                            # 原始笔记（Markdown）
    published_content = TextField(blank=True)            # 发布版本（Markdown）

    # 状态
    status = CharField(choices=['draft', 'published'])
    visibility = CharField(choices=['private', 'public'])  # 是否进入博客前台

    # 搜索
    search_vector = SearchVectorField(null=True)         # PostgreSQL 全文搜索

    # 元数据
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
    published_at = DateTimeField(null=True)
    order = IntegerField(default=0)                      # 同级排序

    class Meta:
        indexes = [GinIndex(fields=['search_vector'])]
```

### 双向链接模型

```python
class DocumentLink(models.Model):
    source = ForeignKey(Document, related_name='outgoing_links')
    target = ForeignKey(Document, related_name='incoming_links')
    context = TextField()  # 引用处的上下文片段（用于反向链接展示）
    position = IntegerField()  # 在源文档中的位置
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('source', 'target', 'position')]
```

链接维护策略：保存文档时解析 `@文档名` 语法，同步更新 `DocumentLink` 表。

---

## 功能需求清单

### 模块 1：知识库与目录管理

**功能点**
- 创建 / 重命名 / 删除知识库（软删除，回收站机制）
- 知识库列表展示（封面、文档数、最后更新时间）
- 文件夹多层嵌套（无层级限制，前端做合理 UX 限制如 5 层）
- 文件夹仅作组织容器，**不存内容**
- 树形目录的**拖拽排序**（同级排序 + 跨级移动）
- 树形目录折叠 / 展开状态本地持久化

**API 端点**
```
GET    /api/v1/kbs/                       # 知识库列表
POST   /api/v1/kbs/                       # 创建知识库
PATCH  /api/v1/kbs/{id}/                  # 修改
DELETE /api/v1/kbs/{id}/                  # 删除
GET    /api/v1/kbs/{id}/tree/             # 获取完整目录树（含文件夹和文档）

POST   /api/v1/folders/                   # 创建文件夹
PATCH  /api/v1/folders/{id}/              # 修改 / 移动
DELETE /api/v1/folders/{id}/

POST   /api/v1/tree/reorder/              # 批量调整节点排序与父子关系
```

---

### 模块 2：文档与编辑器

**功能点**
- 创建 / 重命名 / 删除文档
- 编辑器支持 **Markdown 模式** 和 **富文本模式** 切换（底层存 Markdown）
- 编辑器功能元素：
  - 基础：H1-H6、加粗、斜体、删除线、引用、有序/无序列表、任务列表
  - 代码：行内代码、代码块（语法高亮，支持 50+ 语言）
  - 表格：增删行列、合并单元格
  - 媒体：图片上传（拖拽 + 粘贴）、附件上传、视频嵌入（B 站 / YouTube 等）
  - 进阶：LaTeX 数学公式、Mermaid 流程图、PlantUML
  - 特殊：分割线、TOC 占位符、Callout 块（提示/警告/信息）
- `/` 命令：输入 `/` 弹出块类型选择器
- 块级拖拽：每个块左侧拖拽手柄，可拖拽改变顺序
- `@提及` 双向链接：输入 `@` 弹出文档搜索器，选中后插入链接
- **自动保存**（每 5 秒检测变化，有变化则写入 `raw_content`）
- **手动发布**：将 `raw_content` 拷贝到 `published_content` 并标记发布
- **独立编辑发布版本**：可以单独修改 `published_content` 而不影响 `raw_content`
- 文档元信息侧栏：创建时间、字数统计、标签、可见性切换

**API 端点**
```
GET    /api/v1/documents/{id}/            # 文档详情（含两份内容）
PATCH  /api/v1/documents/{id}/            # 更新 raw_content（自动保存调用）
POST   /api/v1/documents/{id}/publish/    # 发布（拷贝 raw → published）
PATCH  /api/v1/documents/{id}/published/  # 单独修改发布版本
POST   /api/v1/documents/{id}/unpublish/  # 撤回发布

POST   /api/v1/uploads/image/             # 图片上传
POST   /api/v1/uploads/attachment/        # 附件上传
GET    /api/v1/documents/mentions/?q=xxx  # @提及搜索（跨知识库）
```

---

### 模块 3：历史版本

**功能点**
- 用户主动点击「保存版本」生成快照（类似 Git commit），可填写版本说明
- 版本列表展示：时间、版本说明、字数变化
- 任意两个版本之间的 **diff 对比**（行级 + 字符级）
- 一键 **回滚** 到任意历史版本（回滚也作为新版本入栈）
- 版本数量上限：每文档保留最近 100 个版本（可配置）

**API 端点**
```
GET    /api/v1/documents/{id}/versions/                # 版本列表
POST   /api/v1/documents/{id}/versions/                # 创建版本快照 {message: "..."}
GET    /api/v1/documents/{id}/versions/{vid}/          # 查看某版本内容
GET    /api/v1/documents/{id}/versions/diff/?a=&b=     # 两版本对比
POST   /api/v1/documents/{id}/versions/{vid}/restore/  # 回滚
```

---

### 模块 4：双向链接

**功能点**
- 编辑时输入 `@` 触发文档选择器（搜索框 + 最近文档列表）
- 选择后插入特殊节点：`@[文档标题](doc:{id})`
- 渲染时显示为可点击链接
- **跨知识库引用允许**
- 文档底部展示「**反向链接区**」：列出所有引用了当前文档的其他文档，含上下文片段
- 删除文档时检测被引用情况，提示用户

**API 端点**
```
GET    /api/v1/documents/{id}/backlinks/   # 反向链接列表
```

---

### 模块 5：标签系统

**功能点**
- 标签 CRUD
- 文档可绑定多个标签
- 标签云页面（按使用频次展示）
- 按标签筛选文档

**API 端点**
```
GET    /api/v1/tags/
POST   /api/v1/tags/
PATCH  /api/v1/tags/{id}/
DELETE /api/v1/tags/{id}/
GET    /api/v1/documents/?tags=tag1,tag2
```

---

### 模块 6：评论（笔记批注）

**功能点**
- **文档级评论**：文档底部评论区，仅自己可见和发布
- **段落级评论**：选中段落出现评论按钮，评论以侧边浮窗形式展示
- 段落级评论通过文档内的 `data-block-id` 属性定位
- 评论支持 Markdown
- 自动通过审核（单用户场景）

**API 端点**
```
GET    /api/v1/documents/{id}/comments/
POST   /api/v1/documents/{id}/comments/    # {block_id?, content}
DELETE /api/v1/comments/{id}/
```

---

### 模块 7：全文搜索

**功能点**
- 全局搜索框（顶部，快捷键 `Cmd+K` / `Ctrl+K`）
- 搜索范围：**标题 + 正文 + 标签名 + 评论内容**
- 中文分词：保存时用 jieba 处理后写入 `search_vector`
- 搜索结果展示：标题高亮、匹配片段、所属知识库
- 高级筛选：知识库、标签、时间范围、状态

**实现要点**
- Django Signal：文档保存时触发 `search_vector` 更新
- 使用 PostgreSQL `SearchVector` + `SearchRank` + `SearchHeadline`

**API 端点**
```
GET    /api/v1/search/?q=keyword&kb=&tag=&from=&to=
```

---

### 模块 8：导出

**功能点**
- **粒度**：单文档 / 文件夹（含子级）/ 整知识库
- **格式**：HTML 单页、Markdown、PDF、Word (.docx)、整站 zip
- 导出任务异步执行（Celery），前端轮询状态或 WebSocket 推送
- 导出历史记录页面，可重新下载

**整站静态导出特性**
- 生成的 zip 包含：
  - `index.html`（首页，文档列表 + 分类）
  - 每篇文档独立 HTML 文件，保留目录层级
  - 完整 CSS / JS（无外部 CDN 依赖）
  - 静态搜索（基于预生成的 JSON 索引 + lunr.js / minisearch）
  - 资源文件（图片、附件）
  - `sitemap.xml`、`robots.txt`、`feed.xml` (RSS)
  - 可直接部署到 Nginx / GitHub Pages / Vercel

**API 端点**
```
POST   /api/v1/exports/                           # 创建导出任务
                                                  # {scope: 'doc'|'folder'|'kb', target_id, format}
GET    /api/v1/exports/                           # 任务列表
GET    /api/v1/exports/{id}/                      # 任务状态
GET    /api/v1/exports/{id}/download/             # 下载结果
```

**关键实现**
- PDF：用 Playwright 渲染前端的「打印预览页面」截图为 PDF，保真度最高
- Word：解析 Markdown AST，按节点类型映射到 `python-docx` 的段落、表格、图片
- 整站：渲染 React 应用为静态 HTML（或用 Jinja2 模板直接生成）

---

### 模块 9：博客前台（公开阅读端）

**功能点**
- 完全匿名访问，无需登录
- **首页**：流式展示最新发布的公开文档（封面图、标题、摘要、发布时间、标签）
- **知识库浏览页**：左侧树形目录 + 右侧文档阅读
- **文档详情页**：渲染 `published_content`、目录 TOC、阅读进度条
- **归档页**：按年/月归档
- **标签云页**
- **关于页**（可在后台配置内容）
- **RSS / Atom 订阅源**
- 暗色 / 亮色主题切换（用户偏好持久化到 localStorage）
- 响应式设计（移动端友好）

**API 端点**（不需要认证）
```
GET    /api/v1/public/posts/              # 已发布文档列表（分页）
GET    /api/v1/public/posts/{slug}/       # 文档详情
GET    /api/v1/public/kbs/                # 公开的知识库列表
GET    /api/v1/public/kbs/{slug}/tree/    # 公开知识库的目录树
GET    /api/v1/public/tags/               # 标签云
GET    /api/v1/public/archive/            # 归档
GET    /feed.xml                          # RSS
```

---

### 模块 10：附件与媒体管理

**功能点**
- 文件上传通过 `MultiPartParser`
- 图片：自动生成缩略图（用 Pillow）、记录元数据（尺寸、格式）
- 附件：保留原文件名，存储路径用 UUID 防冲突
- 媒体库管理页：浏览所有上传的资源、删除未引用文件
- 存储路径：`MEDIA_ROOT/uploads/{year}/{month}/{uuid}.{ext}`

---

## 非功能需求

### 性能
- 文档列表懒加载（虚拟滚动）
- 编辑器对超长文档（10000+ 字）保持流畅
- 自动保存防抖（5 秒）
- 图片上传压缩（>2MB 自动压缩为 WebP）

### 可维护性
- 每个 Django app 独立 `models.py` / `serializers.py` / `views.py` / `urls.py`
- 前端组件单文件不超过 300 行
- 关键业务逻辑（双向链接解析、版本快照、导出）必须有单元测试

### 安全
- CSRF 保护（DRF 默认）
- 上传文件类型白名单（图片：jpg/png/webp/gif；附件：pdf/zip/常用文档类型）
- 文件大小限制：单文件 50MB
- 公开 API 添加速率限制（DRF Throttle）

### 数据安全
- 数据库每日定时备份（cron + pg_dump）
- 媒体文件夹纳入备份范围
- 删除操作软删除 + 回收站（30 天后清理）

---

## 分阶段交付计划

| 阶段 | 内容 | 工期估算 |
|---|---|---|
| **v0.1 MVP** | 知识库 + 文件夹 + 文档 CRUD + Markdown 编辑器 + 基础预览 + 私密/公开切换 + 博客前台展示 | 2-3 周 |
| **v0.2 编辑器增强** | Tiptap 富文本模式、`/` 命令、块拖拽、`@提及` 双向链接、反向链接区 | 1-2 周 |
| **v0.3 协作辅助** | 历史版本（commit / diff / 回滚）、PostgreSQL 全文搜索（含 jieba） | 1-2 周 |
| **v0.4 导出能力** | 单文档/文件夹/知识库导出，HTML/MD/PDF/DOCX 四格式 + 整站静态站打包 | 1-2 周 |
| **v0.5 完善** | 评论（文档级 + 段落级）、标签云、归档、RSS、移动端适配 | 1 周 |

总计：**6-10 周**（按业余时间投入估算）

---

## 关键风险与注意事项

1. **Tiptap Markdown 互转保真度**
   - 富文本 → Markdown 时部分复杂格式（如合并单元格表格）会丢失
   - 建议：在切换前提示用户，并在数据库保留 Tiptap JSON 作为备份字段（可选优化）

2. **双向链接的引用完整性**
   - 跨知识库引用：被引用文档移动 / 删除时需级联更新链接
   - 使用 Django Signal 维护一致性，并在删除时弹出确认

3. **大文档性能**
   - 编辑器虚拟滚动可考虑 Tiptap 的 `lazy rendering` 方案
   - 自动保存仅传输 diff 而非全文（可作为 v0.6 优化）

4. **PDF 导出资源占用**
   - Playwright 单次启动约 200MB 内存
   - 用 Celery 任务队列串行处理，避免并发崩溃

5. **PostgreSQL 中文全文搜索**
   - `tsvector` 默认不支持中文分词
   - 方案：保存前用 jieba 切词后以空格拼接，再写入 `search_vector`
   - 缺点：搜索时也需对查询词切词

---

## 开发起步顺序建议

1. 初始化项目骨架（Django 项目 + Vite React 项目 + Docker Compose）
2. 配置 PostgreSQL、Redis、Celery 跑通
3. 实现 User、KnowledgeBase、Folder、Document 模型与基础 CRUD API
4. 前端搭建 Ant Design 后台框架 + 路由
5. 集成 Tiptap 编辑器（先 Markdown 模式）
6. 实现树形目录组件 + 拖拽
7. 完成 MVP 流程：建库 → 建文件夹 → 写文档 → 预览 → 发布 → 博客前台展示
8. 按 v0.2-v0.5 顺序迭代

---

## 附：环境变量清单

```env
# backend/.env
DEBUG=True
SECRET_KEY=
DATABASE_URL=postgresql://jianzhai:password@localhost:5432/jianzhai
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
MEDIA_ROOT=./media
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3001
```

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8002/api/v1
VITE_MEDIA_BASE_URL=http://localhost:8002/media
```

---

**文档版本**：v1.0
**最后更新**：2026-05-17

