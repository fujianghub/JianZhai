# 简斋 / JianZhai

个人知识库 + 个人博客一体化系统。一份内容**既是私人笔记**（`raw_content`），**也是公开博客**（`published_content`）—— 通过手动发布在两种形态间切换。

> 详细架构与开发指南见 [CLAUDE.md](./CLAUDE.md)。
> 系统内已经种了一份公开 KB「简斋·开发指南」，包含简单版/详细版两篇说明文档。

## 主要能力

- **多编辑器并存**：Tiptap 富文本 / Markdown / HTML 源码，底层统一以 Markdown 持久化
- **双向链接 + 反向链接 + 知识图谱可视化**
- **AI 写作助手**（Anthropic Claude）：选区操作 + 全文 AI 抽屉 + AI 模型管理面板，支持流式输出
- **完整版本控制**：DocumentVersion 快照、diff、回滚（保留 100 个/文档）
- **全文搜索**：PostgreSQL `tsvector` + jieba 中文分词，全局 `⌘K`
- **多格式导出**：Markdown / HTML / PDF（Playwright）/ Word / 整站静态 zip
- **文档保护**：乐观并发（`expected_version`）防止多端同时编辑覆盖
- **古风视觉系统**：朱砂宣纸博客 + 玄黑翡翠后台玻璃；自制 20 个 SVG 图标库；4 套主题切换
- **PWA 友好**：manifest、apple-touch-icon、印章式 favicon

## 仓库结构

```
jianzhai/
├── backend/                # Django 5 + DRF（端口 8002）
│   └── apps/
│       ├── accounts/       # 多用户 + scoping
│       ├── ai/             # AI 助手（Anthropic Claude 代理）
│       ├── blog/           # 公开博客 API + RSS
│       ├── comments/       # 文档级 + 段落级评论
│       ├── editor/         # 附件 + Word/MD 导入
│       ├── exporter/       # 异步导出 (Celery)
│       ├── knowledge/      # KB / Folder / Document 核心
│       ├── linking/        # 双向链接 + 反链 + 知识图谱
│       ├── search/         # tsvector + jieba
│       ├── tags/           # 标签（KB / Folder / Document 通用）
│       └── versioning/     # DocumentVersion 快照 + diff
├── frontend/               # Vite + React 18 + TS + AntD 5 + Tiptap 3（端口 3001）
└── docker-compose.yml      # PostgreSQL 14 + Redis 7
```

## 快速开始

### 1. 启动基础设施

```bash
docker compose up -d   # PostgreSQL + Redis
```

服务监听：
- PostgreSQL `localhost:5432`，库名 `jianzhai`，账号 `jianzhai` / `jianzhai`
- Redis `localhost:6379`

### 2. 后端

```bash
cd backend
cp .env.example .env             # 按需修改 SECRET_KEY / DB / Redis
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e .                 # 安装核心依赖
pip install anthropic            # AI 助手（可选；不装时 AI 端点优雅降级）
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8002
```

### 3. 前端

```bash
cd frontend
corepack enable                  # 首次启用 pnpm
cp .env.example .env
pnpm install
pnpm dev                         # http://localhost:3001
```

### 4. Celery（异步导出 / 搜索索引更新）

```bash
cd backend
source .venv/bin/activate
celery -A jianzhai worker -l info
```

### 5. 启用 AI 助手（可选）

1. 去 https://console.anthropic.com/settings/keys 申请 API Key
2. 在 `backend/.env` 加：
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```
3. 重启 Django
4. 后台菜单出现「AI 助手」入口，可在该页切换默认模型（Opus 4.7 / Sonnet 4.6 / Haiku 4.5）

未配置 Key 时，前端 AI 按钮自动置灰；编辑器其他功能不受影响。

### 6. 一键种子（可选）

生成一个公开 KB「简斋·开发指南」+ 两篇说明文档：

```bash
python manage.py seed_architecture_kb
```

完成后访问 http://localhost:3001/kb/dev-guide 查看。

## 端口总览

| 服务 | 端口 |
|---|---|
| 前端 (Vite dev) | 3001 |
| 后端 (Django) | 8002 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## 开发约定

- **后端**：每个 Django app 独立 `models.py` / `serializers.py` / `views.py` / `urls.py`
- **前端**：单文件组件不超过 300 行；公共 hook / 工具集中在 `src/utils` 和 `src/components/common`
- **格式化**：Ruff + Black（Python），Prettier + ESLint（TS）
- **图标**：博客与后台菜单/标签页/侧栏使用自制 `JzIcon` 库（`src/components/common/JzIcon.tsx`），编辑器工具栏沿用 antd 图标

## License

个人项目，无公开 license。如需 fork / 商用请联系作者。
