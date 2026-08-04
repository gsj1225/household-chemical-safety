#!/usr/bin/env bash
# 家庭化学品库 — SQLite 在线备份脚本
#
# 使用 SQLite Online Backup API（.backup 命令），
# 在不阻塞读写的情况下生成一致性快照。
#
# 用法：
#   ./backup.sh                    # 备份到 data/backups/
#   ./backup.sh /path/to/backups   # 备份到指定目录
#   BACKUP_KEEP=48 ./backup.sh     # 保留最近 48 份（默认 24）
#
# 数据库路径：项目根目录 data/inventory.db
# 与 docker-compose.yml 的 volume 挂载一致（../data:/app/data）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="${PROJECT_ROOT}/data/inventory.db"
BACKUP_DIR="${1:-${PROJECT_ROOT}/data/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-24}"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/inventory-backup-${TIMESTAMP}.db"
TMP_FILE="${BACKUP_FILE}.tmp"

# SQLite Online Backup — 不阻塞并发读写
echo "Backing up $DB_PATH → $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$TMP_FILE'"

# 校验备份完整性
INTEGRITY=$(sqlite3 "$TMP_FILE" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" != "ok" ]; then
  echo "ERROR: Backup integrity check failed: $INTEGRITY" >&2
  rm -f "$TMP_FILE"
  exit 1
fi

# 原子重命名
mv "$TMP_FILE" "$BACKUP_FILE"

echo "Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
echo "Integrity: OK"

# 清理旧备份
OLD_COUNT=$(find "$BACKUP_DIR" -name "inventory-backup-*.db" | wc -l)
if [ "$OLD_COUNT" -gt "$BACKUP_KEEP" ]; then
  echo "Cleaning up old backups (keeping $BACKUP_KEEP)..."
  find "$BACKUP_DIR" -name "inventory-backup-*.db" -printf '%T@ %p\n' \
    | sort -n | head -n "-$BACKUP_KEEP" | awk '{print $2}' | xargs -r rm -v
fi

echo "Done."
