#!/usr/bin/env bash
# 家庭化学品库 — SQLite 数据恢复脚本
#
# 恢复流程：
#   1. 停止后端服务（调用者负责）
#   2. 校验备份文件完整性（PRAGMA integrity_check）
#   3. 备份当前数据库为安全副本
#   4. 原子替换（mv）
#
# 用法：
#   # 先停止后端
#   cd deploy && docker-compose stop api
#   # 恢复
#   cd .. && bash backend/scripts/restore.sh data/backups/inventory-backup-YYYYMMDD-HHMMSS.db
#   # 重启后端
#   cd deploy && docker-compose start api

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
  echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

# 校验备份完整性
echo "Validating backup integrity..."
INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" != "ok" ]; then
  echo "ERROR: Backup integrity check failed: $INTEGRITY" >&2
  exit 1
fi
echo "Integrity: OK"

echo ""
echo "WARNING: This will overwrite the current database!"
echo "  Current: $DB_PATH ($(du -h "$DB_PATH" 2>/dev/null | cut -f1 || echo 'N/A'))"
echo "  Restore: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
echo ""
echo "⚠️  Ensure the backend is stopped before proceeding."
echo "    cd deploy && docker-compose stop api"
echo ""
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# 安全备份当前数据库
if [ -f "$DB_PATH" ]; then
  SAFETY_BACKUP="${DB_PATH}.pre-restore-$(date +%Y%m%d-%H%M%S)"
  cp "$DB_PATH" "$SAFETY_BACKUP"
  echo "Safety backup created: $SAFETY_BACKUP"
fi

# 原子替换
TMP_TARGET="${DB_PATH}.restore-tmp"
cp "$BACKUP_FILE" "$TMP_TARGET"
mv "$TMP_TARGET" "$DB_PATH"

echo ""
echo "Restore complete: $DB_PATH"
echo ""
echo "Restart the backend:"
echo "  cd deploy && docker-compose start api"
