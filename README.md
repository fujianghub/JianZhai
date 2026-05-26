# 简斋 / JianZhai

个人知识库 + 个人博客一体化系统（Monorepo · **v0.9.1**）。

一份内容**既是私人笔记**（`raw_content`），**也是公开博客**（`published_content`）—— 通过手动发布在两种形态间切换。支持多账号，普通用户按 `owner` 隔离数据；超级用户可跨租户管理。

> 详细架构与开发指南见 [CLAUDE.md](./CLAUDE.md)。  
> 超级管理员登录后台后，可在 **[架构总览](http://localhost:3001/admin/overview)** 查看实时统计、技术栈与系统架构图（简单版 Mermaid + 详细 SVG）。  
> 仓库内可一键种子公开 KB「简斋·开发指南」：正文源文件在 [`docs/dev-guide/`](docs/dev-guide/)，执行 `python manage.py seed_architecture_kb` 后访问 http://localhost:3001/kb/dev-guide

## 主要能力

| 模块 | 说明 |
|------|------|
| **知识库** | KB / 文件夹嵌套、树拖拽排序、软删除回收站、封面与主题色 |
| **编辑器** | Tiptap 3：**富文本 / Markdown / HTML** 三模式；数学、分栏、Mermaid、PlantUML、DocCard、`@` 提及、块菜单、图片工具栏等 |
| **HTML 博客阅读** | 发布版为完整 HTML 时，前台用 `HtmlPostReader` 原位 iframe 阅读（附件 `src` + 样式保留） |
| **版本与协作辅助** | DocumentVersion 快照、行级/字符级 diff、回滚（每文档保留 100 个）；乐观并发 `expected_version` 防覆盖 |
| **链接与图谱** | `@[title](doc:id)` 双向链接、反链面板、`react-force-graph-2d` 知识图谱 |
| **搜索与标签** | PostgreSQL `tsvector` + jieba；索引 **标题 + 正文 + 标签名 + 评论**；全局 `⌘K` |
| **评论** | 文档级 + 段落级（`block_id`） |
| **导出** | Markdown / HTML / PDF（Playwright）/ Word / 整站 zip；KB **HTML 合订本**为单文件「目录 + 一次一篇」面板（Markdown 渲染扩展语法、HTML 文档 `iframe` 原样保留样式）；PDF 展开全部篇章并扁平化 HTML 篇；Mermaid 等为静态代码块 |
| **公开博客** | 匿名访问；4 套主题 + 纸张样式；归档 / 标签云 / RSS；**同 slug 多 KB 时** API 与 `?kb=` 消歧 |
| **AI 助手** | Anthropic Claude 后端代理（`/admin/ai`）：8 种操作、SSE 流式、选区 AI + 全文抽屉；未配置 Key 时优雅降级 |
| **视觉** | 博客：宣纸朱砂古风；后台：玄黑·玻璃拟态 + 翡翠重音；自制 **JzIcon**（20 SVG）；PWA + 印章 favicon |

## 技术栈（摘要）

| 层 | 选型 |
|----|------|
| 后端 | Python 3.12 · Django 5.2 · DRF · PostgreSQL · Redis · Celery · jieba |
| 前端 | React 18 · TypeScript · Vite 5 · Ant Design 5 · Zustand · Tiptap 3 |
| 可选 | `anthropic`（AI）· Playwright（PDF）· `python-docx`（Word） |

## 仓库结构

```
jianzhai/
├── backend/                # Django 5 + DRF（:8002）
│   └── apps/
│       ├── accounts/       # 多用户 · Session · system-info
│       ├── ai/             # Claude 代理 · 用量日志
│       ├── knowledge/      # KB · Folder · Document
│       ├── editor/         # 附件 · Word/MD 导入 · HTML 正文处理
│       ├── versioning/     # 快照 · diff · 回滚
│       ├── linking/        # 双向链接 · 反链 · 图谱 API
│       ├── search/         # tsvector · jieba
│       ├── tags/           # 标签（KB / Folder / Document）
│       ├── comments/       # 文档级 + 段落级评论
│       ├── exporter/       # 异步导出
│       └── blog/           # 公开 API · RSS · slug 安全解析
├── frontend/               # Vite + React 18 + TS + AntD 5 + Tiptap 3（:3001）
└── docker-compose.yml      # PostgreSQL 16 + Redis 7
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
pnpm dev                           # 监听 0.0.0.0:3001，局域网可用 http://<本机IP>:3001
```

**局域网访问**：从其他设备打开时不要用 `localhost`（那指向对方本机）。在 [`backend/.env`](backend/.env) 设置 `JIANZHAI_PUBLIC_ORIGIN=http://<服务器IP>:3001`（可选同时设 `SITE_PUBLIC_URL`），**完全重启 Django** 后 POST/导出才过 CSRF（`.env` 不会被 runserver 热加载，仅改 `.py` 的 autoreload 不够）。开发时前端保持默认走 Vite 的 `/api` 代理，**不要**把 `VITE_API_BASE_URL` 指到另一台机器的 `localhost:8002`。

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

### 5. AI 助手（可选）

1. 在 [Anthropic Console](https://console.anthropic.com/settings/keys) 申请 API Key  
2. `backend/.env` 增加：`ANTHROPIC_API_KEY=sk-ant-...`  
3. 重启 Django，后台打开 **AI 助手**（`/admin/ai`）设置默认模型（Opus 4.7 / Sonnet 4.6 / Haiku 4.5）

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
| API 根路径 | http://localhost:8002/api/v1/ |
| RSS | http://localhost:8002/feed.xml |

## 开发约定

- **后端**：每个 Django app 独立 `models.py` / `serializers.py` / `views.py` / `urls.py`；多租户用 `apps.accounts.scoping.scope_queryset`
- **前端**：公共逻辑放在 `src/api`、`src/components/common`、`src/utils`；后台菜单与博客导航优先使用 `JzIcon`
- **格式化**：Ruff + Black（Python），Prettier + ESLint（TS）
- **文档 slug**：库内按 KB 唯一；公开详情 API 支持 `?kb=<kb_slug>`，全局重复时按发布时间取最新一篇

## 阶段

| 版本 | 要点 |
|------|------|
| v0.1–v0.5 | KB、编辑器、博客、搜索、导出、评论、标签、RSS |
| v0.6–v0.8 | AI、Tiptap 扩展、玻璃后台、全屏编辑、大纲 |
| **v0.9** | JzIcon、HTML 博客阅读、架构总览页、公开 slug 消歧 |
| **v0.9.1** | 搜索含标签/评论；链接同租户校验；原子 `expected_version`；AI `max_tokens` 生效 |
| v1.0 候选 | 回收站 UI、增量保存、Tiptap lazy rendering、超大 KB 树分页、Yjs 协作 |

## 已知限制

- 超大知识库的树接口仍一次性返回全量节点（v1.0 候选：懒加载 / 分页）
- PDF 导出需安装 Playwright（`pip install -e .[pdf]` + `playwright install chromium`）

## License

个人项目，无公开 license。如需 fork / 商用请联系作者。
