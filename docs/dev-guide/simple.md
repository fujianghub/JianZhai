# 简斋 · 简单版

> **简斋·开发指南**  ·  当前 **v0.9.10**  ·  最后更新 2026-06-06
>
> 第一次来？看这一篇。深入细节请到 → [详细版](./detailed/)

---

## 简斋是什么

**简斋（JianZhai）** 是一套本地部署的「**个人知识库 + 公开博客**」一体化 Web 应用：

🔒 **一份内容，两套形态** — 同一篇文档既有 `raw_content`（私人笔记，含 `@提及`、未完成的草稿、批注），也有 `published_content`（公开发布版，对外可见）
💾 **数据完全在本地** — 正文、附件、导出产物、搜索索引、版本快照全部存在你自己的 PostgreSQL 与磁盘上，无任何外部托管
🧩 **功能合一** — 写作、版本回滚、全文搜索、导出、公开阅读、AI 助手、知识图谱都在同一个系统里
🚪 **博客两种形态** — 全开放（匿名可读）或**友邻可见**（`SITE_REQUIRE_LOGIN=true`，访客需登录）

Monorepo 结构：`backend/`（Django 5.2）+ `frontend/`（React 18 + Vite 5），默认端口 **8002 / 3001**。生产部署套件（腾讯云 Docker Compose + Caddy HTTPS）在 `infra/`。

---

## 系统全景

与后台「架构总览 → 简单版」共用一张源：

{{diagram:simple-arch}}

**读图要点：**

- 浏览器里的是 **React 18 单页应用**（既是后台编辑器，也是公开博客）
- 所有 API 走 **Django + DRF**，数据落在 **PostgreSQL**（中文全文搜索用 jieba + tsvector GIN 索引）
- **AI 助手** 由后端代理调用 **Anthropic Claude / 阿里通义千问** 双供应商，**API key 仅存后端**，前端永不接触
- 公开文章若多 KB 同名 slug，用 **`?kb=知识库slug`** 消歧

---

## 核心概念

| 概念 | 一句话说明 |
|------|------------|
| **知识库（KB）** | 文档的顶层容器，例如「读书笔记」「项目 A」；可设公开/私密、封面、强调色，并归入**大类**分组 |
| **文件夹（Folder）** | KB 内可多层嵌套，self-FK；软删除会级联子项 |
| **文档（Document）** | 单篇内容；含 `raw_content` + `published_content` 两套正文与独立可见性；支持置顶 / 收藏 |
| **发布 / 可见性** | `status=published` 且 `visibility=public` 时出现在博客 |
| **双向链接** | 文中 `@文档名` 解析为 `[title](doc:ID)`；保存后异步反向同步 |
| **乐观并发** | PATCH 带 `expected_version`；冲突返回 409 + 最新快照，前端提示并拉取最新 |
| **题记** | 博客首页名句轮播（朝代/作者/篇名），随机或顺序播放，`/admin/hero` 管理 |
| **根管理员** | `ROOT_ADMIN_USERNAME` 指定的唯一最高权限账号，不可被禁用 / 删除 |
| **友邻闸门** | `SITE_REQUIRE_LOGIN=true` 时所有公开接口需登录，博客变「友邻可见」 |

---

## 功能一览（v0.9.10）

| 模块 | 你能做什么 |
|------|------------|
| 🗂 知识库 | 建库、**大类分组**、树形目录、拖拽排序、置顶 / **收藏夹**、多种排序、软删除（带回收站 UI） |
| ✍️ 编辑器 | **富文本 / Markdown / HTML** 三种模式共存；20+ 自定义节点；斜杠命令；`@提及` |
| 🧮 KaTeX 数学 | `$$..$$` 块级 + `$..$` 行内；编辑器双击 Modal 可视化输入；博客与导出端全链路一致 |
| 📊 Mermaid / PlantUML | 默认渲染图、单击切源码；**全屏 Modal**（滚轮缩放、拖拽平移、下载 SVG/PNG）；四主题适配 |
| 📖 HTML 阅读 | 发布版为完整 HTML 时，博客用沙箱 iframe 保留原作者样式；懒加载 + 异步元数据测量 |
| 🕰 版本 | 主动保存快照、行级+字符级 diff、回滚作为新版本入栈；每文档保留 100 个 |
| 🕸 双链与图谱 | `@` 提及、反链区、`react-force-graph-2d` 知识图谱 |
| 🔍 搜索 | 全局 `⌘K`；中文 jieba + PG `tsvector` GIN；标题/正文/标签/评论全包含 |
| 🏷 标签与评论 | 标签可挂 KB / 文件夹 / 文档；段落级评论按 `block_id` 定位 |
| 📤 导出 | MD / HTML / PDF / Word / 整站 zip；多文档合订本（fixed-toc 单文件 anthology） |
| 🌐 博客 | 匿名 / **友邻可见**两形态、**6 套主题**（亮/暗 + 星空/深海/春水/冬雪 4 个环境氛围层）、5 套纸张、归档、标签云、RSS |
| 📜 题记 | 首页名句轮播：朝代/作者/篇名三色单行 + 4 种动画；**随机播放**（每次开页洗牌）；悬停暂停、点击切换；管理页拖拽排序 + 批量导入 / 导出备份 |
| 🤖 AI 助手 | **双供应商**（Claude Opus/Sonnet/Haiku + 通义千问 Max/Plus/Turbo/VL）；8 内置操作 + **自定义模板** + **多轮对话**；视觉图片输入、扩展思考、每用户**日预算**、失败自动降级；用量**日历热图** + CSV |
| 👥 多用户 | **四角色 RBAC**（根 / 管理员=作者 / 普通用户=读者 / 匿名）：作者**共享单一内容池**（不再按 owner 隔离），读者只读博客 + 收藏 + 评论 + 改资料；删 KB/大类/永久删/清空回收站=仅根；自助改密码/邮箱/用户名/头像（`/admin/profile`） |
| 🎨 视觉 | 博客宣纸朱砂风；后台玄黑玻璃风；**100% 自制图标**（JzIcon 50 枚 + 侧栏设计稿 JzIconKit 15 枚，专属 tone 色随主题联动）；印章 favicon；PWA |

---

## 三分钟上手

```bash
# 1. 启动依赖
docker compose up -d                # postgres + redis

# 2. 后端
cd backend
pip install -e .[dev]               # 装依赖；可选 .[pdf] 用 Playwright
python manage.py migrate
python manage.py createsuperuser    # 用户名设为 JIANZHAI_ROOT_ADMIN_USERNAME 即根管理员
python manage.py seed_architecture_kb  # 种本指南（可选）
python manage.py runserver 0.0.0.0:8002

# 3. Celery worker（可选，做搜索索引刷新、双链解析、异步导出）
celery -A jianzhai worker -l info

# 4. 前端
cd frontend
pnpm install
pnpm dev                            # 默认 HTTP localhost:3001
# 或局域网 LAN IP 走 HTTPS（Chrome 不再提示下载警告）：
pnpm dev:https
```

打开浏览器：
- 后台： http://localhost:3001/admin
- 博客： http://localhost:3001/

**启用 AI（可选，任配其一）**：`backend/.env` 加 `ANTHROPIC_API_KEY=sk-ant-...`（Claude，需 `pip install anthropic`）或 `DASHSCOPE_API_KEY=sk-...`（通义千问，OpenAI 兼容无需额外依赖），重启 Django 后到 `/admin/ai` 配置默认模型 / 日预算 / 降级开关。

---

## 公开博客访问规则

| 地址 | 内容 |
|------|------|
| `/` | 公开博客首页（KB 网格 + 「藏经阁」hero + **题记轮播**） |
| `/kb/dev-guide` | 单 KB 浏览（树形目录） |
| `/posts/<slug>` | 单篇文章 |
| `/posts/<slug>?kb=dev-guide` | 多 KB 同 slug 时按 KB 消歧 |
| `/favorites` | 收藏页 |
| `/archive` | 按年月归档 |
| `/tags` | 标签云 |
| `/feed.xml` | RSS |

> **友邻可见**：`backend/.env` 设 `SITE_REQUIRE_LOGIN=True` 后，以上全部地址要求登录，匿名访客被引导到登录页。

---

## 局域网 / HTTPS 访问

> Chrome 122+ 对非 localhost 的 HTTP 站点（如 LAN IP `172.16.x.x:3001`）会在每次下载文件时弹「此网站使用的不是安全连接，该文件可能已被篡改」。这是浏览器策略，与项目无关。

解决方法：**用 `pnpm dev:https` 启动**。它会用 `@vitejs/plugin-basic-ssl` 自签证书启动 HTTPS：

```bash
pnpm -C frontend dev:https
# 浏览器访问 https://<你的IP>:3001
# 首次需点「高级 → 继续访问」一次（自签证书）
# 之后所有下载都不再警告
```

后端 `.env` 同步：

```env
JIANZHAI_PUBLIC_ORIGIN=https://172.16.x.x:3001
SITE_PUBLIC_URL=https://172.16.x.x:3001
```

---

## 生产部署（腾讯云）

完整套件在 `infra/`：`deploy.sh` 一键构建并启动 6 容器（caddy + backend/gunicorn + celery + postgres + redis + backup），Caddy 自动签发 HTTPS 证书并反代后端，`backup.sh` 每日 `pg_dump`。详见 `infra/README.md`（含域名 / ICP 备案 / DNS 指南）。

---

## 下一步

- 🔬 **实现细节、四层架构、11 个后端 app、数据表与时序、扩展开发索引** → [详细版](./detailed/)
- 🎯 **可交互的详细架构 SVG**（含悬停说明）→ 超级管理员登录后台 → 架构总览 →「详细版」
- 📦 **仓库 README 与环境变量** → 项目根目录 `README.md`
