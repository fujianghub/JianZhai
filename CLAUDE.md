# 简斋 / JianZhai — AI 开发指南

> 个人知识库 + 公开博客一体化系统（双形态合一）。
> 本文是给 AI 助手的**操作手册**：项目坐标 + 怎么干活 + 不可违背的不变量 + 深度参考指针。
> 完整实现细节在 `docs/`（按需 Read，**勿全量内联**）；历史坑/决策在 memory（`MEMORY.md` 索引）。

---

## 项目坐标

- **Monorepo**：`backend/`（Django 5.2 + DRF 3.15，Python 3.12，端口 **8002**）+ `frontend/`（React 18 + TS 5 + Vite 5 + AntD 5，端口 **3001**）
- **`Test/`**：本地测试文档目录（对应知识库 **Test**，slug `test`，KB id 48），存放复现/验证用的 docx/md/pptx 样本；未纳入 git（`?? Test/`），勿提交
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
- **PPT/Word 导入**：OOXML 是 zip，`.docx/.pptx` 上传经 `_is_valid_zip` 前置校验，**坏文件 400 拒收**（soffice 加载坏源仍退 0，不能靠转换失败兜底）；「PPT 转换失败/未完成」多为**原文件本就损坏**，非管线 bug（管线 md5 往返无罪）。**缩略图变一条横线** = 纯 CSS（`.jz-pptx-rail` flex-column 压缩），后端数据完好，勿去查数据丢失。docx 正文提取靠 mammoth 且**必须传 `BytesIO`**（裸 bytes 会静默走空文档）。详见 docs/editor.md §8。
- **Word 字体颜色**：mammoth **默认丢弃 run 级直接颜色**（`w:rPr/w:color`），故导入字体色历来全丢。修复=`docx_import._mark_run_colors` 转换前在 docx XML 层给带色 run 包 `jzcolor<hex>b…jzcolore` 哨兵、最终 md 换回 `<span style="color:#hex">`（含表格内彩字）。**导出端彩色仍丢为已知限制**。
- **语雀 MD 远程图不显**：双坑叠加——(1) `cdn.nlark.com` **防盗链**：浏览器带外域 `Referer` 直连远程图 → **403 图裂**（修复=前端 `<img referrerpolicy="no-referrer">`，无 referer 服务端/浏览器均 200）；(2) 同步镜像 40+ 张远程图（CDN 限流每张 5–15s）**超请求超时被中断** → 图仍是远程 URL（修复=改 Celery 异步 `mirror_document_images` + `ThreadPoolExecutor` 并行，仅含远程图才派发）。**服务端 fetch 无 referer=200，浏览器直连=403** 是关键区别。详见 docs/editor.md §8。
- **语雀 MD"识别错乱"= 渲染层三兼容 bug**（存储 `raw_content` 本身干净）：(1) **图表注释被 `-->` 截断（主凶）**——语雀导出 mermaid 为 `<!-- 这是一个文本绘图，源码为：… -->` + 静态 SVG，通用注释剥离在源码内部箭头处截断 → 源码泄漏成正文 + `:::jam` 触发失控 callout；修=`recoverYuqueDiagramComments`（前后端镜像）还原 ```mermaid fence（闭合锚定 `-->`+行尾）并丢静态图，**须在通用剥离前**；(2) `<font>` 交替染色句被强调合并正则吞成整句全粗（连接符须 `[^*\n<]`）；(3) CJK 双加粗被 `**A**B**C**` 合并启发式吞并/静默删标记（该步骤已删,空格+`\w` 防线对中文全失效）。**改 `applyYuqueCompatMode` 任何正则须过三类回归**：CJK 标点连接双加粗、font 交替染色句、含 ` --> ` 图表注释；排查导入渲染问题**先 dump 库里 `raw_content`**,勿用用户手头"同一篇"本地文件。详见 docs/editor.md §8。
- **绑 DOM 事件的 hook 勿依赖 `containerRef`**：ref 引用恒稳 → `useEffect(deps=[containerRef])` 只跑一次；而阅读页在正文异步加载完成前先 `return <Spin/>`，首挂载时 `ref.current` 为 `null` → effect 早退且**永不重绑**（`useImageLightbox` 图片放大曾因此长期完全不生效）。一律用 **`selector`+`bindKey` 范式**（依赖 `[selector, bindKey]`，内容落地即重绑），与 `TableEnhancer`/`CodeBlockEnhancer` 同构。详见 docs/frontend.md §5。
- **Tiptap v3 两坑**：① Link 扩展协议白名单（`isAllowedUri`）默认**拒收 `doc:`** → markdown 重载时 `[标题](doc:ID)` 的 link mark 被静默剥成纯文本（已修 `Link.configure({protocols:['doc']})`，新增内部协议须同步）；② `useEditor` 默认**不随 transaction 重渲**，组件 render 里直接 `editor.isActive()/getAttributes()` 拿陈旧快照——依赖 editor 实时状态的 React UI 一律走 `useEditorState({editor, selector})` 订阅。详见 docs/editor.md §9。

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

**最后更新**：2026-07-20（新增：**语雀式链接三形态**——链接可切 链接（URL 原文）/ 标题（目标标题，**默认**：粘贴裸 URL 自动异步取标题，href+旧文本双守卫防覆盖）/ 卡片 三形态 + 打开文档/浏览器访问动作，全端落地：Tiptap `LinkBubbleMenu` + `LinkPasteAutoTitle`、CM6 `pure/linkAt.ts` + `LinkFloatingMenu`、卡片 NodeView hover 回转菜单、阅读端 `convertBlockPlaceholders` 补 `[[link-card:URL]]` 渲染（修字面量泄漏+编辑器重载丢卡片旧缺口）+ `CardEnhancer` 登录态水合、后端 `link-preview` 放宽 `PublicOrLoginGated` + 限流 30/min（抓取抽 `apps/editor/services/link_preview.py`）、导出端 `card_placeholders.py` 渲染/降级零 `[[` 泄漏 + 搜索索引剥卡片语法；顺带修两存量 bug：**Tiptap v3 Link 协议白名单剥 `doc:` mark**（`protocols:['doc']`）与 **v3 组件读 editor 态须 `useEditorState`**；后端 402+前端 384 测试绿 + Playwright 18/18，序列化格式零变更无新迁移，**已推 main（ee1a492）线上未部署**，详见 docs/editor.md §9；下为 2026-07-19 基线）（2026-07-19 基线：**语雀 MD 导入识别错乱三 bug 修复**——① 图表注释 `<!-- 这是一个文本绘图，源码为：… -->` 被通用剥离在源码内部 ` --> ` 处截断致源码泄漏+失控 callout（主凶），修=`recoverYuqueDiagramComments`（前端 `utils/markdown.ts` + 后端 `exporter/markdown_preprocess.py` 镜像）还原原生 ```mermaid fence 并丢弃静态 SVG；② `<font>` 交替染色句被 `normalizeYuqueEmphasis` 步骤 (0) 吞成整句全粗，连接符收紧 `[^*\n<]`；③ CJK 双加粗合并启发式（步骤 (1)）整段删除；真实文档 Playwright 实测 13/13 图水合零泄漏，前端 350 + 后端 exporter 84 测试绿，详见 docs/editor.md §8；下为 2026-07-17 基线）（2026-07-17 基线：**双击图片放大预览**（`useImageLightbox` 重写为 `selector`+`bindKey` 范式，根治「依赖 `containerRef` → 首挂载 `ref.current` 为 null → 永不重绑」致图片预览**从未生效**的时序 bug；双击开遮罩 + 滚轮缩放/拖拽平移/Esc，接入 PostDetail/LivePreviewPane/PublicAttachmentPreview/FilePreview 四面；新增 `happy-dom` devDependency，详见 docs/frontend.md §5）—— **该批（34d137f）连同 2026-07-12 的 Word 导入字体颜色保真（`_mark_run_colors` 哨兵包 run 色 → `<span style="color">`，补 mammoth 丢 run 色）+ 语雀 MD 远程图修复（前端 `referrerpolicy=no-referrer` 破 cdn.nlark.com 防盗链 + 后端 `mirror_document_images` Celery 异步并行镜像，仅含远程图才派发）（a982c02）均已提交并于 2026-07-17 部署上线（main 34d137f；prebuilt 前端 dist 本地构建 + rsync + 重建 backend/caddy 镜像，无新迁移）**；`Test/` 测试文档目录（对应 Test KB）与 `Local_to_Cloud_Server_kb_sysnc.py`（本地→云内容同步脚本）均 gitignore 不入库；下为 2026-07-10 基线）（实现状态对应 v0.9.10 + RBAC + 登录三因子滑块验证码 + 阅读排版定制/专注模式 + 默认要求登录 + 用户标签/KB 大类朋友圈式可见性 + 6 套主题 + PDF 阅读器 + 单文件 2GB + 章节自动编号（显示层/每篇开关/嵌套深度压缩，`utils/headingNumber.ts` 四端一致）+ 目录生成（`[TOC]` 全文 / `[TOC:section]` 本节）+ 导入选项 + 导出端对齐 + 内联「普通编辑」双写 raw/published + 阅读字号滑块 50–150% + Word 一体化保真导入（修复 docx 正文从未真正提取的 latent bug：mammoth 需 `BytesIO`；表格/图片保真 → 走 MD 阅读管线）+ PPT 有道云式阅读（LibreOffice→pdftoppm PNG + `SlideImage` 模型 + `PptxReader` 轮询；线上镜像加 libreoffice/poppler，实际随缩略图批于 2026-07-10 才真正部署上线）+ **PPT 缩略图横线修复（`.jz-pptx-rail` flex-column 压缩根因 → 缩略图按钮 `flexShrink:0`）+ PPT 讲者备注（`python-pptx` 抽 `slide.notes_slide` → `SlideImage.notes` 迁移 `editor 0004` → 主图下方可折叠备注面板；存量 `manage.py backfill_pptx_notes` 只回填不重转）—— 二者含缩略图瘦身批（3fa9ba9：JPEG quality=82 + 320px 缩略图 + B1 坏文件上传 400 拦截 + B2 `Document.slide_status/error` 迁移 `knowledge 0009` 转换态可见）已于 2026-07-10 一并部署上线（main 80343d7）**，详见 docs/editor.md §8（Word/PPT 导入与转换管线）与 frontend.md §5（PPT 阅读器））
