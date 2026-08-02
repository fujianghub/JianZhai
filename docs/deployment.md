# 简斋 · 部署与运维

> 本地开发启动、LAN HTTPS、腾讯云生产套件、安全控制点。
> 权限/RBAC 权威清单见 [permissions.md](./permissions.md)（本文不复制权限细节，避免双份漂移）。

---

## 1. 本地开发启动

```bash
docker compose up -d                              # postgres 16 + redis 7

cd backend
cp .env.example .env                              # DATABASE_URL / REDIS_URL / SECRET_KEY …
pip install -e .[dev]
pip install anthropic                             # 可选 AI
pip install -e .[pdf] && playwright install chromium   # 可选 PDF 导出
python manage.py migrate
python manage.py createsuperuser                  # 用户名 = JIANZHAI_ROOT_ADMIN_USERNAME 即为根
python manage.py seed_architecture_kb             # 可选：种公开 KB
python manage.py runserver 0.0.0.0:8002

celery -A jianzhai worker -l info                 # 搜索索引 / 双链 / 异步导出

cd frontend && pnpm install && pnpm dev           # :3001（host 0.0.0.0）
```

> **本机开发三件套（backend/celery/frontend）由 systemd 自启**（见 memory `project_systemd_autostart`）；celery 须用 `python -m celery` 不是 wrapper（否则 203/EXEC）。pg/redis 已 docker 自启。

### 关键操作约定

- **后端测试用 `pytest`，不是 `manage.py test`**
- **改 `backend/.env` 后必须完全重启 Django**（`.env` 不会被 runserver 热加载）
- 升级数据库 + 搜索：`python manage.py migrate && python manage.py reindex_search`
- **勿在主 dev server 运行时于同一 `frontend/` 另起共用缓存的 vite/vitest**——会致 `.vite` 缓存 desync → 编辑器 `useRef-null` / `@codemirror/state` 多实例崩溃。验证请用带 `JZ_API_PROXY_TARGET` 的独立 `cacheDir` 实例（见 memory `project_editor_crash_cache_desync`、`verify_env_jianzhai`）

---

## 2. 局域网访问 / LAN HTTPS

- 浏览器 Origin 为 `http://<IP>:3001` 时，在 `backend/.env` 配 `JIANZHAI_PUBLIC_ORIGIN`（或 `SITE_PUBLIC_URL`），settings 自动合并进 `CSRF_TRUSTED_ORIGINS` / `CORS_ALLOWED_ORIGINS` 并把 IP 加入 `ALLOWED_HOSTS`
- 勿把 `frontend/.env` 的 `VITE_API_BASE_URL` 设为跨机 `http://localhost:8002/...`（跨域 + CSRF 按页面 Origin 校验）
- **LAN HTTPS**（Chrome 122+ 对非 localhost HTTP 站每次下载弹「不安全」警告）：`pnpm -C frontend dev:https`（`@vitejs/plugin-basic-ssl` 自签证书），后端 `.env` 的 origin 同步改 `https://`，首次点「继续前往」一次

---

## 3. 腾讯云生产套件（`infra/`）

```bash
cd infra
cp .env.example.prod .env       # SECRET_KEY / 数据库 / 域名 / AI Key / SITE_REQUIRE_LOGIN …
./deploy.sh                     # 构建并启动 6 容器
```

| 容器 | 作用 |
|------|------|
| caddy | 自动签发 HTTPS、反代后端、SPA fallback（`Caddyfile`） |
| backend | Gunicorn 跑 Django（`backend.Dockerfile`） |
| celery | 异步任务 worker |
| postgres / redis | 数据与队列 |
| backup | `backup.sh` 每日 `pg_dump` |

- `SITE_REQUIRE_LOGIN=true` 开启**友邻可见**；`JIANZHAI_ROOT_ADMIN_USERNAME` 指定根。域名/ICP/DNS 见 `infra/README.md`

### 重部署两条路径（2026-07-25 现行）

- **纯前端快路径**（无后端/迁移改动时）：本地 `pnpm build`（用带 `JZ_API_PROXY_TARGET` 的隔离 `cacheDir` 实例，勿污染主 dev server 缓存）→ rsync `frontend/dist/`（**带 `--delete`**）→ 服务器 `docker compose build caddy && docker compose up -d caddy`
- **含后端/迁移标准路径**：快路径基础上另加 rsync `backend/`（**无 `--delete`**，排除 `.venv/.env/media/exports/staticfiles` 等；`static/vendor/` 的 katex/mermaid 离线渲染资源随之带上）→ `docker compose build backend caddy && docker compose up -d`；有新迁移则容器内 `python manage.py migrate`
- rsync 统一排除服务器专属文件：`.env.prod`、`.git`、`Caddyfile`、`backend.Dockerfile`、compose（见 memory `project_deploy_tencent`）
- **服务器专属文件的变更须手工合并**（rsync 排除 ≠ 永不更新）：main 若改了 `backend.Dockerfile` / compose，要把语义变更手工套进服务器版（CN 镜像/concurrency=1 变体保留）。例：2026-07-27 Playwright 层 = `pip install -e .[pdf]` + `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright playwright install --with-deps chromium`（服务器连不通官方 CDN，浏览器二进制必须走 npmmirror）+ compose celery `-B` + `mem_limit 3g`；改前先 `cp xxx xxx.bak.日期`
- **知识库内容同步**（DB + media，与代码部署互不干扰）：仓库根 `Local_to_Cloud_Server_kb_sysnc.py`（gitignore 不入库的本地运维工具）。先 `--dry-run` 盘点，自带安全闸门（服务器有本地没有的评论/收藏/用户即中止）+ 服务器兜底备份 + 停机窗口压缩（media 先传、库切换只需几十秒）；`--db-only` / `--media-only` / `--max-size` 见脚本 docstring
- **部署后验证绿三件**：线上 JS hash == 本地 dist 产物；匿名访问 `/api/v1/public/*` 返 403；`/auth/session/` 返 `require_login: true`
- **导出共享卷**（必须）：backend + celery 各挂命名卷 `exports_data:/app/exports`（顶层声明 `name: jianzhai_exports_data`），否则 celery 写、backend 读不到 → 下载返 404 HTML → 浏览器「无法从网站上提取文件」。详见 [export-search.md](./export-search.md) 与 memory `project_export_shared_volume`

---

## 4. 安全控制点

| 机制 | 行为 |
|------|------|
| 权限边界 | **后端是唯一安全边界**；四角色 RBAC 唯一入口 `get_role()`，详见 [permissions.md](./permissions.md) |
| 友邻闸门 | `PublicOrLoginGated` 逐请求判定；`SITE_REQUIRE_LOGIN=true` 时匿名访问 `/public/*` 返 403 |
| 登录三因子 | `/auth/login/` = 密码 + **邮箱匹配** + **服务端拼图滑块验证码**（`captcha.py`，Pillow 生成、答案存 Redis 一次性 TTL、缺口仅由像素传达）；先验滑块再验密码，任一错不泄露 |
| CSRF | `CSRF_COOKIE_HTTPONLY=False`，SPA 读 cookie 写 `X-CSRFToken` |
| DOMPurify | 公开端 HTML 净化，所有 `<img>` 加 `loading="lazy" decoding="async"` |
| iframe | `X_FRAME_OPTIONS=SAMEORIGIN`；导出 srcdoc `sandbox="allow-scripts allow-popups allow-forms"` |
| 上传 | 单文件 2GB；类型区分 image/document/other；`MEDIA_ROOT/uploads/YYYY/MM/uuid.ext` |
| AI | key 仅后端 `.env`；30/min/user + 每用户日预算（超额 429） |
| 导出 | `exports/` 刻意不在 `media/` 下；owner/superuser 可下载，跨租户访问写审计日志 |
| DRF 节流 | 匿名 120/min；AI 写 30/min/user；登录 `login` 10/min；验证码取题 `captcha` 30/min |

> 主机层加固（SSH 仅密钥 + 新端口 + fail2ban + dnf 自动安全更新 + sysctl）见 memory `project_host_hardening`。

---

## 5. 环境变量

完整清单以 `backend/.env.example` 与 `infra/.env.example.prod` 为准（**唯一事实来源，勿在文档另抄一份**）。要点：

- `JIANZHAI_ROOT_ADMIN_USERNAME` — 根账号（不可被禁用/删除）
- `SITE_REQUIRE_LOGIN` — `True` = 友邻可见
- `ANTHROPIC_API_KEY` / `DASHSCOPE_API_KEY` — AI 多供应商，任配其一即可
- `JIANZHAI_PUBLIC_ORIGIN` — LAN/HTTPS 时与浏览器 origin 一致
