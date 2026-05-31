#!/usr/bin/env bash
#
# 一键部署 / 升级脚本.  Idempotent —— 安全反复跑.
#
#   ./deploy.sh           normal redeploy: pull → build → migrate → restart
#   ./deploy.sh --force   skip the git check; rebuild from current working tree
#   ./deploy.sh --logs    show live logs after deployment
#
# 必须先做的事 (only once per host):
#   1. 装 Docker + Docker Compose v2
#   2. 克隆仓库到 ~/jianzhai
#   3. 备份磁盘准备好 (./backup/ 目录会自动创建)
#   4. cp infra/.env.example.prod infra/.env.prod 并填好真实密钥
#   5. 第一次：cd infra && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
#
# 之后改了代码 + push main 后，在服务器上：
#   cd ~/jianzhai/infra && ./deploy.sh

set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

FORCE=false
SHOW_LOGS=false
for arg in "$@"; do
    case "$arg" in
        --force) FORCE=true ;;
        --logs)  SHOW_LOGS=true ;;
        *) echo "Unknown flag: $arg" >&2; exit 2 ;;
    esac
done

# ─── Sanity checks ──────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE 不存在.  先 cp .env.example.prod .env.prod 并填写."
    exit 1
fi
if grep -q "REPLACE_ME" "$ENV_FILE"; then
    echo "ERROR: $ENV_FILE 仍含 REPLACE_ME 占位符.  填写真实密钥后再部署."
    exit 1
fi

# Backup directory must exist so docker bind mount succeeds.
mkdir -p ./backup

echo "──────────────────────────────────────────────"
echo "📥 1/5  Pull latest from origin/main"
echo "──────────────────────────────────────────────"
cd ..
if ! $FORCE; then
    git fetch origin --quiet
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    if [[ "$LOCAL" == "$REMOTE" ]]; then
        echo "  本地 main 已是最新（$LOCAL）—— 是否仍要重建？"
        read -p "  继续 [y/N] " yn
        [[ "$yn" =~ ^[Yy]$ ]] || { echo "已取消."; exit 0; }
    else
        git checkout main
        git pull --ff-only origin main
    fi
fi
cd infra

echo ""
echo "──────────────────────────────────────────────"
echo "🔨 2/5  Build images (backend + caddy)"
echo "──────────────────────────────────────────────"
$COMPOSE build --pull backend caddy

echo ""
echo "──────────────────────────────────────────────"
echo "🚀 3/5  Recreate containers"
echo "──────────────────────────────────────────────"
$COMPOSE up -d --remove-orphans

echo ""
echo "──────────────────────────────────────────────"
echo "🩺 4/5  Wait for backend healthcheck"
echo "──────────────────────────────────────────────"
for i in {1..60}; do
    if $COMPOSE ps backend --format '{{.Health}}' | grep -q healthy; then
        echo "✅ backend healthy after ${i}0s"
        break
    fi
    sleep 10
    if [[ "$i" == "60" ]]; then
        echo "❌ backend 10 分钟内没 healthy."
        echo "   查日志: $COMPOSE logs --tail=100 backend"
        exit 1
    fi
done

echo ""
echo "──────────────────────────────────────────────"
echo "🧹 5/5  Cleanup dangling images"
echo "──────────────────────────────────────────────"
docker image prune -f

echo ""
echo "==============================================="
echo "✅ 部署完成"
echo "==============================================="
echo "  - 站点: https://fujiang.jianzhai.cn"
echo "  - 后台: https://fujiang.jianzhai.cn/admin"
echo "  - 看实时日志: $COMPOSE logs -f"
echo "  - 看容器状态: $COMPOSE ps"
echo ""

if $SHOW_LOGS; then
    exec $COMPOSE logs -f
fi
