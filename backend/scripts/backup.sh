#!/usr/bin/env bash
# 家庭化学品库 — SQLite 数据备份脚本
#
# 用法：
#   ./backup.sh                    # 备份到默认目录
#   ./backup.sh /path/to/backups   # 备份到指定目录
#   BACKUP_KEEP=48 ./backup.sh     # 保留最近 48 份（默认 24）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="${PROJECT_ROOT}/data/inventory.db"
BACKUP_DIR="${1:-${PROJECT_ROOT}/data/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-24}"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/inventory-backup-${TIMESTAMP}.db"

echo "Backing up $DB_PATH → $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

echo "Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# 清理旧备份
OLD_COUNT=$(find "$BACKUP_DIR" -name "inventory-backup-*.db" | wc -l)
if [ "$OLD_COUNT" -gt "$BACKUP_KEEP" ]; then
  echo "Cleaning up old backups (keeping $BACKUP_KEEP)..."
  find "$BACKUP_DIR" -name "inventory-backup-*.db" -printf '%T@ %p\n' \
    | sort -n | head -n "-$BACKUP_KEEP" | awk '{print $2}' | xargs -r rm -v
fi

echo "Done."
