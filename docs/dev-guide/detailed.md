# 简斋 · 详细版

> 本文是「简斋·开发指南」的**实现向**说明：四层架构、数据模型、请求时序与扩展入口。  
> 若你刚接触项目，请先读 → [简单版](./simple/)。

超级管理员还可在后台 **[架构总览](http://localhost:3001/admin/overview)** 查看**可交互 SVG**（与下文四层图信息一致，支持悬停 tooltip）。

---

## 1. 四层架构（详细版）

{{diagram:detailed-arch}}

### 1.1 客户端 SPA（:3001）

- **React 18 + TypeScript + Vite 5 + Ant Design 5**
- **后台**：知识库树、三模式编辑器（Tiptap 3 Rich / Markdown / HTML）、附件、版本、导出、用户、AI 管理、架构总览
- **博客前台**（匿名）：首页、KB 目录、文章详情、`HtmlPostReader`（HTML 发布版 iframe 阅读）、归档、标签云、RSS
- **AI 入口**：工具栏菜单、选区 ✨、`DocAIPanel` 全文抽屉；模型偏好存 localStorage，请求带 `model` 字段

### 1.2 边缘 / 代理

- 开发期 **Vite** 将 `/api`、`/media` 反代到 `:8002`
- **Session + CSRF**：写操作需 `X-CSRFToken`；`corsheaders` 允许前端源
- **DRF 节流**：匿名 120/min；AI `ai_write` **30/min/user**

### 1.3 应用层（:8002）

- **Django 5.2 + DRF 3.15**，Python 3.12
- **11 个本地 app**（见下表）
- 文档保存后 `transaction.on_commit` 再 **Celery `.delay()`**，避免 worker 读到未提交数据
- **apps.ai** 代理 Anthropic Claude（`/api/v1/ai/run`、`/stream`），API Key 仅存在于后端环境变量

### 1.4 持久层

| 组件 | 用途 |
|------|------|
| **PostgreSQL** | 主数据；`search_vector` GIN 全文索引；slug 在 KB 内唯一 |
| **Redis DB0** | django-redis 缓存 |
| **Redis DB1/2** | Celery broker / result backend |
| **MEDIA_ROOT** | `uploads/YYYY/MM/uuid.ext`；导出产物 zip/pdf 等 |

---

## 2. 十一个 Django app

| App | 职责 |
|-----|------|
| `accounts` | 登录、Session、用户 CRUD、`scope_queryset` 多租户、`system-info` |
| `knowledge` | `KnowledgeBase` / `Folder` / `Document` 核心 CRUD、树排序 |
| `editor` | 附件上传、Word/Markdown 导入、HTML 正文解析与资源 |
| `versioning` | `DocumentVersion` 快照、diff、回滚 |
| `linking` | 解析 `@[title](doc:id)` → `DocumentLink`；反链 API；图谱 |
| `search` | jieba 切词写入 `tsvector`；全局搜索 API |
| `tags` | 标签及与 KB / Folder / Document 的关联 |
| `comments` | 文档级与段落级（`block_id`）评论 |
| `exporter` | 异步导出 MD/HTML/PDF/DOCX/整站 zip |
| `blog` | 公开 posts API、RSS、`resolve_public_post_by_slug` |
| `ai` | Claude 代理、全局设置、用量日志 |

---

## 3. 数据模型要点

### Document（核心）

```python
# apps/knowledge/models.py（节选）
class Document(models.Model):
    knowledge_base = ForeignKey(KnowledgeBase)
    folder = ForeignKey(Folder, null=True, blank=True)
    title = CharField(max_length=200)
    slug = SlugField(max_length=220)  # 同一 KB 内未删除文档唯一

    raw_content = TextField(blank=True)       # 私人笔记
    published_content = TextField(blank=True)  # 发布版

    status = CharField(choices=["draft", "published"])
    visibility = CharField(choices=["private", "public"])
    version = PositiveIntegerField(default=1)  # 乐观并发
    search_vector = SearchVectorField(null=True)
    is_deleted / deleted_at  # 软删除
```

- **PATCH** 可带 `expected_version`；不匹配返回 **409** + 当前文档 JSON
- **软删除**：`SoftDeleteManager` 默认过滤；文件夹软删级联子项

### DocumentLink（双向链接）

```python
class DocumentLink(models.Model):
    source = ForeignKey(Document, related_name="outgoing_links")
    target = ForeignKey(Document, related_name="incoming_links")
    context = TextField()
    position = IntegerField()
```

保存后由 `apps/linking` 解析正文并异步/sync 更新链接表。

### AI

- `AISettings`：单例，默认模型、总开关、`max_tokens`
- `AIUsageLog`：每次调用的 token、耗时、成功与否

---

## 4. 自动保存与异步任务

{{diagram:save-flow}}

| Celery 任务 | 说明 |
|-------------|------|
| `search.refresh_document_vector` | jieba 分词 → 更新 `search_vector` |
| `linking.sync_document_links` | 重建 `DocumentLink` |
| `exporter.run_export` | PDF（Playwright）/ DOCX / 静态站 zip 等 |

未启动 worker 时：**保存仍成功**，但搜索索引与链接可能滞后。

---

## 5. 编辑器

| 模式 | 持久化 |
|------|--------|
| 富文本 | 经 `tiptap-markdown` 转为 Markdown 写入 `raw_content` |
| Markdown | 直接编辑源码 |
| HTML | 源码模式；发布版可为完整 HTML 文档 |

**常见 Tiptap 扩展**（自定义节点示例）：

| 节点 | Markdown / 语法 |
|------|-----------------|
| 数学 | `$$...$$` / `$...$`（KaTeX） |
| 折叠块 | `:::details 标题` |
| 分栏 / 标签页 | `:::cols-2` / `:::tabs` |
| 文档卡片 | `[[doc-card:ID]]` |
| 目录占位 | `[TOC]` |
| 流程图 | Mermaid / PlantUML 代码块 |

---

## 6. HTML 博客阅读

当 `published_content` 为完整 HTML（常含 `<!DOCTYPE`）时：

- 前台 **`HtmlPostReader`** 优先用附件 URL 作 `<iframe src>`，保留 `./assets/` 等相对路径样式
- 无附件时回退 `srcDoc` + 注入样式修正（避免 `vh` 撑高空白）
- 公开 HTML 经 **DOMPurify** 净化（Markdown 渲染路径同样安全）

后端 `apps/knowledge/html_content.py` 负责解析正文、剥离搜索用文本等。

---

## 7. 公开博客 API

- 列表：`GET /api/v1/public/posts/`，可按 `kb`、`tag` 筛选
- 详情：`GET /api/v1/public/posts/{slug}/`，可选 **`?kb=<kb_slug>`**
- **slug 仅在知识库内唯一**；全局检索若多篇同名，API 按 `-published_at` 取最新，建议链接带 `?kb=`
- 实现：`apps/blog/views.py` → `resolve_public_post_by_slug()`
- RSS：`/feed.xml`

---

## 8. AI 助手

```
浏览器 ──POST /api/v1/ai/stream/──► Django apps.ai ──stream──► Anthropic
       ◄──── SSE data:{"delta":"..."} ─────────────────────────────
```

- **8 种操作**：续写、润色、扩写、纠错、总结、大纲、中译英、英译中（`prompts.py`）
- **模型白名单**：Opus 4.7 / Sonnet 4.6 / Haiku 4.5 等（`services.AVAILABLE_MODELS`）
- **管理**：`/admin/ai` 设置默认模型与开关；**不是**在架构总览页配置 AI
- 未安装 `anthropic` 或未配置 Key 时端点优雅降级

---

## 9. 全文搜索

PostgreSQL `to_tsvector` 不擅长中文。做法：

1. 保存时用 **jieba** 切词，空格拼接
2. `to_tsvector('simple', ...)` 写入 `search_vector`（GIN）
3. 查询侧同样分词后 `plainto_tsquery`

范围：标题、正文、标签、评论（由 search app 编排）。

---

## 10. 安全与多租户

| 机制 | 行为 |
|------|------|
| `scope_queryset(qs, user)` | 匿名 → 空；普通用户 → `owner=user`；超管 → 不过滤 |
| CSRF | SPA 读 cookie 写 `X-CSRFToken` |
| 上传 | 单文件 50MB；类型区分 image/document/other |
| iframe | `X_FRAME_OPTIONS=SAMEORIGIN`，便于博客内嵌 PDF/HTML |

---

## 11. 部署与运维

```bash
docker compose up -d                    # PostgreSQL 16 + Redis 7
cd backend && pip install -e .[dev]
pip install anthropic                   # 可选 AI
pip install -e .[pdf] && playwright install chromium  # 可选 PDF
python manage.py migrate && createsuperuser
python manage.py runserver 0.0.0.0:8002
celery -A jianzhai worker -l info
cd frontend && pnpm install && pnpm dev
```

**刷新本开发指南**（改 `docs/dev-guide/` 后）：

```bash
python manage.py seed_architecture_kb
```

---

## 12. 扩展开发索引

| 目标 | 参考路径 |
|------|----------|
| 新编辑器块 | `frontend/src/components/editor/MathNode.tsx` |
| 新 AI 操作 | `backend/apps/ai/prompts.py` + `services.py` + `AIAssistant.tsx` |
| 新导出格式 | `backend/apps/exporter/services/` |
| 公开 API 行为 | `backend/apps/blog/views.py` |
| 多租户过滤 | `backend/apps/accounts/scoping.py` |
| 架构图源（勿重复维护） | `docs/dev-guide/diagrams/*.mmd` |

---

[← 返回简单版](./simple/)
