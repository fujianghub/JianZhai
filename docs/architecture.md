# 简斋 · 架构与数据模型

> 实现向参考：四层架构、12 个 Django app、数据模型、请求时序、扩展入口。
> 上手导览见 [dev-guide/simple.md](./dev-guide/simple.md)；权限体系见 [permissions.md](./permissions.md)。
> 本文基于源码核对（2026-09-08），与代码不一致以代码为准。

---

## 1. 四层架构

```
[ 客户端 SPA :3001 ]  React 18 + TS 5 + Vite 5 + AntD 5 + Zustand + Axios
          │  /api · /media · /feed.xml （Vite dev 代理，每请求强制新 TCP 连接）
[ 边缘/代理 ]  Session + CSRF（CSRF_COOKIE_HTTPONLY=False）· DRF 节流 · CORS 白名单
          │
[ 应用层 :8002 ]  Django 5.2 + DRF 3.15（Python 3.12）· 12 个本地 app
          │  保存后 transaction.on_commit → Celery .delay()（避免 worker 读未提交）
[ 持久层 ]  PostgreSQL 14+（search_vector GIN）· Redis（缓存 DB0 / broker DB1 / result DB2）· MEDIA_ROOT
```

- **编辑器内核**：Tiptap 3（富文本）/ CodeMirror 6（Markdown 源码）/ textarea（HTML）三模式，统一以 Markdown 持久化
- **apps.ai** 通过 SDK 代理 Anthropic Claude / DashScope（通义千问）；**API Key 仅存后端 `.env`，前端永不持有**

---

## 2. 十二个 Django app

| App | 关键文件 | 职责 |
|-----|----------|------|
| `accounts` | `scoping.py` `permissions.py` `hero.py` `toc.py` `views.py` `models.py` `captcha.py` | 登录（三因子:密码+邮箱匹配+滑块验证码）/ Session / 用户 CRUD / **scope_queryset** / **四角色 RBAC** / **友邻闸门** / 账号自服务 / **题记（HeroSettings）** / **目录站点默认（TocSettings）** |
| `knowledge` | `models.py` `views.py` `structure.py` `audience.py` `concurrency.py` `trash_views.py` | `KnowledgeBaseCategory` / `KnowledgeBase` / `Folder` / `Document` 核心 CRUD、`tree/reorder` 调序（`reorder_tree`）、回收站；**`audience.py` = 读者可见性唯一收口**（受众三态 + `ReadGrant` 取 AND） |
| `editor` | `views.py` `tasks.py` `media_auth.py` `media_views.py` `services/{docx_import,epub_sanitize,slides,derived,text_extract,ocr,posters,media_gc,office_fonts}.py` | 附件上传（按类型上限 `max_upload_size_for`）、Word / MD / ZIP / PPT / PDF / EPUB 导入（docx 走 mammoth、epub 上传即净化）、本地图片打包；**派生文件 `DerivedFile`**（PPT 中间 PDF / OCR 副本 / 海报 / 封面）、`ConversionJob` 转换可观测、`DocumentExtract` 附件文本进搜索；**`/media/*` 字节层鉴权 `media_access_status`**（生产 Caddy `forward_auth`，dev `serve_media` 内联 + Range 206）；永久删除经 `media_gc` 清盘；**PPT 字体识别与自动适配 `office_fonts`**（每 deck 字体清单→四级解析→专用 fontconfig 传 soffice，报告落 `DerivedFile(deck_pdf).meta.fonts`；度量兼容字体包 `build_font_pack`、静态配置 `office_fonts_conf`） |
| `versioning` | `services.py` `diff.py` | `DocumentVersion` 快照 + 行级/字符级 diff + 回滚 |
| `linking` | `parser.py` `tasks.py` | 解析 `@[title](doc:N)` → `DocumentLink`；反链 API；图谱节点 + 边 |
| `search` | `services.py` `tasks.py` | jieba 切词 → `tsvector`；`/search/`；`reindex_search` 命令 |
| `tags` | `models.py` `views.py` | 标签可挂 KB / Folder / Document；空 color 自动派生 djb2 hash |
| `comments` | `models.py` `views.py` | 文档级与段落级（`block_id`）评论；单用户自动通过审核 |
| `reading` | `models.py` `serializers.py` `views.py` | 阅读器读者状态：`Highlight`（三种锚二选一：EPUB 范围 CFI / MD TextQuote `selector` JSON / **PDF `{kind:'pdf', page, quads}`**，`validate_selector` 分派校验；+ 引文 + 七色（黄绿蓝粉紫红橙）× 高亮/下划线/波浪线 + 笔记）、`Bookmark`（EPUB 点 CFI **或 PDF `page`**，二选一条件唯一）、**`ReadingPosition`**（user×document 唯一：`cfi/fraction/page/offset/slide`，四阅读器服务端续读）；每用户私有、读者可写（`_readable_doc` 同收藏/评论） |
| `exporter` | `services/*` `tasks.py` `scope.py` | 异步导出 MD/HTML/PDF/DOCX/site zip；anthology 单文件壳 |
| `blog` | `views.py` `feeds.py` | 公开 posts API、RSS、`resolve_public_post_by_slug` |
| `ai` | `services.py` `prompts.py` `pricing.py` `views.py` | **多供应商**代理、降级链、日预算、自定义模板、多轮对话、用量日志、价格估算 |

---

## 3. 数据模型要点

### Document（核心，`apps/knowledge/models.py`）

```python
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
    is_pinned = BooleanField(default=False)     # 置顶
    pinned_at = DateTimeField(null=True)
    created_by = ForeignKey(User, null=True)        # 创建者（建档定格）
    last_edited_by = ForeignKey(User, null=True)    # 最后编辑者（改正文时更新）
    is_deleted / deleted_at / created_at / updated_at / published_at

    class Meta:
        indexes = [
            GinIndex(fields=["search_vector"]),
            Index(fields=["knowledge_base", "folder", "is_deleted"]),
            Index(fields=["visibility", "status", "is_deleted", "-published_at"]),
        ]
        constraints = [
            UniqueConstraint(fields=["knowledge_base", "slug"],
                             condition=Q(is_deleted=False),
                             name="unique_kb_doc_slug_alive"),
        ]
```

- **PATCH** 可带 `expected_version`；不匹配返回 **409** + 当前文档 JSON（事务内 `select_for_update` 校验）
- **软删除**：`SoftDeleteManager` 默认过滤；`Folder.soft_delete()` 级联子项；`all_objects` 含已删可恢复
- **slug 唯一约束** 限定到 `is_deleted=False`，回收站不冲突
- `created_by` 建档定格不变，`last_edited_by` 在改正文的 PATCH 时更新（文档信息面板展示）

### KnowledgeBase / Folder / Category

- `KnowledgeBase`：`owner` / `name` / `slug` / `description` / `cover_image` / `accent_color` / `visibility`（private/public）/ `category` FK / `doc_sort_mode`（custom/title/created_at/updated_at/doc_format）/ `order` / 软删字段 / **受众三件套 `audience_mode`（all/exclude/include）+ `audience_users` M2M + `audience_tags` M2M**（读者可见性，见 permissions.md §8）
- `Folder`：self-FK `parent` 可嵌套 + `order` + 软删字段
- `KnowledgeBaseCategory`：`owner` / `name` / `slug` / `description` / `accent_color` / `order` / 同款受众三件套

> **owner 字段仍在，但内容访问不再按 owner 隔离**——见 §6 多租户。`owner` 现仅作记录/兜底，不参与作者间隔离。

### DocumentLink（双向链接）

```python
class DocumentLink(models.Model):
    source = ForeignKey(Document, related_name="outgoing_links")
    target = ForeignKey(Document, related_name="incoming_links")
    context = TextField()       # 链接附近预览
    position = IntegerField()
```

`linking/tasks.sync_document_links` 保存后异步：① 对源文档 `select_for_update` 加锁（**锁结果赋值给本地变量**，否则取了锁就丢）→ ② 解析 `raw_content` 抽取 `@[title](doc:N)` → ③ 校验目标同 owner 且未软删 → ④ `bulk_create` 全程在 atomic 块内。

### editor 派生与转换（2026-09-08，`apps/editor/models.py`）

- `Attachment`：`document` FK（可空，SET_NULL）/ `file`（`uploads/YYYY/MM/<uuid>.<ext>`）/ `kind`（image/document/other）/ `mime_type` / `size`
- `SlideImage`：PPT 逐页 JPEG（`slides/`）+ `thumbnail` + `notes` 讲者备注；`Document.slide_status/slide_error` 记转换状态
- `DerivedFile`：`document` FK + `source` Attachment + `kind ∈ deck_pdf / ocr_pdf / poster / cover`（`unique(document, kind)`，文件落 `media/derived/`），查询走 `services/derived.py derived_of`。**刻意不用 Attachment**，否则 `detect_doc_format` 把 pptx 误判成 pdf
- `ConversionJob`：每次转换一行（`kind ∈ pptx_slides / deck_pdf / pdf_extract / poster / cover / ocr`，`status running/done/failed`，`task_id / attempt / pages / src_bytes / out_bytes / duration_ms / error`），django-admin 可查
- `DocumentExtract`：`document` O2O，索引专用 `text`（400k 上限 `truncated`）/ `source` / `page_count` / `encrypted` / `is_scanned` / `meta`；`search` 把它并进 `search_vector`

### accounts 读者侧（`apps/accounts/models.py`）

- `UserTag`：`name` 唯一 + `color` + `users` M2M（反向名 **`account_tags`**，`User.tags` 已被内容标签占用）
- `ReadGrant`：`user` FK + 四粒度目标（`knowledge_base` / `category` / `folder` 含子树 / `document`，四选一）；空条目 = 不受限，有条目 = 白名单，与受众取 AND（enforcement 仅在 `knowledge/audience.py`）
- `TocSettings`：单例，`prefs` JSON 分 `{kblist, kb, article}` 三份（`TOC_SCOPES` / `DEFAULT_TOC_PREFS`，迁移 `accounts 0010` 扁平摊三份）
- `HeroSettings`：题记单例（`enabled` / `quotes` JSON / `rotation_seconds` / `animation` / `play_order`）

### AI 模型

字段详见 [ai.md](./ai.md)（AISettings / AIUsageLog 含 `estimated_usd` / AIPromptTemplate / AIConversation）；题记与目录设置的前端消费见 [frontend.md](./frontend.md)。

---

## 4. URL 总览（`/api/v1/`）

```
auth/            csrf · captcha(滑块取题) · session(含 require_login) · login(三因子:密码+邮箱匹配+滑块) · logout · me · system-info(IsRoot)
auth/me/         avatar · change-password · change-email · change-username   账号自服务
auth/hero/  /hero/batch/      题记：员工读写 + 批量导入
auth/toc/                     目录站点默认：IsContentAuthor 读、staff 写（{reset:true} 恢复出厂）
auth/users/                   UserViewSet（可见范围按角色）
kbs|folders|documents|kb-categories/   knowledge CRUD（DRF Router）
tree/reorder/                 批量调序与父子关系
document-templates/
trash/  /trash/kbs/<pk>/restore  /trash/empty  …  回收站（purge/empty = IsRoot）
uploads/  imports/  imports/batch/  imports/zip/   附件上传 + Word/MD/ZIP/PPT/PDF/EPUB 导入
attachments/  documents/<id>/attachments/  documents/<id>/reconvert-slides/  link-preview/
media-auth/                   /media/* 字节层鉴权（生产 Caddy forward_auth 目标；同 visible_documents 判定 + Redis 60s 缓存）
documents/<id>/{preview,backlinks,versions,comments,tags}/   含 versions/diff · restore
documents/<id>/{highlights,bookmarks,position}/  highlights/<pk>/  bookmarks/<pk>/   划线/书签/服务端阅读位置（reading；EPUB/MD/PDF 三种锚）
kbs/<id>/tags/  folders/<id>/tags/  tags/
links/graph/                  知识图谱
search/                       全文搜索
exports/  exports/<pk>/download/   异步导出
ai/capabilities · settings · run · stream · chat · estimate · usage(+csv) · templates · conversations
public/posts(by-id/by-slug/adjacent/related/backlinks) · kbs(tree) · tags · archive · kb-categories · hero · toc-settings
/feed.xml  /sitemap.xml  /robots.txt  /django-admin/
```

> **友邻闸门**：所有 `/api/v1/public/*` 经 `PublicOrLoginGated`——`SITE_REQUIRE_LOGIN=false` 全开放；`true` 时未登录 403，前端引导登录。

---

## 5. 双内容形态与乐观并发

### 5.1 自动保存时序

- 编辑器 `onUpdate` **200ms** 防抖 → 推 Markdown 给 React 父
- 父组件 **5s** 防抖 → 发 PATCH（带 `expected_version`）
- 服务端事务内 `select_for_update`：版本不匹配 → 409 + 当前快照
- **前端 409 处理**（2026-07-24 起不再静默丢字）：`documentSave.ts` 先把尝试保存的本地内容备份 localStorage（`utils/localDraftBackup.ts`，键 `jz-draft-backup:<docId>:<场景>`），编辑页弹「恢复我的编辑 / 使用服务器版本」——恢复即基于新版本自动重保存；编辑器卸载 flush（fire-and-forget）失败同样本地备份 + 提示
- 写入成功 → `transaction.on_commit` 再 Celery `.delay()`，避免 worker 读未提交
- Worker 异步刷搜索索引 + 重建 `DocumentLink`
- 状态栏 idle → pending → saving → saved；未启动 worker 时保存仍成功（200），但搜索/链接滞后

### 5.2 发布版独立编辑

`raw_content` 与 `published_content` 是两套独立内容：

- `PUT /documents/{id}/published-content/` 单独 PATCH 发布版
- `POST /publish/` `POST /unpublish/` 状态切换，同样可带 `expected_version`
- 博客端只读 `published_content`，编辑器默认读 `raw_content`

### 5.3 Celery 任务

队列拆分（2026-09-08）：`celery`（默认）/ `convert` / `export` / `ocr`，路由在 `settings.CELERY_TASK_ROUTES`；不带 `-Q` 的 worker 消费全部队列（dev 单 worker），生产 compose 分 `celery`（`-Q celery,export` + beat）/ `celery-convert`（`-Q convert`）/ `celery-ocr`（`-Q ocr`）三个服务。

| 任务 | 队列 | 触发 | 行为 |
|------|------|------|------|
| `search.refresh_document_vector` | celery | Document/Tag/Comment 保存后 | jieba 分词 → tsvector（含 `DocumentExtract` 文本） |
| `linking.sync_document_links` | celery | Document 保存后 | 重建 outgoing_links |
| `editor.mirror_document_images` | celery | 导入含远程图的 MD | 线程池并行镜像远程图为附件 |
| `editor.convert_pptx` | convert | 上传 pptx / `reconvert-slides` | LibreOffice → 中间 PDF（`DerivedFile(deck_pdf)`）→ pdftoppm 逐页 JPEG；`acks_late` + 瞬时错误重试 2 次，`ConversionJob` 记录 |
| `editor.extract_document_text` | convert | 上传 pdf/epub、pptx 转换末尾 | pdftotext / EPUB 剥标签 → `DocumentExtract`；顺带海报/封面；判扫描件即排队 OCR |
| `editor.ocr_pdf` | ocr | 扫描件判定 / `backfill_ocr` | ocrmypdf → `DerivedFile(ocr_pdf)`，完成后从副本重抽取入搜索 |
| `exporter.run_export` | export | `POST /exports/` | 跑导出，写 file_path / status；broker 不可达时 create 内联 fallback |

Beat：`exporter.cleanup_exports`（每日，`EXPORT_TTL_DAYS`）· `editor.sweep_stuck_conversions`（15 分钟，卡 `pending` 的 deck 标 failed）· `editor.cleanup_media_report`（每周，仅报告；删除走 `manage.py cleanup_media --apply`）。

---

## 6. 多租户：角色制共享内容池（v1.0 RBAC）

> **唯一权威**：`apps/accounts/permissions.py::get_role(user)`。完整规则见 [permissions.md](./permissions.md)。

```python
# apps/accounts/scoping.py（现行）
def scope_queryset(qs, user, field="knowledge_base__owner"):
    if not getattr(user, "is_authenticated", False):
        return qs.none()
    if getattr(user, "is_staff", False):     # admin + root = 作者
        return qs                            # 看到/可编辑全部共享内容
    return qs.none()                         # 普通用户 / 匿名 → 空集
```

- **作者（`is_staff`）共享单一内容池**，**不再按 owner 隔离作者之间**；`field` 参数为兼容旧调用点保留，**已不参与过滤**
- 个人性数据（AI 对话/模板、收藏、个人资料）仍按 user 隔离
- **读者例外**：收藏（`DocumentViewSet.favorite/favorites`）、评论（`comments._commentable_doc`）**故意绕过** scope，按博客可见性取公开文档——勿误改回 scope
- 改动内容查询/写守卫（含 `serializers._assert_owned`、`blog._kb_can_manage`）务必遵守此语义

---

## 7. 扩展开发索引

| 目标 | 起手处 |
|------|--------|
| 新编辑器块 | `frontend/src/components/editor/MathNode.tsx`（自定义 Tiptap 节点 + Markdown 序列化范本） |
| 新斜杠命令 | `frontend/src/components/editor/slashCommandRegistry.ts` |
| 新 AI 操作 | `backend/apps/ai/prompts.py` 加模板 + `services.py` 暴露 + 前端菜单；或 UI 建自定义模板（零代码） |
| 新 AI 模型 | `apps/ai/services.AVAILABLE_MODELS` 注册（带 provider/vision/thinking）+ `apps/ai/pricing.py` 加价 + 视需要补 `FALLBACK_CHAIN` |
| 新导出格式 | `backend/apps/exporter/services/` 加 `<format>_export.py`，注册到 `tasks.run_export` 的 `FORMAT_DISPATCH` |
| 新公开 API | `apps/blog/views.py`（公开端）+ `apps/<your>/views.py`（私域端，记得 `scope_queryset`） |
| 新主题 | `frontend/src/styles/theme.css` 加 `[data-theme='xxx']`；`stores/theme.ts` `ThemeMode` 加成员 |
| 新图标 | 动作类先查 `components/common/actionIcons.ts` 语义别名（AntD 为底）；自制线稿 `JzIcon.tsx`（59 枚）；侧栏/主题 `JzIconKit.tsx`（14 枚，设计稿 + 描边族）；尺寸走 `iconSize.ts` 八档 |
| 多租户过滤 | `apps/accounts/scoping.py` 是唯一权威，所有 viewset 用 `scope_queryset(qs, request.user)` |
| 新读者入口 / 新媒体子目录 | 读者可见必须经 `apps/knowledge/audience.py visible_documents`；新增 `media/<子目录>` 须在 `editor/media_auth._document_id_for` 登记，否则一律 404 |
| 新快捷键 | `frontend/src/shortcuts/registry.ts` 登记 id/scope/chord，组件用 `useShortcut(id)`，显示用 `withShortcut`/`<Kbd>`（纪律测试锁定） |
