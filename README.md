# 简斋 / JianZhai

个人知识库 + 个人博客一体化系统（单用户，本地部署）。

详细需求与技术栈见 [CLAUDE.md](./CLAUDE.md)。

## 仓库结构

```
jianzhai/
├── backend/      # Django 5 + DRF（端口 8002）
├── frontend/     # Vite + React 18 + TS + AntD 5（端口 3001）
└── docker-compose.yml  # PostgreSQL 14 + Redis 7
```

## 快速开始

### 1. 启动基础设施

```bash
docker compose up -d
```

启动后：
- PostgreSQL 监听 `localhost:5432`，库名 `jianzhai`，账号 `jianzhai` / 密码 `jianzhai`
- Redis 监听 `localhost:6379`

### 2. 后端

```bash
cd backend
cp .env.example .env       # 按需修改
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e .           # 或 pip install -r requirements.txt（如生成）
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8002
```

### 3. 前端

```bash
cd frontend
corepack enable            # 首次启用 pnpm
cp .env.example .env       # 按需修改
pnpm install
pnpm dev                   # 默认 http://localhost:3001
```

### 4. Celery（异步任务）

```bash
cd backend
source .venv/bin/activate
celery -A jianzhai worker -l info
```

## 开发约定

- 后端：每个 Django app 独立 `models.py` / `serializers.py` / `views.py` / `urls.py`
- 前端：单文件组件不超过 300 行
- 提交前：Ruff + Black（Python），Prettier + ESLint（TS）
