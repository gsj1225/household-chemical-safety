#!/usr/bin/env python3
"""家庭化学品库 — SQLite 数据恢复脚本

恢复流程：
    1. 校验备份文件完整性（PRAGMA integrity_check）
    2. 备份当前数据库为安全副本
    3. 原子替换（先 copy 到 .restore-tmp 再 rename）

不依赖宿主机 sqlite3 命令。

用法：
    # 先停止后端
    cd deploy && docker-compose stop api
    # 恢复
    python backend/scripts/restore.py data/backups/inventory-backup-YYYYMMDD-HHMMSS.db
    # 重启后端
    cd deploy && docker-compose start api
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


def main():
    if len(sys.argv) < 2:
        print("Usage: python restore.py <backup-file.db>")
        print()
        print("Available backups:")
        backup_dir = PROJECT_ROOT / "data" / "backups"
        if backup_dir.exists():
            for f in sorted(backup_dir.glob("inventory-backup-*.db")):
                print(f"  {f}")
        else:
            print("  (no backups directory)")
        sys.exit(1)

    backup_file = Path(sys.argv[1])

    if not backup_file.exists():
        print(f"ERROR: Backup file not found: {backup_file}", file=sys.stderr)
        sys.exit(1)

    # 校验备份完整性
    print("Validating backup integrity...")
    integrity = check_integrity(backup_file)
    if integrity != "ok":
        print(f"ERROR: Backup integrity check failed: {integrity}", file=sys.stderr)
        sys.exit(1)
    print(f"Integrity: OK")

    # 显示信息
    backup_size = backup_file.stat().st_size
    current_size = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    print()
    print("WARNING: This will overwrite the current database!")
    print(f"  Current: {DB_PATH} ({current_size / 1024:.1f} KB)")
    print(f"  Restore: {backup_file} ({backup_size / 1024:.1f} KB)")
    print()
    print("⚠️  Ensure the backend is stopped before proceeding.")
    print("    cd deploy && docker-compose stop api")
    print()

    confirm = input("Continue? (yes/no): ").strip()
    if confirm != "yes":
        print("Aborted.")
        sys.exit(0)

    # 安全备份当前数据库
    if DB_PATH.exists():
        safety_backup = DB_PATH.with_suffix(
            f".pre-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        )
        shutil.copy2(DB_PATH, safety_backup)
        print(f"Safety backup created: {safety_backup}")

    # 原子替换：先 copy 到临时文件，再 replace
    # os.replace 在 Windows/Linux 上都能覆盖已存在文件
    tmp_target = DB_PATH.with_suffix(".restore-tmp")
    shutil.copy2(backup_file, tmp_target)
    os.replace(str(tmp_target), str(DB_PATH))

    print()
    print(f"Restore complete: {DB_PATH}")
    print()
    print("Restart the backend:")
    print("  cd deploy && docker-compose start api")


def check_integrity(db_path: Path) -> str:
    """校验 SQLite 数据库完整性。"""
    conn = sqlite3.connect(str(db_path))
    try:
        result = conn.execute("PRAGMA integrity_check;").fetchone()
        return result[0] if result else "unknown"
    finally:
        conn.close()


if __name__ == "__main__":
    main()
