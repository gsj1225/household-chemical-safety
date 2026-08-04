#!/usr/bin/env python3
"""家庭化学品库 — SQLite 在线备份脚本

使用 Python 内置 sqlite3.Connection.backup() 方法，
在不阻塞读写的情况下生成一致性快照。
不依赖宿主机 sqlite3 命令。

用法：
    python backup.py                         # 备份到 data/backups/
    python backup.py /path/to/backups        # 备份到指定目录
    BACKUP_KEEP=48 python backup.py          # 保留最近 48 份（默认 24）

数据库路径：项目根目录 data/inventory.db
与 docker-compose.yml 的 volume 挂载一致（../data:/app/data）
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# ── 路径推导 ──────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # backend/scripts/ → 项目根
DB_PATH = PROJECT_ROOT / "data" / "inventory.db"
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "")) or (PROJECT_ROOT / "data" / "backups")
BACKUP_KEEP = int(os.environ.get("BACKUP_KEEP", "24"))


def main():
    backup_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else BACKUP_DIR

    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_file = backup_dir / f"inventory-backup-{timestamp}.db"
    tmp_file = backup_dir / f"inventory-backup-{timestamp}.db.tmp"

    print(f"Backing up {DB_PATH} → {backup_file}")

    # SQLite Online Backup — 使用 Python 内置 API
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(tmp_file))
    try:
        src.backup(dst)
        dst.close()
        src.close()
    except Exception as e:
        dst.close()
        src.close()
        tmp_file.unlink(missing_ok=True)
        print(f"ERROR: Backup failed: {e}", file=sys.stderr)
        sys.exit(1)

    # 校验备份完整性
    integrity = check_integrity(tmp_file)
    if integrity != "ok":
        tmp_file.unlink(missing_ok=True)
        print(f"ERROR: Backup integrity check failed: {integrity}", file=sys.stderr)
        sys.exit(1)

    # 原子重命名
    tmp_file.rename(backup_file)

    size = backup_file.stat().st_size
    print(f"Backup complete: {backup_file} ({size / 1024:.1f} KB)")
    print(f"Integrity: OK")

    # 清理旧备份
    clean_old_backups(backup_dir, BACKUP_KEEP)
    print("Done.")


def check_integrity(db_path: Path) -> str:
    """校验 SQLite 数据库完整性。"""
    conn = sqlite3.connect(str(db_path))
    try:
        result = conn.execute("PRAGMA integrity_check;").fetchone()
        return result[0] if result else "unknown"
    finally:
        conn.close()


def clean_old_backups(backup_dir: Path, keep: int):
    """保留最近 N 份备份，删除其余。"""
    backups = sorted(
        backup_dir.glob("inventory-backup-*.db"),
        key=lambda f: f.stat().st_mtime,
    )
    if len(backups) <= keep:
        return
    print(f"Cleaning up old backups (keeping {keep})...")
    for old in backups[:-keep]:
        old.unlink()
        print(f"  Deleted: {old.name}")


if __name__ == "__main__":
    main()
