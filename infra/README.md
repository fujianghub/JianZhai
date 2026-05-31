# 简斋 · 腾讯云生产部署指南

> **目标**：把当前 main 分支部署到腾讯云轻量应用服务器，几个朋友登录访问。
> 域名 `fujiang.jianzhai.cn`，国内备案，HTTPS 自动续证。

## 📋 一图速看

```
你的腾讯云轻量服务器 (2核2G, 香港或上海)
  ↓
Docker Compose 起 6 个容器：
  • caddy      ─ HTTPS 反代 + SPA 静态 (端口 80/443)
  • backend    ─ Django + Gunicorn (内部 :8002)
  • celery     ─ 异步任务 (无端口)
  • postgres   ─ 主数据 (内部 :5432)
  • redis      ─ 缓存 + broker (内部 :6379)
  • backup     ─ 每天 03:00 自动 pg_dump
```

---

## 🛒 上线前你要做的（一次性，~3 天）

### 1️⃣ 买域名（5 分钟 + 实名 1 天）

**腾讯云 → 域名注册 → 搜 `jianzhai.cn`**：

- `jianzhai.cn` 首年特价 ¥35，续费 ¥39/年
- 买完立即做**实名认证**（个人身份证）
- 实名通过后才能 ICP 备案

### 2️⃣ ICP 备案（最久 7–15 天，最快 5 天）

**腾讯云 → 备案 → 备案助手**：

- 选「新增备案」
- 主体：个人
- 网站名称：简斋知识库
- 网站类型：博客 / 个人网站
- 服务器：选你之后要买的「腾讯云轻量应用服务器」（备案前可以买，备案中允许使用）
- 上传：身份证正反面 + 手持身份证 + 网站负责人照片（在腾讯云 APP 拍）

> 💡 备案期间「网站不能对外提供服务」是规则，但**你内部测试访问 IP 是可以的**。

### 3️⃣ 买服务器（5 分钟）

**腾讯云 → 轻量应用服务器**：

| 配置 | 价格 | 推荐度 |
|------|------|--------|
| **标准型 2核2G 5Mbps · 上海**（**推荐**）| ¥80/月 或 **¥99/年首年** | ⭐⭐⭐⭐⭐ |
| 标准型 2核4G 5Mbps · 上海 | ¥150/月 | 如果 AI 调用频繁 |

**镜像**：选 **Docker CE**（已预装 Docker 和 Compose）。

**地域**：上海 / 北京 / 广州（备案后访问最快）。

**安全组**：开放 **80 / 443**（HTTP/HTTPS）+ **22**（SSH）。**绝不要开 8002 / 5432 / 6379**——这些只供容器内部互通。

### 4️⃣ 域名解析到服务器（5 分钟）

服务器买完会给你一个公网 IP（如 `121.4.x.x`）。

**腾讯云 → DNSPod → 我的域名 → jianzhai.cn → 解析**：

- 主机记录：`fujiang`
- 记录类型：`A`
- 记录值：你的服务器公网 IP
- TTL：600

等 10 分钟生效。`ping fujiang.jianzhai.cn` 能拿到 IP 就说明成功。

### 5️⃣ 准备 API key

在备案等待期间顺便备好：

- **Anthropic API Key**：https://console.anthropic.com/keys 创建
- **DashScope API Key**（可选）：https://dashscope.console.aliyun.com/

充值 ~$10 够你们几个人玩很久。

---

## 🚀 部署（备案下来后，30 分钟搞定）

### 1️⃣ SSH 上服务器，clone 仓库

```bash
ssh root@<你的服务器IP>

# Docker 已预装（你选了 Docker CE 镜像），直接 clone
cd ~
git clone https://github.com/fujianghub/JianZhai.git jianzhai
cd jianzhai/infra
```

### 2️⃣ 写 `.env.prod`

```bash
cp .env.example.prod .env.prod
chmod 600 .env.prod
nano .env.prod   # 或 vim
```

按提示填好：

- `SECRET_KEY`：生成命令在文件注释里
- `POSTGRES_PASSWORD`：随机字符串（`openssl rand -base64 32`）
- `ANTHROPIC_API_KEY` / `DASHSCOPE_API_KEY`
- 域名相关已预填 `fujiang.jianzhai.cn`

### 3️⃣ 改 Caddyfile 邮箱

```bash
nano Caddyfile
# 把 ``email`` 改成你自己的邮箱（Let's Encrypt 用于过期提醒）
```

### 4️⃣ 首次部署

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

第一次 build 约 5 分钟（拉镜像 + pnpm install + Vite build + pip install）。

### 5️⃣ 等 healthcheck

```bash
docker compose -f docker-compose.prod.yml ps
```

直到 `jianzhai-backend` 显示 `healthy`。看日志：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
```

### 6️⃣ 创建第一个 superuser

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  python manage.py createsuperuser
```

按提示输入用户名 + 密码。这个就是你以后登录 `/admin` 的账号。

### 7️⃣ 测试访问

浏览器打开 `https://fujiang.jianzhai.cn`：

- 应该自动跳到 `/admin/login`（因为 `SITE_REQUIRE_LOGIN=true`）
- 登录后看到博客首页 + 你的工作台

### 8️⃣ 创建朋友的账号

`/admin/users/` → 「新建用户」 → 填用户名 + 临时密码 → 发给朋友。

每个朋友首次登录后建议在 `/admin/profile` 改密码。

---

## 🔁 后续升级（每次 push main 后）

服务器上：

```bash
cd ~/jianzhai/infra
./deploy.sh
```

脚本会：

1. `git pull origin main`
2. 重 build backend + caddy 镜像
3. 重启容器（Postgres 不动）
4. 跑 migrate
5. 等 healthcheck

约 2-3 分钟完成，期间网站短暂 502（~10 秒），登录用户的 session 不丢。

---

## 💾 备份策略

### 自动（已配置）

- `backup` 容器每天 **03:00 上海时间** 跑 `pg_dump`
- 文件落在服务器的 `~/jianzhai/infra/backup/`
- 保留最近 14 天，自动清旧

### 手动（推荐重要操作前）

```bash
cd ~/jianzhai/infra
./backup.sh dump
```

### 拉回本地（你说要存本地）

**本地 Mac/PC**：

```bash
# 一次性
rsync -avh root@<服务器IP>:~/jianzhai/infra/backup/ ~/jianzhai-backups/

# 或者用脚本
./backup.sh sync root@<服务器IP>:~/jianzhai/infra
```

建议每周拉一次。

### 灾难恢复

```bash
./backup.sh restore ./backup/jianzhai-20260601.sql.gz
```

---

## 🛠 常用运维命令速查

```bash
# 看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 看实时日志（全部 / 单服务）
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend

# 进容器跑 Django 命令
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  python manage.py shell

# 重启某个服务
docker compose -f docker-compose.prod.yml --env-file .env.prod restart backend

# 重启全部
docker compose -f docker-compose.prod.yml --env-file .env.prod restart

# 完全停止 + 删除容器（保留数据卷）
docker compose -f docker-compose.prod.yml --env-file .env.prod down

# 把磁盘也擦干净（⚠ 会删 PG 数据，确认有备份再做）
docker compose -f docker-compose.prod.yml --env-file .env.prod down -v
```

---

## ⚠ 常见问题

### Q: Caddy 拿不到证书

`docker compose logs caddy` 看错误：

- **DNS 没生效**：`dig fujiang.jianzhai.cn` 看返回 IP 是否对
- **80 端口被占**：检查是不是宝塔 / 其他 web server 还在跑（`netstat -tlnp | grep :80`）
- **ICP 备案没完成**：管局还没批，腾讯云会拦截入站流量到该域名

### Q: 朋友登录后看到 403

CSRF 失败。检查 `.env.prod` 的 `CSRF_TRUSTED_ORIGINS=https://fujiang.jianzhai.cn` 是否完全一致（注意 https://，无尾斜杠）。

### Q: AI 调用一直 503

```bash
# 看是不是 key 没填
docker compose exec backend python manage.py shell -c "from apps.ai.services import providers_configured; print(providers_configured())"
```

返回应该是 `{'anthropic': True, 'qwen': True/False}`。如果 False 就是 .env.prod 的 key 没填或拼写错。

### Q: 怎么改 AI 用户预算

登录 → `/admin/ai` → 设置 → 「每用户每日预算」填 `0.30`（USD）即 ¥2 上下，朋友每天最多用这么多。**你自己 (is_staff) 不受限**。

### Q: 升级中 502 太久

```bash
# 看 backend 启动到哪了
docker compose --env-file .env.prod logs --tail=50 backend

# 如果卡在 migrate
docker compose --env-file .env.prod exec backend python manage.py migrate --noinput
```

### Q: 磁盘满了

```bash
# 看哪个目录最大
du -sh ~/jianzhai/infra/backup/ /var/lib/docker/volumes/

# 清 14 天前的备份手动
find ~/jianzhai/infra/backup -name "*.sql.gz" -mtime +14 -delete

# 清 Docker 残留
docker system prune -af --volumes
```

---

## 🎯 上线 Checklist

部署前打钩：

- [ ] 域名买了 + 实名认证通过
- [ ] ICP 备案号下来了
- [ ] DNS 解析 `fujiang.jianzhai.cn` → 服务器 IP 已生效（`ping` 能拿到 IP）
- [ ] 服务器买好，端口 80/443/22 开放，其他全关
- [ ] `.env.prod` 真实密钥都填了，无 `REPLACE_ME`
- [ ] Caddyfile 邮箱改成自己的
- [ ] `docker compose up -d --build` 成功
- [ ] `docker compose ps` 全部 healthy
- [ ] superuser 创建好
- [ ] `https://fujiang.jianzhai.cn` 跳登录 → 登录后能进
- [ ] AI 助手能用（`/admin/ai` 看模型状态）
- [ ] 用量预算设好（`/admin/ai/settings`）
- [ ] 朋友账号都创建好

部署后：

- [ ] 第一次手动 `./backup.sh dump`
- [ ] 配置 SSH key（防 root 密码弱口）：`ssh-copy-id root@<IP>`
- [ ] 服务器 firewall 关掉 22 端口的密码登录（强制 key 登录）
- [ ] 本地起 cron 每周 rsync 备份到本地
