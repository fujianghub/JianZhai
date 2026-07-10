# 简斋 / JianZhai — AI 开发指南

> 个人知识库 + 公开博客一体化系统（双形态合一）。
> 本文是给 AI 助手的**操作手册**：项目坐标 + 怎么干活 + 不可违背的不变量 + 深度参考指针。
> 完整实现细节在 `docs/`（按需 Read，**勿全量内联**）；历史坑/决策在 memory（`MEMORY.md` 索引）。

---

## 项目坐标

- **Monorepo**：`backend/`（Django 5.2 + DRF 3.15，Python 3.12，端口 **8002**）+ `frontend/`（React 18 + TS 5 + Vite 5 + AntD 5，端口 **3001**）
- **部署**：本地单机 `localhost`；生产腾讯云 Docker Compose + Caddy（套件在 `infra/`）
- **核心理念**：**一份内容两形态** —— `raw_content`（私人笔记）+ `published_content`（发布版）
- **四角色 RBAC**：根 root / 管理员 admin（作者）/ 普通用户 user（读者）/ 匿名 anon。**作者共享单一内容池**，读者只读博客 + 收藏 + 评论 + 资料。权威清单 → `docs/permissions.md`
- **博客形态**：**默认友邻可见**（需登录，匿名访问任何页面直接跳登录页）；`SITE_REQUIRE_LOGIN=false` 可切回全开放（匿名）

---

## 技术栈（版本敏感项）

| 层 | 选型 | 备注 |
|---|---|---|
| 后端 Web | Django 5.2 + DRF 3.15 | Session + DRF SessionAuthentication；登录三因子（密码 + 邮箱匹配 + 服务端滑块验证码） |
| DB / 缓存 / 队列 | PostgreSQL 14+（tsvector + jieba）· Redis 5+（django-redis）· Celery 5.4 | |
| 编辑器内核 | **Tiptap 3**（富文本）+ **CodeMirror 6**（MD 源码）+ textarea（HTML） | 统一以 Markdown 持久化 |
| 渲染/图表 | KaTeX 0.16 · markdown-it · Mermaid 11 · PlantUML · lowlight | |
| AI | `anthropic` SDK（Claude）+ `openai` SDK 兼容（通义千问 DashScope） | 多供应商，任一未配优雅降级 |
| 导出 | Playwright（PDF）· python-docx · Jinja2（静态站） | |
| 前端状态/HTTP | Zustand（auth/theme）· Axios（`api/client.ts`） | |

> 非版本敏感的库清单（UI 拖拽、diff、dompurify 等）查 `package.json` / `pyproject.toml`，不在本文维护。

---

## 怎么干活

- **后端测试用 `pytest`，不是 `manage.py test`**；前端 `pnpm test` + `tsc`
- **改 `backend/.env` 后必须完全重启 Django**（不热加载）
- 本机 dev 三件套（backend/celery/frontend）由 **systemd 自启**；pg/redis docker 自启
- **勿在主 dev server 运行时于同一 `frontend/` 另起共用缓存的 vite/vitest** —— 会致 `.vite` 缓存 desync → 编辑器 `useRef-null` / `@codemirror/state` 多实例崩溃（验证用带 `JZ_API_PROXY_TARGET` 的独立 `cacheDir` 实例）
- 启动/部署细节 → `docs/deployment.md`

---

## 不可违背的不变量

1. **内容池 = 角色制共享**：`scope_queryset` 按 `is_staff` 放行（作者看到/可编辑**全部**共享内容，普通用户/匿名空集），**不再按 owner 隔离作者之间**；`field` 参数残留但不过滤。改任何内容查询/写守卫（含 `serializers._assert_owned`、`blog._kb_can_manage`）务必遵守。
2. **删除分级**：软删文档/文件夹 = 作者（`IsContentAuthor`）；**删 KB / 删大类 / 永久删(purge) / 清空回收站 = 仅根（`IsRoot`）**。
3. **读者例外**：收藏 / 评论端点**故意绕过**作者 scope，按博客可见性取公开文档 —— **勿改回 scope**。
4. **乐观并发**：PATCH / 发布版 PATCH / `publish` / `unpublish` 可带 `expected_version`；服务端事务内 `select_for_update` 校验，冲突 **409 + 文档快照**。
5. **双向链接**：`linking/tasks` 仅接受**同 owner 且未软删**目标；`sync_document_links` 对源文档 `select_for_update` 并把**锁结果赋值给本地变量**（否则取锁即丢），bulk_create 全程 atomic。
6. **导出目录**：`exports/` 刻意**不在 `media/` 下**（否则被 Caddy 公开 `/media/*` 绕过鉴权服出）；backend + celery 须共享命名卷 `exports_data:/app/exports`，否则下载 404。
7. **友邻闸门**：所有 `/api/v1/public/*` 经 `PublicOrLoginGated`；`SITE_REQUIRE_LOGIN` **默认 `true`**（匿名 403 + 前端跳登录页），设 `false` 才放开匿名。前端 `BlogLayout` 与 `DocLinkResolver`(`/d/:id`) 均按此重定向。
8. **AI Key 仅后端 `.env`，前端永不持有**；所有调用走 `apps/ai/` 代理。
9. **登录三因子**：`/api/v1/auth/login/` = 用户名+密码 + **邮箱匹配**（须等于该账号 `User.email`，去空格不区分大小写；无邮箱旧账号跳过）+ **服务端拼图滑块验证码**（`apps/accounts/captcha.py`，Pillow 程序化生成、答案存 Redis 一次性 TTL 120s、缺口仅由像素传达）。先验滑块 → 再验密码/邮箱；任一错统一 401/400 **不泄露是哪项**。取题端点 `GET /auth/captcha/`（独立 `captcha` 限流 30/min；登录仍 `login` 10/min）。前端拖拽**严格 1:1 像素**（改画布尺寸要同步、勿用 CSS scale/zoom 否则对不齐）。无新模型/迁移。
10. **读者受众可见性（朋友圈式）**：KB 与大类各有 `audience_mode`（`all`/`exclude`/`include`，默认 `all` 向后兼容）+ `audience_users`/`audience_tags`（按用户 + `UserTag` 定向）。`apps/knowledge/audience.py` 的 `visible_documents/visible_kbs/visible_categories` 是**唯一收口点**——所有读者入口（blog `_published_qs`、公开 KB/大类、收藏、评论；search 是作者专属无需收口）都必须经它过滤，新增读者入口务必接入，否则直链/搜索泄露。**作者（`is_staff`）一律绕过**（可见性仅对读者）；文档可见 ⇔ KB 可见且（无大类或大类可见）；匿名白名单不可见、黑名单可见。序列化器禁止把作者加入受众名单（`validate_audience_user_ids` → 400）。用户标签 `UserTag` 反向名是 **`account_tags`**（`User.tags` 已被内容标签 `apps/tags` 占用）。

---

## 关键陷阱（详见 memory）

- **Vite dev 缓存 desync** → 编辑器 `useRef-null` / CM 多实例崩溃。**不是代码 bug**；根治 = `systemctl restart jianzhai-frontend.service` + 浏览器 hard-reload。勿在主 server 运行时另起共用缓存的 vite。
- **Tiptap 表格保真**：带色/表级样式表条件序列化为原生 HTML（含 `.jz-table-wrap` + `data-jz-*`），无色保持干净 GFM；**docx 导出彩色/间距会丢**（已知限制）。
- **MD 本地图片导入**：须拖**整个含 `.md` 的文件夹**（图片随上传一起交给后端打包，浏览器沙箱读不了硬盘）；旧文档缺图用 `manage.py import_local_images` 补。
- **AI 日预算对端点流量失效** = 「AI 仅作者 + 管理员绕过预算」两条规格的预期后果，非 bug。
- **博客内联「普通编辑」双写**：博客渲染 `published_content`，而 `raw_content` 自动保存**故意不同步**到 published（`_apply_update` 注释；`get_published_content` 不回退 raw）。故内联编辑（`PostInlineEditor`）走 `patchDocumentBody` **一次 PATCH 双写** raw+published（version 只 +1），否则内联的编辑/`[TOC]` 上不了博客。完整编辑器仍是「编 raw、显式发布」不受影响。
- **章节编号 = 显示层**：序号不写入 `raw/published_content`；改编号逻辑须四端同步（阅读 `markdown.ts heading_open` / CM6 `extensions/headingNumber.ts` / Tiptap `HeadingNumber.ts` / 导出 `markdown_render.py`），算法唯一源 `utils/headingNumber.ts`。`renderMarkdownWithToc` 的 LRU key 必须含 numbering 标志。详见 docs/editor.md §7。

---

## 深度参考（按需 Read，勿内联）

| 主题 | 文件 |
|---|---|
| 架构 / 11 app / 数据模型 / URL / 保存时序 / 扩展索引 | `docs/architecture.md` |
| 编辑器（Tiptap/CM6/表格/KaTeX/Mermaid） | `docs/editor.md` |
| AI 多供应商（模型/降级/预算/用量/价格） | `docs/ai.md` |
| 全文搜索 + 导出（5 格式 + anthology + 离线 SVG） | `docs/export-search.md` |
| 视觉系统 / 主题 / 题记 / 图标 / 布局 | `docs/frontend.md` |
| 部署运维 + LAN HTTPS + 安全控制点 | `docs/deployment.md` |
| **权限 / RBAC 权威清单** | `docs/permissions.md` |
| 版本历史 | `docs/CHANGELOG.md` |
| 人类上手导览 | `docs/dev-guide/simple.md` |
| 历史坑 / 决策复盘 | memory（`MEMORY.md` 索引） |

---

## 红线（叠加全局 `~/.claude/CLAUDE.md`）

- 不自动 `git commit` / `git push`，除非明确要求；提交前先展示变更摘要
- 删文件/目录/git 历史、改 `.env`/密钥/token/CI、`git push`/`rebase`/`reset --hard`/强推 —— **即使 auto-accept 也必须先问**
- 默认中文回复；代码/命令/路径保持英文；结论先行，发现更好做法主动说

---

**最后更新**：2026-07-10（实现状态对应 v0.9.10 + RBAC + 登录三因子滑块验证码 + 阅读排版定制/专注模式 + 默认要求登录 + 用户标签/KB 大类朋友圈式可见性 + 6 套主题 + PDF 阅读器 + 单文件 2GB + 章节自动编号（显示层/每篇开关/嵌套深度压缩，`utils/headingNumber.ts` 四端一致）+ 目录生成（`[TOC]` 全文 / `[TOC:section]` 本节）+ 导入选项 + 导出端对齐 + 内联「普通编辑」双写 raw/published + 阅读字号滑块 50–150% + Word 一体化保真导入（修复 docx 正文从未真正提取的 latent bug：mammoth 需 `BytesIO`；表格/图片保真 → 走 MD 阅读管线）+ PPT 有道云式阅读（LibreOffice→pdftoppm PNG + `SlideImage` 模型 + `PptxReader` 轮询；线上镜像已加 libreoffice/poppler 并于 2026-07-06 部署上线）+ **PPT 缩略图横线修复（`.jz-pptx-rail` flex-column 压缩根因 → 缩略图按钮 `flexShrink:0`）+ PPT 讲者备注（`python-pptx` 抽 `slide.notes_slide` → `SlideImage.notes` 迁移 `editor 0004` → 主图下方可折叠备注面板；存量 `manage.py backfill_pptx_notes` 只回填不重转；生产待重建镜像）**，详见 docs/editor.md §7 与 frontend.md §2/§5）
