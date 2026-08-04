#!/usr/bin/env bash
# 家庭化学品库 — SQLite 数据恢复脚本
#
# 用法：
#   ./restore.sh /path/to/backup-file.db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="${PROJECT_ROOT}/data/inventory.db"

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.db>"
  echo ""
  echo "Available backups:"
  ls -lh "${PROJECT_ROOT}/data/backups/inventory-backup-"*.db 2>/dev/null || echo "  (no backups found)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will overwrite the current database!"
echo "  Current: $DB_PATH ($(du -h "$DB_PATH" 2>/dev/null | cut -f1 || echo 'N/A'))"
echo "  Restore: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
echo ""
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# 先备份当前数据库
if [ -f "$DB_PATH" ]; then
  SAFETY_BACKUP="${DB_PATH}.pre-restore-$(date +%Y%m%d-%H%M%S)"
  cp "$DB_PATH" "$SAFETY_BACKUP"
  echo "Safety backup created: $SAFETY_BACKUP"
fi

# 恢复
cp "$BACKUP_FILE" "$DB_PATH"
echo "Restore complete: $DB_PATH"
echo ""
echo "Restart the backend to apply changes:"
echo "  cd deploy && docker-compose restart api"
