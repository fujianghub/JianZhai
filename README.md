# 简斋 / JianZhai

[![tests](https://github.com/fujianghub/JianZhai/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/fujianghub/JianZhai/actions/workflows/tests.yml)

个人知识库 + 个人博客一体化系统（Monorepo · **v0.9.10+**，编辑器已追平语雀 · 含**四角色权限体系 RBAC** / 安全复审 / 性能优化 9 Phase / Mermaid 离线导出 SVG）。

一份内容**既是私人笔记**（`raw_content`），**也是公开博客**（`published_content`）—— 通过手动发布在两种形态间切换。采用**四角色权限体系（RBAC）**：根 root / 管理员 admin（作者）/ 普通用户 user（读者）/ 匿名 anon —— **作者共享单一内容池**，读者只读博客 + 收藏 + 评论 + 改资料（无创作权），根独占不可逆销毁与全量用户管理。博客可切「全开放 / 友邻可见（需登录）」两种形态。附带**腾讯云生产部署套件**（见 [`infra/`](infra/)）。

## 文档

| 面向 | 文件 |
|------|------|
| **AI 助手 / 贡献者操作手册**（不变量 + 怎么干活 + 指针） | [CLAUDE.md](./CLAUDE.md) |
| 架构 / 数据模型 / URL / 时序 / 扩展索引 | [docs/architecture.md](docs/architecture.md) |
| 编辑器（Tiptap / CM6 / 表格 / KaTeX / Mermaid） | [docs/editor.md](docs/editor.md) |
| AI 多供应商（模型 / 降级 / 预算 / 用量 / 价格） | [docs/ai.md](docs/ai.md) |
| 全文搜索 + 导出（5 格式 + anthology + 离线 SVG） | [docs/export-search.md](docs/export-search.md) |
| 视觉系统 / 主题 / 题记 / 图标 / 布局 | [docs/frontend.md](docs/frontend.md) |
| 部署运维 + LAN HTTPS + 安全控制点 | [docs/deployment.md](docs/deployment.md) |
| **权限 / RBAC 权威清单** | [docs/permissions.md](docs/permissions.md) |
| 版本历史 | [docs/CHANGELOG.md](docs/CHANGELOG.md) |

> 公开 KB「简斋·开发指南」正文源在 [`docs/dev-guide/`](docs/dev-guide/)（含 `simple.md` 上手 / `detailed.md` 详解），执行 `python manage.py seed_architecture_kb` 后访问 http://localhost:3001/kb/dev-guide。
> 根 / 管理员登录后台可在 **[架构总览](http://localhost:3001/admin/overview)** 查看实时统计与系统架构图。

## 主要能力

| 模块 | 说明 |
|------|------|
| **知识库** | KB / 文件夹嵌套、树拖拽排序、软删除回收站、封面与主题色 |
| **编辑器** | Tiptap 3 + **CodeMirror 6**（MD 源码，语雀级）：**富文本 / Markdown / HTML** 三模式；MD 源码模式浮动格式条 / 智能续列表 / 表格辅助 / **Live Preview 就地渲染** / 行级双向滚动同步；富文本表格**单元格染色 + 悬浮行列 + 冻结首行列**；数学、分栏、Mermaid、PlantUML、DocCard、`@` 提及、块菜单、图片工具栏等；完整编辑两栏铺满（正文限宽 + 大纲右栏 sticky） |
| **章节编号 + 目录（语雀式）** | 标题**自动分级编号**（`1/1.1/1.1.1`，按嵌套深度压缩；显示层不改源码，每篇开关）——编辑器/阅读/导出四端一致；**可插入目录**（`[TOC]` 全文 / `[TOC:section]` 本节）自动汇总标题并跳转；导入时可选自动编号 + 文首插目录；博客内联「编辑」双写发布版+私人版即时上博客 |
| **HTML 博客阅读** | 发布版为完整 HTML 时，前台用 `HtmlPostReader` 原位 iframe 阅读（附件 `src` + 样式保留） |
| **版本与协作辅助** | DocumentVersion 快照、行级/字符级 diff、回滚（每文档保留 100 个）；乐观并发 `expected_version` 防覆盖 |
| **链接与图谱** | `@[title](doc:id)` 双向链接、反链面板、`react-force-graph-2d` 知识图谱 |
| **搜索与标签** | PostgreSQL `tsvector` + jieba；索引 **标题 + 正文 + 标签名 + 评论**；全局 `⌘K` |
| **评论** | 文档级 + 段落级（`block_id`） |
| **导出** | Markdown / HTML / PDF（Playwright）/ Word / 整站 zip；KB **HTML 合订本**为单文件「目录 + 一次一篇」面板（Markdown 渲染扩展语法、HTML 文档 `iframe` 原样保留样式）；PDF 展开全部篇章并扁平化 HTML 篇；**Mermaid 离线渲染为内联 SVG**（HTML/PDF/静态站，headless Chromium + vendored mermaid，缺失时降级源码面板）；PlantUML 仍为代码块 |
| **公开博客** | 匿名 / 友邻可见两形态（`SITE_REQUIRE_LOGIN`）；**6 套主题**（含 4 个环境氛围层：星空/深海暗色 Canvas 粒子 + 春水 WebGL 水面 / 冬雪飘雪亮色）+ 纸张样式，切换器为**单按钮下拉**（调色全交 CSS token，无用户自选 accent）；首页**题记**名句轮播（朝代/作者/篇名 + 4 种动画 + **随机播放**/悬停暂停/点击切换）；归档 / 标签云 / RSS；**同 slug 多 KB 时** API 与 `?kb=` 消歧 |
| **阅读器定制** | 读者侧分组工具条（字体/纸张/排版/专注，等高 28px）；**排版三件套**字号缩放 / 行距 / 版心宽度 + 一键重置（落 localStorage、CSS 变量 scope 到 `<article>`、不触碰文档）；**专注/沉浸模式**隐藏导航与侧栏、Esc 退出；阅读进度条带百分比；**PDF 阅读**内嵌书签解析为目录侧栏 + 整页连续滚动（IntersectionObserver 懒渲染）+ 在新标签用浏览器原生阅读器打开 |
| **AI 助手** | 后端代理（`/admin/ai`），**多供应商**：Anthropic Claude（Opus 4.7 / Sonnet 4.6 / Haiku 4.5）+ 阿里**通义千问**（Max/Plus/Turbo/VL）；8 内置操作 + **自定义模板** + **多轮对话**；SSE 流式、选区 AI + 全文抽屉、视觉图片输入、扩展思考、按用户**日预算**、失败自动降级、用量热图；未配置 Key 时优雅降级 |
| **账号 / 权限** | **四角色 RBAC**：根（唯一、不可禁用/删除、独占删 KB/大类/永久删/清空回收站）/ 管理员（作者，共享内容池）/ 普通用户（读者，无创作权）/ 匿名；用户管理可见范围按角色收口；新建账号**邮箱必填**；自助改密码/邮箱/用户名/头像。**登录三因子**：密码 + 邮箱匹配 + 服务端拼图滑块验证码。详见 [docs/permissions.md](docs/permissions.md) |
| **组织** | KB **大类**分组、文档置顶、收藏夹（博客 `/favorites` + 后台侧栏「收藏」入口）、多种排序、回收站 UI |
| **题记管理** | `/admin/hero`：dnd-kit **整行拖拽排序**、批量导入 / **导出备份**、预览翻看、播放顺序（随机洗牌 / 顺序） |
| **视觉** | 博客：宣纸朱砂古风；后台：玄黑·玻璃拟态 + 翡翠重音；**100% 自制图标**（`JzIcon` 50 枚 + 侧栏设计稿 `JzIconKit` 15 枚，tone 十色三主题联动）；PWA + 印章 favicon |

## 技术栈（摘要）

| 层 | 选型 |
|----|------|
| 后端 | Python 3.12 · Django 5.2 · DRF · PostgreSQL · Redis · Celery · jieba |
| 前端 | React 18 · TypeScript · Vite 5 · Ant Design 5 · Zustand · Tiptap 3 |
| AI | `anthropic` SDK（Claude）· `openai` SDK 兼容模式（通义千问 DashScope） |
| 可选 | Playwright（PDF）· `python-docx`（Word） |
| 部署 | Docker Compose（prod）· Caddy（HTTPS 反代 + SPA fallback）· Gunicorn · pg_dump 备份（见 [`infra/`](infra/)） |

## 仓库结构

```
jianzhai/
├── backend/                # Django 5 + DRF（:8002）
│   └── apps/
│       ├── accounts/       # 多用户 · 根管理员 · 自助改密/邮箱/用户名 · Hero 名句 · 友邻闸门
│       ├── ai/             # 多供应商代理（Claude + 通义千问）· 模板 · 对话 · 预算 · 用量日志
│       ├── knowledge/      # KB · 大类 · Folder · Document · 置顶/收藏/排序
│       ├── editor/         # 附件 · Word/MD 导入 · HTML 正文处理
│       ├── versioning/     # 快照 · diff · 回滚
│       ├── linking/        # 双向链接 · 反链 · 图谱 API
│       ├── search/         # tsvector · jieba
│       ├── tags/           # 标签（KB / Folder / Document）
│       ├── comments/       # 文档级 + 段落级评论
│       ├── exporter/       # 异步导出
│       └── blog/           # 公开 API · RSS · slug 安全解析 · 友邻闸门
├── frontend/               # Vite + React 18 + TS + AntD 5 + Tiptap 3（:3001）
├── infra/                  # 腾讯云部署套件：Dockerfile · docker-compose.prod · Caddyfile · deploy/backup.sh
└── docker-compose.yml      # PostgreSQL 16 + Redis 7（本地开发）
```

## 快速开始

### 1. 启动基础设施

```bash
docker compose up -d   # PostgreSQL + Redis
```

| 服务 | 地址 | 默认账号 |
|------|------|----------|
| PostgreSQL | `localhost:5432` | 库/用户/密码均为 `jianzhai` |
| Redis | `localhost:6379` | — |

### 2. 后端

```bash
cd backend
cp .env.example .env             # SECRET_KEY / DATABASE_URL / REDIS_URL 等
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e .                   # 核心依赖
pip install anthropic              # AI（可选）
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8002
```

### 3. 前端

```bash
cd frontend
corepack enable                    # 首次启用 pnpm
cp .env.example .env               # VITE_API_BASE_URL 等
pnpm install
pnpm dev                           # 监听 :: :3001（双栈），局域网 http://<本机IP>:3001
```

**本机 `localhost:3001` 打不开、但 IP 可以**：多半是 `localhost` 解析到 IPv6 `::1` 而旧配置只监听 IPv4；现 Vite 使用 `host: '::'`。仍失败时请试 `http://127.0.0.1:3001`。

**局域网 / 域名访问**：从其他设备不要用 `localhost`（那指向对方本机）。在 [`backend/.env`](backend/.env) 设置 `JIANZHAI_PUBLIC_ORIGIN` 为浏览器地址栏的 origin（如 `http://<服务器IP>:3001` 或 `https://your.example.com`），可选同时设 `SITE_PUBLIC_URL`，**完全重启 Django** 后 POST/导出才过 CSRF。开发时前端走 Vite `/api` 代理，**不要**把 `VITE_API_BASE_URL` 指到另一台机器的 `localhost:8002`。

### 4. Celery（搜索索引 / 双向链接 / 导出）

```bash
cd backend && source .venv/bin/activate
celery -A jianzhai worker -l info
```

未启动 worker 时，文档保存仍正常，但搜索向量与链接索引不会异步更新。标签 / 评论变更也会触发对应文档的索引刷新。

**升级至 v0.9.1 后**（若搜索范围曾较旧），请执行一次全量重建：

```bash
cd backend && python manage.py reindex_search
```

### 5. AI 助手（可选 · 多供应商）

任配置其一即可，互不依赖；两者皆未配置时 AI 端点优雅降级。

1. **Anthropic Claude**：在 [Anthropic Console](https://console.anthropic.com/settings/keys) 申请 Key → `backend/.env` 加 `ANTHROPIC_API_KEY=sk-ant-...`（`pip install anthropic`）
2. **阿里通义千问**：在 [DashScope](https://dashscope.console.aliyun.com/) 申请 Key → `.env` 加 `DASHSCOPE_API_KEY=sk-...`（走 OpenAI 兼容模式，无需额外 SDK 选项）
3. 重启 Django，后台打开 **AI 助手**（`/admin/ai`）：选默认模型（Claude Opus/Sonnet/Haiku 或 通义 Max/Plus/Turbo/VL）、设 `max_tokens`、扩展思考、每用户**日预算**、失败降级开关；可建**自定义操作模板**、查看**用量热图**与多轮**对话**历史。

### 6. 种子数据（可选）

```bash
cd backend && python manage.py seed_architecture_kb
```

## 常用地址

| 页面 | URL |
|------|-----|
| 博客首页 | http://localhost:3001/ |
| 后台登录 | http://localhost:3001/admin |
| 架构总览（超管） | http://localhost:3001/admin/overview |
| AI 管理（超管/员工） | http://localhost:3001/admin/ai |
| 题记管理（员工） | http://localhost:3001/admin/hero |
| 收藏 | http://localhost:3001/admin/favorites |
| 账号设置（自助） | http://localhost:3001/admin/profile |
| API 根路径 | http://localhost:8002/api/v1/ |
| RSS | http://localhost:8002/feed.xml |

## 开发约定

- **后端**：每个 Django app 独立 `models.py` / `serializers.py` / `views.py` / `urls.py`；内容访问用 `apps.accounts.scoping.scope_queryset`（**角色制共享池**：作者 `is_staff` 看全部、读者/匿名空集，不再按 owner 隔离）
- **前端**：公共逻辑放在 `src/api`、`src/components/common`、`src/utils`；后台菜单与博客导航优先使用 `JzIcon`
- **格式化**：Ruff + Black（Python），Prettier + ESLint（TS）
- **文档 slug**：库内按 KB 唯一；公开详情 API 支持 `?kb=<kb_slug>`，全局重复时按发布时间取最新一篇

## 阶段

| 版本 | 要点 |
|------|------|
| v0.1–v0.5 | KB、编辑器、博客、搜索、导出、评论、标签、RSS |
| v0.6–v0.8 | AI、Tiptap 扩展、玻璃后台、全屏编辑、大纲 |
| v0.9 | JzIcon、HTML 博客阅读、架构总览页、公开 slug 消歧 |
| v0.9.1–v0.9.3 | 搜索含标签/评论；KaTeX 全链路 + 语雀式 Mermaid/PlantUML（全屏/下载）；HTML 阅读懒加载；LAN HTTPS dev；AI 用量日历热图 |
| v0.9.5 | Hero 名句轮播（朝代/作者/篇名 + 4 动画）、KB 大类/置顶/收藏/排序、回收站 UI、收藏夹 |
| v0.9.7 | AI 全面增强：多供应商（Claude + 通义千问）、自定义模板、多轮对话、视觉输入、扩展思考、日预算、失败降级、实时 Markdown 渲染 |
| **v0.9.8** | 腾讯云部署套件（Docker Compose + Caddy + 备份）+ 友邻可见博客闸门（`SITE_REQUIRE_LOGIN`） |
| v0.9.9 | 根管理员分级 + 新建账号邮箱必填 + 用户自助改密码/邮箱/用户名/头像；上传进度条 + 批量全选 + 可视化颜色选择器 |
| **v0.9.10** | 题记增强：随机播放（每次开页洗牌、整轮不重复）/ 悬停暂停 / 点击切换；管理页 dnd-kit 拖拽排序 + 导出备份；「首页题记」改名「题记」 |
| **图标体系定稿** | 三区三语言：侧栏接入设计稿 `JzIconKit`（15 枚淡染裸放 + tone 十色）；博客顶栏回归最初版浅染族；主题四枚 AntD；侧栏新增「收藏」入口；卸载 hugeicons |
| **编辑器追平语雀** | MD 源码模式换 **CodeMirror 6**（浮动格式条/智能列表/表格辅助/行级滚动同步/`EditorSurface` 适配层）+ **Live Preview** 就地渲染；富文本表格单元格染色 + 悬浮行列 + grip 拖移 + 冻结首行列 + `.jz-table-wrap` 滚动；`convertLayoutBlocks` 根治 callout 劫持 |
| **安全复审 + 性能 9 Phase** | 六领域安全加固（TLS/闸门/`raw_content`/AI 预算预留/iframe 去同源）；defer 大正文 + 软删索引 + 消 N+1 + AI 缓存 + 公开缓存 + 拆 chunk + 请求去重 + 编辑器防抖 + 导出流式（255+275 测试绿） |
| **Mermaid 导出 SVG + 两栏铺满** | HTML/PDF/静态站把 Mermaid 块离线渲为内联 SVG（headless Chromium + vendored mermaid）；完整编辑两栏铺满（正文限宽 + 大纲右栏 sticky）；Mermaid 净化修复（foreignObject/dy）；图表操作条亮色灰字修复 |
| **MD 本地图片打包** | 导入 `.md` 的 `./images/x.png` 相对图不再 404：整文件夹 / 两步选择器 / ZIP 三入口共用资产打包（图→附件 + 改写为 `/media/`）|
| **四角色权限体系 RBAC** | 根 / 管理员 / 普通用户 / 匿名（`get_role` 唯一入口 + `IsContentAuthor`/`IsRoot`）；`scope_queryset` 由 owner 隔离改**作者共享单一池**；普通用户=读者；删除分级（删 KB/大类/永久删/清空回收站=仅根）；权威清单 `docs/permissions.md` |
| **登录三因子 + 滑块验证码** | 登录 = 用户名/密码 + **邮箱匹配** + **服务端古风拼图滑块验证码**（Pillow 生成、Redis 一次性答案、缺口仅由像素传达防脚本）；登录页去 label 紧凑化 + 线条图标焦点高亮 |
| **阅读排版定制 + 专注模式** | 博客阅读设置收为分组工具条胶囊；**排版三件套**字号缩放 / 行距 / 版心宽度 + 一键重置（CSS 变量 scope 到 `<article>`、仅 Markdown 阅读路径）；专注/沉浸阅读模式（隐藏导航与侧栏、Esc 退出）；阅读进度条加百分比 |
| **用户标签 + KB/大类朋友圈式可见性** | 作者给读者打 `UserTag`（用户列表按标签/搜索筛选，标签对读者隐藏）；KB/大类三态受众 `audience_mode`（全员可见 / 部分不可见 / 仅部分可见，按用户 + 标签定向）——`apps/knowledge/audience.py` 统一收口全部读者入口（列表/直链/搜索/收藏/评论/RSS），作者绕过；受众名单禁含作者（400 防误触） |
| **6 套主题 + 切换器收敛 + PDF 阅读器 + 上传 2GB** | 新增**春水/冬雪**两个亮色氛围主题（春水 = `ogl` WebGL 水面 shader + 花瓣层；冬雪 = Canvas 飘雪/积雪）+ 星空/深海重写为 Canvas 粒子系统；主题切换器由「4 宫格 Segmented + 主题色 Popover」合并为**单按钮下拉**，**移除用户自选 accent preset 体系**（`AccentPreset`/`setAccent` 删除，调色全交 CSS token，写死翡翠收敛为 `var(--jz-accent)`）；**PDF 阅读器**内嵌目录解析 + 整页连续滚动 + 在新标签打开；单文件上传上限 50MB → **2GB**（超阈值流式落临时磁盘，避免撑爆内存） |
| **章节自动编号 + 目录生成（语雀式）** | 标题自动分级编号（`1/1.1/1.1.1`，栈压缩按嵌套深度；**显示层不落盘**、每篇文档开关 `heading_numbering`）——共享 `utils/headingNumber.ts` 四端一致（阅读 / CM6 / Tiptap / 大纲）；插入目录 `[TOC]`（全文）/ `[TOC:section]`（本节子树，位置感知展开）+ 斜杠命令；导入选项（自动编号 / 文首插目录）；导出端（HTML/PDF/站）补齐锚点+编号+TOC；**内联「普通编辑」双写** `raw_content`+`published_content`（修 raw≠published 断层，`patchDocumentBody`）。前端 15 + 后端 11 测试 |
| **阅读字号滑块 + Word 一体化 + PPT 阅读** | 博客阅读加**字号滑块 50–150%**（与步进器共驱 `--jz-reader-scale`）；**Word 一体化保真导入**——`docx_import.py` 表格/图片保真（占位符保护 `<table>` + mammoth 图片落 Attachment），并修复 docx 正文**从未真正提取**的 latent bug（mammoth 需 `BytesIO` 而非 bytes），docx 现走 MD 阅读管线（目录/排版/内联+完整编辑）；**PPT 有道云式阅读**——`soffice --headless` → `pdftoppm` 转 PNG（Celery `convert_pptx_to_slides` 幂等）+ `SlideImage` 模型 + `PptxReader` 缩略图侧栏/键盘/缩放/全屏/轮询（需线上镜像加 libreoffice/poppler）。前端 tsc + 后端 100 测试 |
| **PPT 缩略图修复 + 讲者备注** | 修复缩略图导轨显示成「一条横线」——`.jz-pptx-rail` 有界 flex-column 里 ~90 个缩略图按钮默认 `flex-shrink:1` 被压扁到 ~4px，`flexShrink:0` + `aspectRatio` 根治（后端数据本无恙）；**新增讲者备注**——`python-pptx` 抽 `slide.notes_slide` 文本存 `SlideImage.notes`（迁移 `editor 0004`、`as_dict` 带出）+ `PptxReader` 主图下方可折叠备注面板（逐页/空页提示/可复制/全屏）；`manage.py backfill_pptx_notes` 只回填备注不重转存量 deck。后端 +4 测试，已于 2026-07-10 部署上线 |
| **Word 字体色保真 + 语雀 MD 远程图修复** | **Word 导入字体色**——mammoth 默认丢弃 run 级直接颜色（`w:rPr/w:color`）致彩字历来全丢；`_mark_run_colors` 转换前在 docx XML 层给带色 run 包哨兵、最终 md 换回 `<span style="color:#hex">`（表格内彩字同样保真；导出端彩色仍丢为已知限制）。**语雀远程图不显**（双因叠加）——`cdn.nlark.com` 防盗链致浏览器带 Referer 直连 403 图裂（前端 `referrerpolicy="no-referrer"` 破解）+ 上传请求内串行镜像 40+ 张图超时被中断（改 Celery 异步 `mirror_document_images` + 线程池并行，仅含远程图才派发）。后端 58 + 前端 71 测试 |
| **双击图片放大预览** | 正文图片双击开全屏遮罩（滚轮缩放 / 拖拽平移 / Esc / 点背景关闭），接入阅读页 / 实时预览 / 附件预览四个渲染面；**修复 lightbox 从未生效的时序 bug**——`useImageLightbox` 原依赖恒稳的 `containerRef` 致 effect 只跑一次，而阅读页正文异步加载前先渲染 `<Spin/>`、首挂载时 `ref.current` 为 null → 早退且永不重绑，点击委托从未绑上；重写为 `selector`+`bindKey` 范式（对齐 `TableEnhancer`）根治。新增 happy-dom DOM 集成测试，342 测试绿。已于 2026-07-17 部署上线 |
| v1.0 候选 | 增量保存、Tiptap lazy rendering、超大 KB 树分页、Yjs 协作 |

## 生产部署（腾讯云）

完整套件在 [`infra/`](infra/)，详见 [`infra/README.md`](infra/README.md)（含域名 / ICP 备案 / DNS / 启动流程）。

```bash
cd infra
cp .env.example.prod .env          # 填 SECRET_KEY / 数据库 / 域名 / AI Key 等
./deploy.sh                        # 构建并启动 6 容器：caddy · backend(gunicorn) · celery · postgres · redis · backup
```

- **Caddy** 自动签发 HTTPS 证书、反代后端、SPA 路由 fallback
- `SITE_REQUIRE_LOGIN=true` 开启**友邻可见**：匿名访客被引导登录，仅白名单账号可读博客
- `backup.sh` 每日 `pg_dump`；`JIANZHAI_ROOT_ADMIN_USERNAME` 指定根管理员账号

## 已知限制

- 超大知识库的树接口仍一次性返回全量节点（v1.0 候选：懒加载 / 分页）
- PDF 导出需安装 Playwright（`pip install -e .[pdf]` + `playwright install chromium`）

## License

个人项目，无公开 license。如需 fork / 商用请联系作者。
