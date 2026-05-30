# 简斋 · 详细版

> **简斋·开发指南**  ·  当前 **v0.9.3**  ·  最后更新 2026-05-30
>
> 本文是**实现向**说明：四层架构、11 个 app、数据模型、请求时序、KaTeX/Mermaid/AI 全链路与扩展入口。
> 第一次接触请先读 → [简单版](./simple/)。
>
> 超级管理员还可在后台 **架构总览** 查看**可交互 SVG**（与下文四层图信息一致，含 hover tooltip）。

---

## 0. 阅读地图

| 章节 | 主题 | 你能拿走什么 |
|------|------|--------------|
| 1 | 四层架构 | 看清整个请求链路 |
| 2 | 11 个 Django app | 每个 app 的职责 + 关键代码路径 |
| 3 | 数据模型 | Document / DocumentLink / AIUsageLog 字段 |
| 4 | URL 总览 | 看哪个 URL 走哪个 viewset |
| 5 | 双内容形态与乐观并发 | 保存→冲突→搜索索引刷新时序 |
| 6 | 三种编辑器 + 20+ 自定义节点 | 用到的 Tiptap 扩展和它们的 Markdown 语法 |
| 7 | KaTeX 全链路 | 编辑、阅读、导出三端如何共享同一渲染 |
| 8 | Mermaid / PlantUML 体验 | 默认渲染、单击切源码、全屏 Modal、四主题适配 |
| 9 | AI 助手 | 8 操作 / 模型路由 / 用量审计 / 日历热图 / 定价 |
| 10 | 全文搜索 | jieba + tsvector 怎么联动 |
| 11 | 导出 | 5 格式 + anthology 单文件壳 + 安全下载 |
| 12 | 视觉系统 | 4 主题 + JzIcon + 印章 favicon + PWA |
| 13 | 多用户与安全 | scope_queryset / CSRF / iframe sandbox / HTTPS dev |
| 14 | 部署与运维 | 完整启动命令 + LAN HTTPS 模式 |
| 15 | 扩展开发索引 | 新编辑器块 / 新 AI 操作 / 新导出格式 都从哪开始 |

---

## 1. 四层架构

{{diagram:detailed-arch}}

### 1.1 客户端 SPA（`:3001`）

- **React 18 + TypeScript 5 + Vite 5 + Ant Design 5**
- **状态**：Zustand（`stores/auth.ts`、`stores/theme.ts`）
- **HTTP**：Axios，通过 `api/client.ts` 集中拦截 CSRF
- **编辑器内核**：Tiptap 3（ProseMirror）→ 富文本 / Markdown / HTML 三种模式
- **数学**：KaTeX 0.16 — 编辑器 Modal 可视化输入；博客 / 导出端共用 `utils/markdown.ts → katexPlugin`
- **图表**：Mermaid 11 动态导入 + PlantUML（`plantuml-encoder`）→ 自定义 Tiptap 节点
- **博客前台**（匿名）：首页、KB 浏览、文章详情、`HtmlPostReader`、归档、标签云、RSS
- **AI 入口**：工具栏 `AIAssistantMenu`、选区 `SelectionAI` ✨、`DocAIPanel` 右下抽屉、斜杠 `/ai`、顶栏 `AIModelBadge`
- **图标**：20 个自制 SVG `JzIcon`（24×24 / 1.5px / 印泥色彩点）

### 1.2 边缘 / 代理

- **Vite Dev 代理** `/api`、`/media`、`/feed.xml`、`/sitemap.xml` → `:8002`
- 每个代理请求 **强制新 TCP 连接**（`http.Agent({ keepAlive: false })`），避免 StrictMode unmount → 半截 socket 复用 → 后续请求拿到 204 空响应的 bug
- **Session + CSRF**：`CSRF_COOKIE_HTTPONLY=False`，SPA 读 cookie 写 `X-CSRFToken`
- **DRF 节流**：匿名 120/min；AI 写 `30/min/user`
- **CORS**：`corsheaders` 严格白名单，支持 LAN IP 与 HTTPS 模式
- **可选 LAN HTTPS**：`VITE_HTTPS=1` 启用 `@vitejs/plugin-basic-ssl` 自签证书；详见 §13.3

### 1.3 应用层（`:8002`）

- **Django 5.2 + DRF 3.15**，Python 3.12
- **11 个本地 app**（见 §2）
- 文档保存后用 `transaction.on_commit(lambda: task.delay())` 排队，避免 worker 读到未提交数据
- **apps.ai** 通过 SDK 代理 Anthropic Claude / DashScope（Qwen）；API Key 仅存后端 `.env`

### 1.4 持久层

| 组件 | 用途 |
|------|------|
| **PostgreSQL 14+** | 主数据；`search_vector` GIN 全文索引；slug 在 KB 内未删除时唯一 |
| **Redis DB0** | `django-redis` 缓存（页面片段、Session、TTL） |
| **Redis DB1/2** | Celery broker / result backend |
| **MEDIA_ROOT** | `uploads/YYYY/MM/<uuid>.<ext>`；导出产物 zip/pdf/docx 等 |

---

## 2. 十一个 Django app

| App | 关键文件 | 职责一句话 |
|-----|----------|----------|
| `accounts` | `scoping.py` `views.py` | 登录 / Session / 用户 CRUD / **scope_queryset 多租户** / `system-info` |
| `knowledge` | `models.py` `views.py` `tree.py` | `KnowledgeBase` / `Folder` / `Document` 核心 CRUD、`tree/reorder` 批量调序 |
| `editor` | `views.py` `import_word.py` | 附件上传、Word / Markdown 导入、HTML 正文解析 |
| `versioning` | `services.py` `diff.py` | `DocumentVersion` 快照 + 行级/字符级 diff + 回滚 |
| `linking` | `parser.py` `tasks.py` | 解析 `@[title](doc:N)` → `DocumentLink`；反链 API；图谱节点 + 边 |
| `search` | `services.py` `tasks.py` | jieba 切词 → `tsvector`；`/search/` 接口；`reindex_search` 命令 |
| `tags` | `models.py` `views.py` | 标签可挂 KB / Folder / Document；空 color 自动派生 djb2 hash |
| `comments` | `models.py` `views.py` | 文档级与段落级（`block_id`）评论；单用户自动通过审核 |
| `exporter` | `services/*` `tasks.py` `scope.py` | 异步导出 MD/HTML/PDF/DOCX/site zip；anthology 单文件壳 |
| `blog` | `views.py` `feeds.py` | 公开 posts API、RSS、`resolve_public_post_by_slug` |
| `ai` | `services.py` `prompts.py` `pricing.py` `views.py` | Claude / Qwen 代理、全局设置、用量日志、价格估算 |

---

## 3. 数据模型要点

### Document（核心）

```python
# apps/knowledge/models.py（节选）
class Document(models.Model):
    knowledge_base = ForeignKey(KnowledgeBase)
    folder = ForeignKey(Folder, null=True, blank=True)
    title = CharField(max_length=200)
    slug = SlugField(max_length=220, allow_unicode=True)
    # 双内容
    raw_content = TextField(blank=True)        # 私人笔记
    published_content = TextField(blank=True)  # 发布版
    status = CharField(choices=["draft", "published"])
    visibility = CharField(choices=["private", "public"])
    paper_style = CharField(max_length=40, blank=True)
    search_vector = SearchVectorField(null=True)
    version = PositiveIntegerField(default=1)   # 乐观并发令牌
    order = IntegerField(default=0)
    is_deleted / deleted_at / published_at      # 软删除 + 发布时间

    class Meta:
        indexes = [
            GinIndex(fields=["search_vector"]),
            Index(fields=["knowledge_base", "folder"]),
            Index(fields=["visibility", "status", "-published_at"]),
        ]
        constraints = [
            UniqueConstraint(
                fields=["knowledge_base", "slug"],
                condition=Q(is_deleted=False),
                name="uniq_doc_slug_per_kb_active",
            )
        ]
```

- **PATCH** 可带 `expected_version`；不匹配返回 **409** + 当前文档 JSON
- **软删除**：`SoftDeleteManager` 默认过滤；`Folder.soft_delete()` 级联子项；`all_objects` 含已删可恢复
- **slug 唯一约束** 通过 `condition=Q(is_deleted=False)` 限定到未删除范围，回收站不冲突

### DocumentLink（双向链接）

```python
class DocumentLink(models.Model):
    source = ForeignKey(Document, related_name="outgoing_links")
    target = ForeignKey(Document, related_name="incoming_links")
    context = TextField()       # 链接附近 50 字预览
    position = IntegerField()   # 在源文档中的位置
```

`linking/tasks.sync_document_links` 在保存后异步：

1. 对源文档 `select_for_update` 加锁
2. 解析 `raw_content` 抽取所有 `@[title](doc:N)`
3. 校验目标文档同 owner 且未软删
4. `bulk_create` 全程在 atomic 块内，避免并发覆盖

### AISettings + AIUsageLog

```python
class AISettings(models.Model):
    """单例。Admin 在 /admin/ai 页设置。"""
    default_model = CharField(max_length=80, default="claude-opus-4-7")
    enabled = BooleanField(default=True)
    max_tokens = PositiveIntegerField(default=1024)
    updated_at = DateTimeField(auto_now=True)

class AIUsageLog(models.Model):
    user = FK(User, null=True)
    operation = CharField(max_length=32)   # continue/polish/...
    model = CharField(max_length=80)
    streaming = BooleanField()
    input_tokens / output_tokens = PositiveIntegerField()
    duration_ms = PositiveIntegerField()
    succeeded = BooleanField()
    error = CharField(max_length=200, blank=True)
    created_at = DateTimeField()
```

每次 `run_once` / `run_stream` 写一行；用于 `/admin/ai` 用量 Tab 的日历热图与按模型/操作聚合。

---

## 4. URL 总览

```
/admin/                               Django admin
/api/v1/auth/                         登录 / 登出 / CSRF / session / system-info / UserViewSet
/api/v1/kbs|folders|documents/        knowledge CRUD（DRF Router）
/api/v1/tree/reorder/                 批量调序与父子关系
/api/v1/uploads/                      附件上传
/api/v1/imports/                      Word / Markdown 导入
/api/v1/attachments/                  媒体库
/api/v1/documents/{id}/preview/       hover 卡 / doc-card 嵌入用
/api/v1/documents/{id}/backlinks/
/api/v1/documents/{id}/versions/      含 diff / restore 子路径
/api/v1/documents/{id}/comments/
/api/v1/documents/{id}/tags/
/api/v1/kbs/{id}/tags/  /folders/{id}/tags/
/api/v1/links/graph/                  知识图谱
/api/v1/search/                       全文搜索
/api/v1/exports/                      异步导出任务（含 download/）
/api/v1/tags/                         标签 CRUD
/api/v1/ai/capabilities/              AI 模型列表 + 配置状态
/api/v1/ai/settings/                  Admin: GET/PATCH AI 全局设置
/api/v1/ai/usage/                     用量聚合（含 by_day + estimated_usd）
/api/v1/ai/run/                       非流式 AI 调用
/api/v1/ai/stream/                    SSE 流式 AI 调用
/api/v1/public/posts/                 公开博客（含 by-id / by-slug / adjacent / backlinks）
/api/v1/public/kbs/                   公开 KB（含 tree）
/api/v1/public/tags/                  公开标签云
/api/v1/public/archive/               归档
/feed.xml                             RSS
```

---

## 5. 双内容形态与乐观并发

### 5.1 自动保存时序

{{diagram:save-flow}}

**关键点：**

- 编辑器 `onUpdate` **200ms** 防抖 → 推 Markdown 给 React 父
- 父组件 **5s** 防抖 → 发 PATCH（带 `expected_version`）
- 服务端事务内 `select_for_update`：版本不匹配 → 409 + 当前快照
- 写入成功 → `transaction.on_commit` 再 Celery `.delay()`，避免 worker 读未提交
- 响应 50~80ms 内回到前端，状态栏 idle → pending → saving → saved
- Worker 异步刷搜索索引 + 重建 `DocumentLink`

### 5.2 发布版独立编辑

`raw_content` 与 `published_content` 是两套独立内容：

- `PUT /api/v1/documents/{id}/published-content/` 单独 PATCH 发布版
- `POST /publish/` `POST /unpublish/` 两个状态切换端点同样可带 `expected_version`
- 博客端只读 `published_content`，编辑器默认读 `raw_content`
- 切换"编辑发布版"开关时，编辑器加载 `published_content` 临时副本

### 5.3 Celery 任务清单

| 任务 | 触发 | 行为 |
|------|------|------|
| `search.refresh_document_vector` | Document/Tag/Comment 保存后 | jieba 分词 → tsvector |
| `linking.sync_document_links` | Document 保存后 | 重建 outgoing_links |
| `exporter.run_export` | `POST /exports/` | 跑导出，写 file_path / status |

未启动 worker 时：保存仍成功（API 返回 200），但搜索与链接滞后。导出 `ExportTaskViewSet.create()` 有内联 fallback：broker 不可达时同步执行 `run_export(task.id)`。

---

## 6. 编辑器（三种 + 20+ 自定义节点）

### 6.1 三种模式

| 模式 | React 组件 | 持久化 |
|------|-----------|--------|
| 富文本 | `RichTextEditor.tsx` | Tiptap 经 `tiptap-markdown` 转 Markdown 入 `raw_content` |
| Markdown | `MarkdownEditor.tsx` | 直接编辑 Markdown 源码 |
| HTML | `HtmlEditor.tsx` | 源码模式 + 200ms 防抖预览；发布版可为完整 HTML 文档 |

### 6.2 自定义节点 / 扩展速查

| 节点 | Markdown 语法 / 触发 | 实现文件 |
|------|----------------------|----------|
| 数学公式块 | `$$expr$$`（多行也支持） | `MathNode.tsx` |
| 数学公式行内 | `$expr$`（避防 currency 误识） | `MathNode.tsx` |
| 折叠块 | `:::details 标题` ↔ `<details>` | `DetailsBlock.ts` |
| 分栏 / 标签页 | `:::cols-2` / `:::tabs` | `Columns.ts` / `Tabs.ts` |
| 内联 TOC | `[TOC]` | `InlineToc.ts` |
| 文档卡片 | `[[doc-card:ID]]` | `DocCardEmbed.tsx` |
| 缩进 | Tab / Shift+Tab | `Indent.ts` |
| 字号 | 工具栏下拉 | `FontSize.ts` |
| 字体 | 工具栏下拉 | `FontFamily.ts` |
| 上下标 | `^x^` / `~x~` | tiptap 内置 |
| 批注 Mark | hover tooltip | `AnnotationMark.tsx` |
| 代码块增强 | ```` ```js title="" ```` | `CodeBlockView.tsx` |
| Mermaid | ```` ```mermaid ```` | `CodeBlockView.tsx` |
| PlantUML | ```` ```plantuml ```` | `CodeBlockView.tsx` |
| 图片 | `![](url)` + 悬浮工具栏 | `ResizableImage.tsx` |
| 视频嵌入 | B 站 / YouTube URL | `VideoEmbed.tsx` |
| 块 hover 菜单 | 左侧 `+ / ⋯` | `BlockHoverMenu.tsx` |
| 块拖拽 | 抓 handle 拖动 | `tiptap-extension-global-drag-handle` |
| `@` 提及 | `@文档名` | `MentionPicker.tsx` |
| 斜杠命令 | `/` 触发 | `slashCommandRegistry.tsx` |

---

## 7. KaTeX 全链路

> 「编辑、阅读、导出三端共用一套 KaTeX」是 v0.9.2 的承诺。一个公式从输入到打印的旅程：

```
[ 编辑器 ]
$$E = mc^2$$        ← 用户键入
  │
  ├─ Tiptap InputRule 把 `$$..$$` 转成 MathBlock 节点
  │  · 双击节点 → Modal 可视化输入 + 实时预览
  │  · 粘贴含 `$$..$$` 的文本 → PasteRule 同样转节点
  │
  ▼ 序列化（tiptap-markdown）
$$E = mc^2$$        → 写入 raw_content / published_content

[ 阅读端 ]
markdown-it (utils/markdown.ts) → katexPlugin
  · block 规则：`$$` 起始 + 内容 + `$$` 收尾 → KaTeX displayMode
  · inline 规则：`$..$`，前不能跟数字（防 `$5`、`$10` 误识）
  · throwOnError: false，错误降级为红框 `.jz-math-error`
  · output: 'html' 跳过 MathML，DOMPurify 只需识别 span

[ 导出端 ]
exporter/services/common.py → KaTeX HTML + 样式内嵌
  · HTML / PDF / static-site 全部内嵌 KaTeX CSS（base64 字体）
  · 离线打开仍能正常显示
```

**统一的 CSS class**：

- `.jz-math-block` — 块级
- `.jz-math-inline` — 行内
- `.jz-math-error` — 错误降级

编辑器、博客阅读、anthology 单文件壳全部用同一套类名，CSS 写一份即可。

---

## 8. Mermaid / PlantUML 体验

### 8.1 渲染管线

```
代码块（mermaid / plantuml）
        │
        ▼
mermaid: 动态 import('mermaid') ~600KB（首次使用才加载）
plantuml: encoder.encode(src) → /api 代理到 plantuml.com SVG
        │
        ▼
CodeBlockView 状态：previewHtml = '<svg>...</svg>'
博客端 CodeBlockEnhancer.hydrateMermaid → 直接写 canvas.innerHTML
```

### 8.2 三态切换（编辑器）

| 视图 | className | 行为 |
|------|-----------|------|
| 分栏 | `.jz-diagram-view-split` | 左源码右图，1fr/1fr |
| 仅源码 | `.jz-diagram-view-source` | 隐藏预览 |
| 仅图表 | `.jz-diagram-view-preview` | 隐藏源码（语雀风默认） |

单击图表 → `toggleSourceFromCanvas` 切回源码（再点切回图）。用户偏好持久化在 `localStorage['jz-diagram-prefs']`。

### 8.3 四主题适配

`utils/mermaid.ts → mermaidConfig(theme)`：

```typescript
const isDark = theme === 'dark' || theme === 'starry' || theme === 'deepsea';
// "节点 surface" — 把 surface 朝 accent 偏 8/14%，让节点和容器背景区分
const nodeFill = mixColors(surface, accent, isDark ? 14 : 8);
const edgeLabel = mixColors(surface, isDark ? '#ffffff' : '#000000', 6);
return {
  themeVariables: {
    primaryColor: nodeFill,
    primaryBorderColor: accent,
    primaryTextColor: text,
    lineColor: muted,
    edgeLabelBackground: edgeLabel,  // 不透明 label 背景，避免连线穿透
    ...
  },
  theme: isDark ? 'dark' : 'base',
};
```

并在博客端 `.jz-diagram-block` 给 starry/deepsea 加专属背景：

```css
[data-theme='starry'] .jz-code-block.jz-diagram-block {
  background: color-mix(in srgb, var(--jz-surface) 82%, #7c3aed 18%);
}
[data-theme='deepsea'] .jz-code-block.jz-diagram-block {
  background: color-mix(in srgb, var(--jz-surface) 82%, #0891b2 18%);
}
```

### 8.4 全屏 Modal（v0.9.3 新）

`utils/diagramFullscreen.ts` 是编辑器与博客端共用入口：

```typescript
openDiagramFullscreen(svgElement, { lang: 'mermaid' })       // 博客端，已有 DOM 节点
openDiagramFullscreenFromHtml(svgHtmlString, { lang: ... })  // 编辑器，从 React state 起
```

Modal 功能：

- **滚轮缩放** — 锚定在鼠标位置，0.2x ~ 8x
- **拖拽平移** — pointerdown / pointermove + setPointerCapture
- **键盘** — `Esc` 关闭，`0` 适应窗口，`+` `-` 缩放
- **复制 SVG** — 写剪贴板
- **下载 SVG** — `image/svg+xml` blob
- **下载 PNG** — Canvas 2x 渲染，白底，`image/png` blob

CSS 在 `styles/markdown.css → .jz-diagram-fullscreen-toolbar`，深色玻璃风工具栏 + 浅色 stage。

---

## 9. AI 助手

### 9.1 架构

```
浏览器 ──POST /api/v1/ai/stream/──► Django apps.ai
       │                                │
       │                                ├─► Anthropic SDK (Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5)
       │                                └─► DashScope SDK (Qwen3 Max / Coder Plus / Coder Flash)
       │
       ◄──── SSE: data:{"delta":"..."} ──
```

**前端永不持 API key**。所有调用走后端代理：

- 用户偏好存 `localStorage['jz-ai-model']`，每次调用带 `model` 字段
- 后端校验 `AVAILABLE_MODELS` 白名单（在 `apps/ai/services.py`）
- Admin 在 `/admin/ai` 设全局默认 + 主开关 + `max_tokens`（经 `get_max_tokens()` 注入 SDK）

### 9.2 8 种操作

| operation | 语义 | Prompt 模板 |
|-----------|------|------------|
| `continue` | 续写 | "在保持风格的前提下，从当前内容自然往下写" |
| `polish` | 润色 | "提升表达流畅度，不改变原意" |
| `expand` | 扩写 | "把要点展开为完整段落" |
| `fix` | 纠错 | "修正语病、错字、不通顺处" |
| `summarize` | 总结 | "为内容生成简洁的摘要" |
| `outline` | 大纲 | "为内容生成层级化标题大纲" |
| `translate_en` | 中→英 | "把内容翻译为自然的英语" |
| `translate_zh` | 英→中 | "把内容翻译为自然的中文" |

完整 prompt 在 `apps/ai/prompts.py`。

### 9.3 用量审计与日历热图

每次调用写一行 `AIUsageLog`。`/api/v1/ai/usage/?days=30` 返回：

```json
{
  "window_days": 30,
  "totals": {
    "calls": 1230, "input_tokens": 850000, "output_tokens": 360000,
    "failed": 4, "estimated_usd": 4.85
  },
  "by_model": [
    { "model": "claude-opus-4-7", "calls": 312, ...,
      "input_tokens": 410000, "output_tokens": 180000, "estimated_usd": 19.65 }
  ],
  "by_day": [
    { "day": "2026-05-29", "calls": 38, "input_tokens": 25000,
      "output_tokens": 12000, "estimated_usd": 1.28 }
  ],
  "by_operation": [...],
  "recent": [...],
  "pricing": { "claude-opus-4-7": {"input_per_mtok_usd": 15.0, ...} }
}
```

前端 `UsageHeatmap.tsx` 渲染 GitHub 风格热图：

- 横轴 = 周（左旧右新），纵轴 = 周一~日
- 5 级色深（0/1/2/3/4），分位基于当日 USD：`< $0` / `< $0.1` / `< $0.5` / `< $2` / `≥ $2`
- 配色用 `color-mix(in srgb, var(--jz-accent), transparent)` 自动跟主题
- hover 弹日期 + calls + tokens + USD 估算

### 9.4 价格表

`apps/ai/pricing.py` —— 单位 USD/MTok（百万 token）：

| 模型 | input | output |
|------|------:|------:|
| claude-opus-4-7 | $15.0 | $75.0 |
| claude-opus-4-6 | $15.0 | $75.0 |
| claude-sonnet-4-6 | $3.0 | $15.0 |
| claude-haiku-4-5 | $1.0 | $5.0 |
| qwen3-max | $1.40 | $5.60 |
| qwen3-coder-plus | $0.56 | $2.24 |
| qwen3-coder-flash | $0.14 | $0.56 |

Qwen 原价为 CNY，经 `CNY_TO_USD = 0.14` 转换。更新价格只改这一个文件。

### 9.5 限流与降级

- `AIWriteThrottle` (`UserRateThrottle scope=ai_write`)：30/min/user
- 未装 `anthropic` SDK 或未配 KEY：`is_enabled()` 返回 False，端点 503
- Admin 主开关关闭：所有 `/ai/*` 也返回 503

---

## 10. 全文搜索

PostgreSQL `to_tsvector` 不擅长中文，做法：

```python
# apps/search/services.py
def collect_search_text(doc):
    """合并标题 + 标签名 + 评论 + 正文剥标签后的纯文本。"""
    parts = [doc.title]
    parts.extend(tag.name for tag in doc.tags.all())
    parts.extend(c.content for c in doc.comments.all())
    parts.append(strip_html(doc.raw_content))
    return " ".join(parts)

def refresh_search_vector(doc):
    raw = collect_search_text(doc)
    tokens = " ".join(jieba.cut(raw))   # 分词后空格拼接
    Document.objects.filter(pk=doc.pk).update(
        search_vector=SearchVector(Value(tokens, output_field=TextField()),
                                   config="simple")
    )
```

查询侧同样 jieba 分词后 `plainto_tsquery`。

- 触发：`post_save` on Document / DocumentTag / Comment → `refresh_document_vector.delay`
- 全量重建：`python manage.py reindex_search`
- 结果 snippet：正文无命中时回退到标签名 / 评论片段

---

## 11. 导出

5 种格式 + 多文档合订本：

| 格式 | mime | 实现 |
|------|------|------|
| Markdown | `application/zip` | 单文档 `.md`；多文档 zip |
| HTML | `text/html; charset=utf-8` | `html_export.py` — 单 / anthology |
| PDF | `application/pdf` | Playwright 渲染 anthology 的 `mode="print"` |
| DOCX | `application/...wordprocessingml...` | `python-docx` 拼接段落 |
| 静态站 | `application/zip` | Jinja2 + `apps/exporter/services/static_site.py` |

### 11.1 HTML Anthology（多文档合订本）

`html_export.py → render_html(scope, mode="interactive")`：

- 固定左侧 TOC + 右侧 `.export-doc-panel`（默认显示首篇）
- TOC 点击 → 切换 panel + `#doc-N` URL hash 同步
- HTML 篇用 `<iframe class="export-html-frame" srcdoc>`（首次展开才注入 srcdoc，延迟加载）
- Markdown 篇直接渲染为 `.jz-markdown.export-markdown` 片段
- TOC 列宽可拖拽（localStorage 持久化）

`mode="print"`（PDF 用）：

- 展开全部 panel，去 TOC 与脚本
- HTML 篇不用 iframe，改抽 `<style>` + body 扁平嵌入
- Playwright `emulate_media("screen")` 保留屏幕样式
- 篇章间 `page-break-before` 强制分页

### 11.2 安全下载

前端 `downloadExport` 用原生 `<a href>` 触发：

```typescript
const a = document.createElement('a');
a.href = downloadUrl(task.id);   // 同源 /api/v1/exports/{id}/download/
a.download = task.filename;
a.click();
```

**不用 fetch + blob URL** —— Chrome 122+ 对 blob 下载在 HTTP 上下文会弹"不安全"警告，原生 `<a href>` 走真实 Content-Disposition 不触发该机制。

后端 `download` 视图：

```python
response = FileResponse(path.open("rb"), as_attachment=True, filename=...)
if task.mime_type:
    response["Content-Type"] = task.mime_type
return response
```

权限：owner 自己 / superuser（跨租户访问会写审计日志）。

---

## 12. 视觉系统

### 12.1 双形态主题

| 形态 | 作用域 | 风格 |
|------|--------|------|
| 后台 | `.jz-admin-glass` | **Apple 玄黑·玻璃拟态** + 翡翠 `#10b981` 重音；大圆角 14-18px + 颜色偏移柔阴影 + `backdrop-filter: blur` |
| 博客 | `.jz-blog-glass` | 宣纸 `#f3ebd6` + 朱砂 `#b94a3b` 古风；保留 v0.5 之前主调 |

### 12.2 4 套主题

`stores/theme.ts` 写 `document.documentElement.dataset.theme`：

| `data-theme` | 主调 |
|--------------|------|
| `light` | 宣纸 + 朱砂（默认） |
| `dark` | 玄黑 + 翡翠 |
| `starry` | 星空深紫 |
| `deepsea` | 深海青蓝 |

Mermaid / 代码块 / KaTeX / heatmap 全部读 CSS 变量，主题切换不需要重建组件。

### 12.3 JzIcon — 20 个自制 SVG

`components/common/JzIcon.tsx`：

- 24×24 viewBox / 1.5px stroke / `currentColor` / linecap round
- 每个图标专属「印泥色」彩点（朱砂/翡翠/暗金/青蓝/紫罗兰/橙）
- CSS 变量 `--jz-icon-accent-active` 在 hover/选中态统一染色 + drop-shadow 发光
- 覆盖：后台菜单 7 / 博客导航 5 / AI Tab 4 / 编辑器 sidebar Tab 4

### 12.4 印章 favicon + PWA

- `public/favicon.svg` — 朱砂印章（径向渐变印泥 + 颗粒滤镜 + 四角磨痕 + 双线印框 + 压痕「簡」）
- `public/manifest.webmanifest` + apple-touch-icon + theme-color
- `html / body / #root` 全局 reset margin/padding 铺满整屏

---

## 13. 多用户与安全

### 13.1 多租户

```python
# apps/accounts/scoping.py
def scope_queryset(qs, user, field="owner"):
    if not user or not user.is_authenticated:
        return qs.none()
    if user.is_superuser:
        return qs   # 超管不过滤，跨租户可见
    return qs.filter(**{field: user})
```

匿名 → 空集；普通用户 → `owner=user`；超管 → 不过滤（多账号时小心 staff 误操作）。

### 13.2 安全控制点

| 机制 | 行为 |
|------|------|
| CSRF | `CSRF_COOKIE_HTTPONLY=False`，SPA 读 cookie 写 `X-CSRFToken` |
| DOMPurify | 公开端 HTML 净化，所有 `<img>` 加 `loading="lazy" decoding="async"` |
| iframe | `X_FRAME_OPTIONS=SAMEORIGIN`，便于博客内嵌 PDF/HTML；`sandbox="allow-scripts allow-popups allow-forms"` |
| 上传 | 单文件 50MB；类型区分 image/document/other；`MEDIA_ROOT/uploads/YYYY/MM/uuid.ext` |
| AI 限流 | `30/min/user`（`UserRateThrottle scope=ai_write`） |
| 导出权限 | owner 自己 / superuser；跨租户访问写审计日志 |

### 13.3 LAN HTTPS 模式（v0.9.3 新）

Chrome 122+ 对非 localhost 的 HTTP 站点（如 LAN IP）**每次下载文件都弹"不安全"警告**，原因是浏览器策略，与项目无关。解决方法：用 `pnpm dev:https` 启动 Vite，自签证书走 HTTPS：

```bash
pnpm -C frontend dev:https            # 启用 @vitejs/plugin-basic-ssl
```

后端 `.env` 同步：

```env
JIANZHAI_PUBLIC_ORIGIN=https://172.16.x.x:3001
SITE_PUBLIC_URL=https://172.16.x.x:3001
```

首次访问需点「高级 → 继续前往」一次（自签证书），之后所有下载（PDF / HTML / ZIP / DOCX）都不再有警告。

---

## 14. 部署与运维

```bash
# 0. 克隆
git clone <repo> jianzhai && cd jianzhai

# 1. 依赖服务
docker compose up -d                              # postgres 14 + redis 7

# 2. 后端
cd backend
cp .env.example .env                              # 配置 DATABASE_URL / REDIS_URL / SECRET_KEY
pip install -e .[dev]                             # 装依赖
pip install anthropic                             # 可选 AI
pip install -e .[pdf] && playwright install chromium  # 可选 PDF 导出
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_architecture_kb             # 种本指南（可选）
python manage.py runserver 0.0.0.0:8002

# 3. Celery worker（搜索索引、双链、异步导出）
celery -A jianzhai worker -l info

# 4. 前端
cd frontend
pnpm install
pnpm dev                                          # localhost HTTP
# 或 LAN IP HTTPS：
pnpm dev:https
```

### 更新本指南

改 `docs/dev-guide/*.md` 或图后：

```bash
python manage.py seed_architecture_kb             # update_or_create，幂等
```

### 升级数据库与搜索

```bash
python manage.py migrate
python manage.py reindex_search                   # 全量重建 tsvector
```

---

## 15. 扩展开发索引

| 目标 | 起手处 |
|------|--------|
| **新编辑器块** | `frontend/src/components/editor/MathNode.tsx`（参考自定义 Tiptap 节点 + Markdown 序列化） |
| **新斜杠命令** | `frontend/src/components/editor/slashCommandRegistry.tsx` |
| **新 AI 操作** | `backend/apps/ai/prompts.py` 加模板 + `services.py` 暴露 + 前端 `AIAssistant.tsx` 加菜单项 |
| **新 AI 模型** | `apps/ai/services.AVAILABLE_MODELS` 注册 + `apps/ai/pricing.MODEL_PRICES_USD` 加价 |
| **新导出格式** | `backend/apps/exporter/services/` 加 `<format>_export.py`，注册到 `tasks.run_export` |
| **新公开 API** | `backend/apps/blog/views.py`（公开端） + `apps/<your>/views.py`（私域端） |
| **新主题** | `frontend/src/styles/theme.css` 加 `[data-theme='xxx']` 块；`stores/theme.ts` `ThemeMode` 枚举加成员 |
| **新 JzIcon** | `frontend/src/components/common/JzIcon.tsx` 加图标函数，记得给彩点 |
| **多租户过滤** | `backend/apps/accounts/scoping.py` 是唯一权威，所有 viewset 用 `scope_queryset(qs, request.user)` |
| **架构图源** | `docs/dev-guide/diagrams/*.mmd` —— 改完跑一次 `seed_architecture_kb` |

---

## 附录 A：环境变量速查

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
# LAN：与浏览器 origin 一致
# JIANZHAI_PUBLIC_ORIGIN=http://192.168.x.x:3001
# LAN HTTPS：
# JIANZHAI_PUBLIC_ORIGIN=https://192.168.x.x:3001
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3001
CSRF_TRUSTED_ORIGINS=http://localhost:3001,http://localhost:8002
LANGUAGE_CODE=zh-hans
TIME_ZONE=Asia/Shanghai

# AI（可选）
ANTHROPIC_API_KEY=sk-ant-api03-...
DASHSCOPE_API_KEY=sk-...
CLAUDE_MODEL_DEFAULT=claude-opus-4-7
CLAUDE_MAX_TOKENS=1024
```

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8002/api/v1
VITE_MEDIA_BASE_URL=http://localhost:8002/media
# LAN HTTPS（命令行 VITE_HTTPS=1 一次性即可）
```

---

[← 返回简单版](./simple/)
