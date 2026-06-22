# 简斋 · 架构与数据模型

> 实现向参考：四层架构、11 个 Django app、数据模型、请求时序、扩展入口。
> 上手导览见 [dev-guide/simple.md](./dev-guide/simple.md)；权限体系见 [permissions.md](./permissions.md)。
> 本文基于源码核对（2026-06-21），与代码不一致以代码为准。

---

## 1. 四层架构

```
[ 客户端 SPA :3001 ]  React 18 + TS 5 + Vite 5 + AntD 5 + Zustand + Axios
          │  /api · /media · /feed.xml （Vite dev 代理，每请求强制新 TCP 连接）
[ 边缘/代理 ]  Session + CSRF（CSRF_COOKIE_HTTPONLY=False）· DRF 节流 · CORS 白名单
          │
[ 应用层 :8002 ]  Django 5.2 + DRF 3.15（Python 3.12）· 11 个本地 app
          │  保存后 transaction.on_commit → Celery .delay()（避免 worker 读未提交）
[ 持久层 ]  PostgreSQL 14+（search_vector GIN）· Redis（缓存 DB0 / broker DB1 / result DB2）· MEDIA_ROOT
```

- **编辑器内核**：Tiptap 3（富文本）/ CodeMirror 6（Markdown 源码）/ textarea（HTML）三模式，统一以 Markdown 持久化
- **apps.ai** 通过 SDK 代理 Anthropic Claude / DashScope（通义千问）；**API Key 仅存后端 `.env`，前端永不持有**

---

## 2. 十一个 Django app

| App | 关键文件 | 职责 |
|-----|----------|------|
| `accounts` | `scoping.py` `permissions.py` `hero.py` `views.py` `models.py` `captcha.py` | 登录（三因子:密码+邮箱匹配+滑块验证码）/ Session / 用户 CRUD / **scope_queryset** / **四角色 RBAC** / **友邻闸门** / 账号自服务 / **题记（HeroSettings）** |
| `knowledge` | `models.py` `views.py` `tree.py` `trash_views.py` | `KnowledgeBaseCategory` / `KnowledgeBase` / `Folder` / `Document` 核心 CRUD、`tree/reorder` 调序、回收站 |
| `editor` | `views.py` `import_word.py` | 附件上传、Word / Markdown / ZIP 导入、本地图片打包 |
| `versioning` | `services.py` `diff.py` | `DocumentVersion` 快照 + 行级/字符级 diff + 回滚 |
| `linking` | `parser.py` `tasks.py` | 解析 `@[title](doc:N)` → `DocumentLink`；反链 API；图谱节点 + 边 |
| `search` | `services.py` `tasks.py` | jieba 切词 → `tsvector`；`/search/`；`reindex_search` 命令 |
| `tags` | `models.py` `views.py` | 标签可挂 KB / Folder / Document；空 color 自动派生 djb2 hash |
| `comments` | `models.py` `views.py` | 文档级与段落级（`block_id`）评论；单用户自动通过审核 |
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

- `KnowledgeBase`：`owner` / `name` / `slug` / `description` / `cover_image` / `accent_color` / `visibility`（private/public）/ `category` FK / `doc_sort_mode`（custom/title/created_at/updated_at/doc_format）/ `order` / 软删字段
- `Folder`：self-FK `parent` 可嵌套 + `order` + 软删字段
- `KnowledgeBaseCategory`：`owner` / `name` / `slug` / `description` / `accent_color` / `order`

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

### AI 模型 / HeroSettings

字段详见 [ai.md](./ai.md)（AISettings / AIUsageLog 含 `estimated_usd` / AIPromptTemplate / AIConversation）与 [frontend.md](./frontend.md)（HeroSettings 含 `enabled` / `play_order`）。

---

## 4. URL 总览（`/api/v1/`）

```
auth/            csrf · captcha(滑块取题) · session(含 require_login) · login(三因子:密码+邮箱匹配+滑块) · logout · me · system-info(IsRoot)
auth/me/         avatar · change-password · change-email · change-username   账号自服务
auth/hero/  /hero/batch/      题记：员工读写 + 批量导入
auth/users/                   UserViewSet（可见范围按角色）
kbs|folders|documents|kb-categories/   knowledge CRUD（DRF Router）
tree/reorder/                 批量调序与父子关系
document-templates/
trash/  /trash/kbs/<pk>/restore  /trash/empty  …  回收站（purge/empty = IsRoot）
uploads/  imports/  imports/batch/  imports/zip/   附件上传 + Word/MD/ZIP 导入
attachments/  documents/<id>/attachments/  link-preview/
documents/<id>/{preview,backlinks,versions,comments,tags}/   含 versions/diff · restore
kbs/<id>/tags/  folders/<id>/tags/  tags/
links/graph/                  知识图谱
search/                       全文搜索
exports/  exports/<pk>/download/   异步导出
ai/capabilities · settings · run · stream · chat · estimate · usage(+csv) · templates · conversations
public/posts(by-id/by-slug/adjacent/related/backlinks) · kbs(tree) · tags · archive · kb-categories · hero
/feed.xml  /sitemap.xml  /robots.txt  /django-admin/
```

> **友邻闸门**：所有 `/api/v1/public/*` 经 `PublicOrLoginGated`——`SITE_REQUIRE_LOGIN=false` 全开放；`true` 时未登录 403，前端引导登录。

---

## 5. 双内容形态与乐观并发

### 5.1 自动保存时序

- 编辑器 `onUpdate` **200ms** 防抖 → 推 Markdown 给 React 父
- 父组件 **5s** 防抖 → 发 PATCH（带 `expected_version`）
- 服务端事务内 `select_for_update`：版本不匹配 → 409 + 当前快照
- 写入成功 → `transaction.on_commit` 再 Celery `.delay()`，避免 worker 读未提交
- Worker 异步刷搜索索引 + 重建 `DocumentLink`
- 状态栏 idle → pending → saving → saved；未启动 worker 时保存仍成功（200），但搜索/链接滞后

### 5.2 发布版独立编辑

`raw_content` 与 `published_content` 是两套独立内容：

- `PUT /documents/{id}/published-content/` 单独 PATCH 发布版
- `POST /publish/` `POST /unpublish/` 状态切换，同样可带 `expected_version`
- 博客端只读 `published_content`，编辑器默认读 `raw_content`

### 5.3 Celery 任务

| 任务 | 触发 | 行为 |
|------|------|------|
| `search.refresh_document_vector` | Document/Tag/Comment 保存后 | jieba 分词 → tsvector |
| `linking.sync_document_links` | Document 保存后 | 重建 outgoing_links |
| `exporter.run_export` | `POST /exports/` | 跑导出，写 file_path / status；broker 不可达时 create 内联 fallback |

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
| 新斜杠命令 | `frontend/src/components/editor/slashCommandRegistry.tsx` |
| 新 AI 操作 | `backend/apps/ai/prompts.py` 加模板 + `services.py` 暴露 + 前端菜单；或 UI 建自定义模板（零代码） |
| 新 AI 模型 | `apps/ai/services.AVAILABLE_MODELS` 注册（带 provider/vision/thinking）+ `apps/ai/pricing.py` 加价 + 视需要补 `FALLBACK_CHAIN` |
| 新导出格式 | `backend/apps/exporter/services/` 加 `<format>_export.py`，注册到 `tasks.run_export` 的 `FORMAT_DISPATCH` |
| 新公开 API | `apps/blog/views.py`（公开端）+ `apps/<your>/views.py`（私域端，记得 `scope_queryset`） |
| 新主题 | `frontend/src/styles/theme.css` 加 `[data-theme='xxx']`；`stores/theme.ts` `ThemeMode` 加成员 |
| 新图标 | 首页/编辑器 `JzIcon.tsx`；侧栏 `JzIconKit.tsx`（设计稿系列 + tone 色） |
| 多租户过滤 | `apps/accounts/scoping.py` 是唯一权威，所有 viewset 用 `scope_queryset(qs, request.user)` |
