"""Create or refresh the "简斋·开发指南" public knowledge base.

Idempotent — running it multiple times updates the existing docs in place
rather than creating duplicates. Useful for onboarding new collaborators or
for refreshing the published docs after architecture changes.

Usage:
    python manage.py seed_architecture_kb           # update / create
    python manage.py seed_architecture_kb --owner 1 # pick a specific owner
"""
from __future__ import annotations

from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.knowledge.models import Document, KnowledgeBase


KB_NAME = "简斋·开发指南"
KB_SLUG = "dev-guide"
KB_DESC = "简斋（JianZhai）项目的官方架构与开发指南。两版文档：简单版面向上手，详细版面向深入。"
KB_ACCENT = "#1677ff"


SIMPLE_DOC = """# 简斋 · 简单版

> 个人知识库 + 个人博客的一体化系统。一份内容既是私人笔记，也是公开博客。

## 它解决什么

- **写一次，两处用**：同一份 Markdown 既是你的私人笔记（`raw_content`），也是发布后的博客（`published_content`）
- **不用切换工具**：知识管理、写作、发布、阅读、AI 助手都在同一个 Web 应用里
- **本地优先**：所有数据在自己机器上的 PostgreSQL 里，离线可用

## 简单架构（4 个组件）

```
👤 用户
   │
   ▼
🎨 前端 SPA   ← React + Tiptap，跑在 localhost:3001
   │ REST + SSE
   ▼
🐍 后端       ← Django + DRF，跑在 localhost:8002
   │ ORM
   ▼
🗄️ PostgreSQL
```

外加一个**外部 AI**（Anthropic Claude API），AI 助手的所有调用都走后端代理，前端不直接拿 API key。

## 一分钟上手

1. **创建知识库**：左侧 `+` 起一个，比如「读书笔记」
2. **建文件夹 → 写文档**：所见即所得编辑器，输入 `/` 唤起命令面板
3. **私密 / 公开**：右侧抽屉切 visibility；公开后自动出现在博客首页
4. **AI 助手**：选中文字 → 紫色 ✨ 按钮 → 润色 / 翻译 / 续写

## 核心概念（3 个）

| 概念 | 大白话 |
|---|---|
| **知识库（KB）** | 一组相关文档的容器，例如「读书笔记」「项目 A」 |
| **文档（Document）** | 单篇 Markdown，包含「私人版」+「发布版」两份内容 |
| **双向链接** | 在一篇里输入 `@文档名` 自动链向另一篇，反向链接区会展示「谁引用了我」 |

## 何时升级到详细版？

当你想了解：
- 数据怎么存
- 异步任务怎么跑（导出 PDF / 整站）
- 全文搜索的中文分词如何工作
- 自动保存 / 版本协商 / 双向链接维护背后的细节

请翻 → [详细版](./detailed/)
"""


DETAILED_DOC = """# 简斋 · 详细版

> 这是「简斋」的完整架构剖白。简单版讲「是什么」，这版讲「怎么实现的、为什么这么实现」。

## 1. 仓库结构

```
jianzhai/
├── backend/
│   ├── jianzhai/         # Django 项目配置 (settings, urls, celery)
│   └── apps/
│       ├── accounts/     # 多用户 + scoping 工具
│       ├── knowledge/    # KB / Folder / Document 核心
│       ├── editor/       # 附件、上传、Word/MD 导入
│       ├── versioning/   # DocumentVersion 快照 + diff + 回滚
│       ├── linking/      # 双向链接解析 + 反向链接 + 知识图谱
│       ├── search/       # tsvector + jieba 中文分词
│       ├── exporter/     # 异步导出 (Celery): md/html/pdf/docx/site
│       ├── comments/     # 文档级 + 段落级评论
│       ├── tags/         # 标签：可挂 KB / Folder / Document
│       ├── blog/         # 公开博客 API + RSS
│       └── ai/           # AI 助手代理：Claude API
└── frontend/
    └── src/
        ├── api/          # axios 客户端 (按资源拆分)
        ├── components/
        │   ├── editor/   # Tiptap 富文本 + 自定义节点
        │   ├── common/   # 选区 AI / 模型徽标 / 文档预览等
        │   ├── tree/     # 知识库树形目录
        │   └── diff/     # 版本对比
        ├── pages/
        │   ├── admin/    # 后台 (登录后)
        │   └── blog/     # 公开博客 (匿名)
        ├── stores/       # Zustand: auth, theme
        └── styles/       # 主题与纸张样式
```

## 2. 数据模型

### Document（核心）

```python
class Document(models.Model):
    knowledge_base = FK(KnowledgeBase)
    folder = FK(Folder, null=True)

    title = CharField(200)
    slug = SlugField(220, unique_per_kb=True, condition=is_deleted=False)

    # 双内容字段
    raw_content = TextField()             # 原始笔记
    published_content = TextField()       # 发布版

    status = 'draft' | 'published'
    visibility = 'private' | 'public'
    paper_style = CharField(40)           # 阅读端纸张预设
    search_vector = SearchVectorField()   # PG 全文搜索

    version = PositiveIntegerField()      # 乐观并发令牌
    is_deleted / deleted_at               # 软删除
```

**乐观并发**：每次内容变化 `version += 1`。PATCH 请求带 `expected_version`，不匹配返回 409，前端提示后重新拉取。

**软删除**：所有核心模型都有 `is_deleted`，`SoftDeleteManager` 自动过滤。Folder 软删会级联到子文件夹和文档。

### 双向链接

```python
class DocumentLink(models.Model):
    source = FK(Document, related_name='outgoing_links')
    target = FK(Document, related_name='incoming_links')
    context = TextField()       # 引用处上下文片段
    position = IntegerField()   # 在 source.raw_content 中的字符偏移
```

保存文档时 `apps/linking/parser.py` 扫描 `@[标题](doc:ID)` 语法 → `signals.py` 同步更新 `DocumentLink` 表。

## 3. 请求时序：自动保存

```mermaid
sequenceDiagram
    participant UI as 编辑器
    participant API as Django + DRF
    participant DB as PostgreSQL
    participant Q as Celery
    UI->>UI: 5s debounce
    UI->>API: PATCH /documents/{id}/ (expected_version, content)
    API->>DB: SELECT FOR UPDATE
    alt version 一致
        DB-->>API: ok
        API->>DB: UPDATE document SET version+=1, raw_content=...
        API->>API: transaction.on_commit
        API-->>Q: 入队 update_search_vector + update_links
        API-->>UI: 200 + 新 version
    else version 不一致
        API-->>UI: 409 + 当前 document
        UI->>UI: 显示「已被其他端修改」+ 加载最新
    end
```

`transaction.on_commit` 是关键：避免 Celery worker 比 commit 更早跑、拉到旧状态。

## 4. 编辑器：Tiptap 自定义节点

| 节点 | 简介 | Markdown 形式 |
|---|---|---|
| `mathBlock` / `mathInline` | KaTeX，可视化输入 Modal | `$$...$$` / `$...$` |
| `detailsBlock` | 折叠块 (HTML `<details>`) | `:::details Title\\n...\\n:::` |
| `columns` + `column` | 分栏布局 | `:::cols-2\\n...\\n::col\\n...\\n:::` |
| `tabs` + `tabPanel` | 标签页 | `:::tabs\\n::tab A\\n...\\n:::` |
| `docCardEmbed` | 文档卡片嵌入 | `[[doc-card:42]]` |
| `inlineToc` | 自动目录 | `[TOC]` |
| `videoEmbed` | B 站 / YouTube 视频 | HTML 透传 |

**双编辑器并存**：富文本（Tiptap）、Markdown（textarea + 实时预览）、HTML（源码）。底层统一以 Markdown 持久化，富文本 ↔ Markdown 通过 `tiptap-markdown` 双向转换。

## 5. AI 助手

**架构**：所有 AI 调用都走 `apps/ai/`，前端永远不直接持有 API key。

```
浏览器 ──POST /api/v1/ai/stream/──► Django ──messages.stream──► Anthropic Claude
       ◄────── SSE: data:{delta:...} ──────────────────────────
```

**模型路由**：
- 用户可在编辑器工具栏切换模型，偏好存 localStorage
- 管理员可在「架构总览」页设全局默认 + 主开关 + max_tokens
- 模型清单内置在 `apps/ai/services.py` 的 `AVAILABLE_MODELS`，加新模型只改这个列表

**操作集**（8 种）：续写 / 润色 / 扩写 / 纠错 / 总结 / 大纲 / 中英互译。所有 prompt 模板在 `apps/ai/prompts.py`，方便审计与调优。

**两种触发**：
1. **选区 AI**：选中文字 → 紫色 ✨ → 弹菜单 → 自由提问或预设操作
2. **文档 AI 抽屉**：右下角 🤖 浮按钮 → 全文级总结 / 大纲 / 翻译 / 问答

## 6. 全文搜索：中文 tsvector

PostgreSQL 自带的 `to_tsvector` 不支持中文分词。方案：保存时用 **jieba** 切词后以空格拼接 → 喂给 `to_tsvector('simple', ...)` → 写入 `search_vector` GinIndex。

查询时同样切词后用 `plainto_tsquery`。

由 `apps/search/signals.py` 在 `Document.save()` 后自动更新（异步）。

## 7. 异步任务（Celery）

| 任务 | 触发 | 模型/服务 |
|---|---|---|
| 更新 search_vector | 文档保存 | `apps.search.tasks` |
| 同步双向链接 | 文档保存 | `apps.linking.tasks` |
| 导出 (md/html/pdf/docx/site) | 用户点击导出 | `apps.exporter.services/*` |
| PDF：Playwright 渲染前端打印预览 | exporter | 单进程串行，约 200MB / 任务 |

**broker**：Redis（DB 1）。**result backend**：Redis（DB 2）。

## 8. 安全

- **认证**：Django Session + DRF SessionAuthentication
- **CSRF**：所有写操作必须带 `X-CSRFToken`，前端 `ensureCsrf()` 自动从 cookie 注入
- **多租户隔离**：`apps/accounts/scoping.py` 的 `scope_queryset()`：匿名 → 空集；超级用户 → 不过滤；其他 → 按 owner
- **AI 限流**：30 req/min/user (`UserRateThrottle` scope=`ai_write`)
- **上传**：50MB / 文件，类型白名单
- **iframe**：`SAMEORIGIN`，让博客端可以内嵌 HTML/PDF 附件

## 9. 部署

最小化：

```bash
docker compose up -d              # postgres + redis
cd backend && uv sync && python manage.py migrate && python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8002 &
celery -A jianzhai worker -l info &
cd frontend && pnpm install && pnpm dev   # 默认 3001
```

完整生产部署还需要：Nginx 反代、`collectstatic`、`DEBUG=False`、HTTPS。

## 10. 想深入哪里？

- **想给编辑器加新块** → 看 `frontend/src/components/editor/MathNode.tsx` 是个完整例子（schema + NodeView + Markdown 序列化器）
- **想加新 AI 操作** → `backend/apps/ai/prompts.py` 加条目 + `services.py` 路由 + 前端 `AIAssistant.tsx` 加按钮
- **想换数据库** → `dj_database_url` 已抽象，改 `DATABASE_URL` 即可（但全文搜索依赖 PG，换其他需要重写 search app）
- **想加导出格式** → `backend/apps/exporter/services/` 加一个文件，参考 `markdown_export.py`
"""


class Command(BaseCommand):
    help = "Create or refresh the 简斋·开发指南 public knowledge base + 2 architecture docs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--owner",
            type=int,
            default=None,
            help="User ID who owns the KB (default: first superuser).",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        owner_id = options.get("owner")
        if owner_id:
            owner = User.objects.filter(pk=owner_id).first()
            if not owner:
                raise CommandError(f"用户 {owner_id} 不存在")
        else:
            owner = User.objects.filter(is_superuser=True).order_by("pk").first()
            if not owner:
                raise CommandError("没有 superuser；用 --owner <id> 指定")

        kb, kb_created = KnowledgeBase.all_objects.update_or_create(
            owner=owner,
            slug=KB_SLUG,
            defaults={
                "name": KB_NAME,
                "description": KB_DESC,
                "accent_color": KB_ACCENT,
                "visibility": "public",
                "is_deleted": False,
                "deleted_at": None,
            },
        )
        action = "创建" if kb_created else "更新"
        self.stdout.write(self.style.SUCCESS(f"✓ {action}知识库：{kb.name} (id={kb.id}, slug={kb.slug})"))

        for title, slug, body in [
            ("简单版", "simple", SIMPLE_DOC),
            ("详细版", "detailed", DETAILED_DOC),
        ]:
            doc, doc_created = Document.all_objects.update_or_create(
                knowledge_base=kb,
                slug=slug,
                defaults={
                    "title": title,
                    "raw_content": body,
                    "published_content": body,
                    "status": "published",
                    "visibility": "public",
                    "is_deleted": False,
                    "deleted_at": None,
                    "published_at": timezone.now(),
                },
            )
            action = "创建" if doc_created else "更新"
            self.stdout.write(self.style.SUCCESS(f"  ✓ {action}文档：{doc.title} (id={doc.id})"))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("完成。访问公开博客查看："))
        self.stdout.write(f"  http://localhost:3001/kb/{kb.slug}")
