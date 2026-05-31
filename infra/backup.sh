#!/usr/bin/env bash
#
# 手动备份 / 下载脚本.  和容器内每天 03:00 的 cron 备份是冗余的，
# 适合：
#   - 重启 / 升级前手动跑一次，留个 snapshot
#   - 从远端服务器把 backup/ 同步回本地存档
#
# 用法：
#   ./backup.sh dump              在服务器上手动跑一次 pg_dump
#   ./backup.sh sync user@host    把远端 backup/ rsync 到本地
#
# 远端 sync 需要 ssh key 已配置；不在本机用 sync 子命令时直接走 dump。

set -euo pipefail

cd "$(dirname "$0")"

ACTION="${1:-help}"

case "$ACTION" in
    dump)
        echo "📦 手动 pg_dump → backup/jianzhai-manual-$(date +%Y%m%d-%H%M%S).sql.gz"
        TS=$(date +%Y%m%d-%H%M%S)
        docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
            sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | \
            gzip > "./backup/jianzhai-manual-${TS}.sql.gz"
        echo "✅ 备份完成 ($(du -h ./backup/jianzhai-manual-${TS}.sql.gz | awk '{print $1}'))"
        ;;
    sync)
        REMOTE="${2:?用法: ./backup.sh sync user@host:/path/to/jianzhai/infra}"
        DEST="${HOME}/jianzhai-backups"
        mkdir -p "$DEST"
        echo "⤓ rsync $REMOTE/backup/ → $DEST/"
        rsync -avh --progress --partial \
            -e ssh \
            "$REMOTE/backup/" "$DEST/"
        echo "✅ 同步完成. 本地：$DEST"
        ls -lh "$DEST" | tail -20
        ;;
    restore)
        FILE="${2:?用法: ./backup.sh restore <path/to/dump.sql.gz>}"
        if [[ ! -f "$FILE" ]]; then
            echo "ERROR: $FILE 不存在"
            exit 1
        fi
        echo "⚠️  即将恢复 $FILE 到 postgres 容器，**会覆盖现有数据**！"
        read -p "确认 [yes] " yn
        [[ "$yn" == "yes" ]] || { echo "已取消."; exit 0; }
        echo "🔄 恢复中..."
        gunzip -c "$FILE" | \
            docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
            psql -U jianzhai -d jianzhai
        echo "✅ 恢复完成"
        ;;
    help|*)
        cat <<EOF
用法:
  ./backup.sh dump                  手动 pg_dump
  ./backup.sh sync user@host:path   从远端 rsync 备份到本地
  ./backup.sh restore <file.sql.gz> 恢复指定备份（危险！）

容器内自动备份位置: ./backup/ (每天 03:00, 保留 14 天)
EOF
        ;;
esac
