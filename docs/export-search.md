# 简斋 · 全文搜索与导出

> jieba + tsvector 搜索；5 格式导出 + anthology 单文件壳 + Mermaid 离线 SVG。
> 架构见 [architecture.md](./architecture.md)。

---

## 1. 全文搜索

PostgreSQL `to_tsvector` 不擅长中文，两端都用 jieba：

```python
# apps/search/services.py
def collect_search_text(doc):
    """合并标题 + 标签名 + 评论 + 正文剥标签后的纯文本。"""
    ...
def refresh_search_vector(doc):
    tokens = " ".join(jieba.cut(collect_search_text(doc)))
    Document.objects.filter(pk=doc.pk).update(
        search_vector=SearchVector(Value(tokens, ...), config="simple"))
```

- **索引范围**：标题 + `raw_content`（剥 HTML）+ 标签名 + 评论正文；卡片占位符 `[[doc-card:ID]]`/`[[link-card:URL]]` 整体剥除（`_CARD_PLACEHOLDER_RE`，纯语法脚手架入索引会成可搜噪音）
- 查询侧同样 jieba 分词后 `plainto_tsquery`
- **触发**：`post_save` on Document / DocumentTag / Comment → `refresh_document_vector.delay`
- 全量重建：`python manage.py reindex_search`（升级索引逻辑后跑一次）
- 结果 snippet：正文无命中时回退到标签名 / 评论片段
- 前端：全局 `⌘K` 搜索框

---

## 2. 导出

### 格式与服务

`apps/exporter/services/`，5 种格式 + 多文档合订本：

| 格式 | mime | 实现 |
|------|------|------|
| Markdown | `application/zip` | `markdown_export.py`（单 `.md` / 多文档 zip） |
| HTML | `text/html` | `html_export.py`（单 / anthology） |
| PDF | `application/pdf` | `pdf_export.py`（Playwright，渲染 anthology `mode="print"`） |
| DOCX | `application/...wordprocessingml...` | `docx_export.py`（`python-docx`） |
| 静态站 | `application/zip` | `static_site.py`（Jinja2 + 流式写盘） |

**粒度**（`SCOPE_*`）：单文档 / 文件夹（递归子项）/ 整 KB / 多选（folder_ids + doc_ids 任意组合，JSON 存）。

**正文策略**：除整站 zip 仅 scope 内 `status=published` 外，各格式均 `doc_export_body()` —— 优先 `published_content`，空则 `raw_content`。

### HTML Anthology（多文档合订本）

`html_export.py → render_html(scope, mode)`：

- **`interactive`**：固定左侧 TOC + 一次只显示一篇的 `.export-doc-panel`（目录点击 / `#doc-N` hash 同步，内联 ES5 JS）。HTML 篇用 `<iframe srcdoc>`（首次展开才注入，样式互不污染）；Markdown 篇渲染为 `.jz-markdown.export-markdown` 片段。
- **`print`**（PDF 用）：展开全部 panel、去目录与脚本、篇章间 `page-break-before`；HTML 篇**不用 iframe**，改抽 `<style>` + body 扁平嵌入（`export-html-print`），避免 Chromium 打印空白 iframe。Playwright `emulate_media("screen")` 保留屏幕样式。
- 样式：`BASE_CSS` + `export-markdown.css` + `export-anthology.css`（后者仅 html_export 加载）。
- **单篇** HTML 导出仍 `export()` 原样写出（不套外壳）。

### 卡片占位符（`card_placeholders.py`，2026-07-20）

`[[doc-card:ID]]` / `[[link-card:URL]]`（前端卡片节点的序列化产物）历史上导出全线字面量泄漏，现分两路处理（均 fence 感知）：

- **HTML / PDF / 静态站**：`convert_card_placeholders` 在 markdown-it 前把占位符行转成样式化卡片 HTML 块——文档标题 `doc_titles_for` 批量 IN 查询、外链元数据复用 `apps/editor/services/link_preview.fetch_link_preview_or_none`（SSRF 守卫 + 24h 缓存，**离线/失败降级域名简卡，绝不抛异常**）；doc 卡 `href="doc:ID"` 交给既有 `_rewrite_doc_links` 统一改 `#doc-ID` 锚点。`markdown_render.render_markdown` 加 `card_meta` 参数，`common.render_markdown` 默认注入。
- **.md / docx**：`degrade_card_placeholders` 降级为普通链接行（doc-card → `[标题](doc:ID)` 随后走既有 mention 相对路径改写；link-card → `<URL>`）。
- **兜底不变量**：`render_markdown` 未收到 `card_meta` 时自动 degrade——**任何调用方都不会把 `[[...]]` 泄进导出物**（`test_card_placeholders.py` 钉住零泄漏断言）。

### 离线资源

- HTML/PDF 单文件内嵌本地 `/media/` 为 base64（`MAX_EMBED_BYTES = 10MB`）；zip 类复制到 `assets/` 并重写路径
- **Mermaid 离线 SVG**（`diagram_render.py`）：HTML/PDF/静态站导出前用 headless Chromium + vendored `static/vendor/mermaid.min.js` 把所有 `` ```mermaid `` 块批量渲为内联 SVG（每次导出仅启动一次浏览器，`htmlLabels:false` 保留原生 `<text>`）；缺 Chromium/语法错误优雅降级源码面板。PlantUML 仍为源码面板（需独立服务器）

### 异步与下载

- Celery `exporter.run_export` 异步；broker 不可达时 create 内联 fallback（同步执行）
- 前端 `/admin/exports` 轮询 + `downloadExport()` 用原生 `<a href>`（不用 fetch+blob，规避 Chrome 不安全下载警告）
- **导出权限**：owner 自己 / superuser；跨租户访问写审计日志

> **部署坑（已修）**：`export_root()` = `MEDIA_ROOT` 同级 `exports/`（容器内 `/app/exports`，**刻意不在 `/app/media` 下**，否则被 Caddy 公开 `/media/*` 绕过鉴权服出）。导出由 celery worker 异步写盘、下载请求落 backend 容器，**两者须共享命名卷 `exports_data:/app/exports`**，否则下载返 404。详见 [deployment.md](./deployment.md) 与 memory。
