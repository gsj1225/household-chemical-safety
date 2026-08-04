#!/usr/bin/env python3
"""家庭化学品库 — SQLite 在线备份与恢复

生产函数：
    backup_database()  — 在线备份 + 完整性校验 + 原子重命名
    restore_database() — 校验备份 + 安全备份 + 原子替换
    check_integrity()  — PRAGMA integrity_check

测试直接导入此模块的生产函数，不复制实现。

用法（CLI）：
    python backup.py                      # 备份到 data/backups/
    python backup.py /path/to/backups     # 备份到指定目录
    python backup.py --restore <file>     # 恢复指定备份文件

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
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "inventory.db"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "data" / "backups"
BACKUP_KEEP = int(os.environ.get("BACKUP_KEEP", "24"))


# ── 生产函数 ──────────────────────────────────────

def check_integrity(db_path: Path) -> str:
    """校验 SQLite 数据库完整性，返回 'ok' 或错误描述。"""
    conn = sqlite3.connect(str(db_path))
    try:
        result = conn.execute("PRAGMA integrity_check;").fetchone()
        return result[0] if result else "unknown"
    finally:
        conn.close()


def backup_database(
    db_path: Path,
    backup_dir: Path,
    *,
    timestamp: str | None = None,
) -> Path:
    """执行 SQLite 在线备份。

    使用 sqlite3.Connection.backup() 不阻塞并发读写，
    备份后校验完整性，原子重命名。

    Args:
        db_path: 源数据库路径
        backup_dir: 备份输出目录
        timestamp: 自定义时间戳（测试用），默认当前时间

    Returns:
        备份文件路径

    Raises:
        FileNotFoundError: 源数据库不存在
        RuntimeError: 备份失败或完整性校验失败
    """
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    backup_dir.mkdir(parents=True, exist_ok=True)

    ts = timestamp or datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_file = backup_dir / f"inventory-backup-{ts}.db"
    tmp_file = backup_dir / f"inventory-backup-{ts}.db.tmp"

    # SQLite Online Backup
    src = sqlite3.connect(str(db_path))
    dst = sqlite3.connect(str(tmp_file))
    try:
        src.backup(dst)
    except Exception as e:
        raise RuntimeError(f"Backup failed: {e}") from e
    finally:
        dst.close()
        src.close()

    # 校验完整性
    integrity = check_integrity(tmp_file)
    if integrity != "ok":
        tmp_file.unlink(missing_ok=True)
        raise RuntimeError(f"Backup integrity check failed: {integrity}")

    # 原子重命名（os.replace 跨平台覆盖）
    os.replace(str(tmp_file), str(backup_file))
    return backup_file


def restore_database(
    backup_file: Path,
    target_db: Path,
    *,
    skip_confirm: bool = False,
) -> Path:
    """从备份文件恢复数据库。

    流程：校验备份完整性 → 安全备份当前库 → 原子替换。

    Args:
        backup_file: 备份文件路径
        target_db: 目标数据库路径
        skip_confirm: 跳过交互确认（测试/脚本用）

    Returns:
        恢复后的数据库路径

    Raises:
        FileNotFoundError: 备份文件不存在
        RuntimeError: 完整性校验失败
    """
    if not backup_file.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_file}")

    # 校验备份完整性
    integrity = check_integrity(backup_file)
    if integrity != "ok":
        raise RuntimeError(f"Backup integrity check failed: {integrity}")

    # 安全备份当前数据库
    if target_db.exists():
        safety_backup = target_db.with_suffix(
            f".pre-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        )
        shutil.copy2(target_db, safety_backup)

    # 原子替换
    tmp_target = target_db.with_suffix(".restore-tmp")
    shutil.copy2(backup_file, tmp_target)
    os.replace(str(tmp_target), str(target_db))

    return target_db


def clean_old_backups(backup_dir: Path, keep: int) -> int:
    """保留最近 N 份备份，返回删除数量。"""
    backups = sorted(
        backup_dir.glob("inventory-backup-*.db"),
        key=lambda f: f.stat().st_mtime,
    )
    if len(backups) <= keep:
        return 0
    deleted = 0
    for old in backups[:-keep]:
        old.unlink()
        deleted += 1
    return deleted


# ── CLI 入口 ──────────────────────────────────────

def main():
    args = sys.argv[1:]

    if args and args[0] == "--restore":
        # 恢复模式
        if len(args) < 2:
            print("Usage: python backup.py --restore <backup-file.db>")
            sys.exit(1)

        backup_file = Path(args[1])
        db_path = Path(os.environ.get("DB_PATH", str(DEFAULT_DB_PATH)))

        print("Validating backup integrity...")
        try:
            integrity = check_integrity(backup_file)
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)

        if integrity != "ok":
            print(f"ERROR: Backup integrity check failed: {integrity}", file=sys.stderr)
            sys.exit(1)
        print("Integrity: OK")

        print(f"\nWARNING: This will overwrite: {db_path}")
        confirm = input("Continue? (yes/no): ").strip()
        if confirm != "yes":
            print("Aborted.")
            sys.exit(0)

        try:
            restore_database(backup_file, db_path, skip_confirm=True)
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)

        print(f"\nRestore complete: {db_path}")
        print("\nRestart the backend:")
        print("  cd deploy && docker-compose start api")

    else:
        # 备份模式
        backup_dir = Path(args[0]) if args else DEFAULT_BACKUP_DIR
        db_path = Path(os.environ.get("DB_PATH", str(DEFAULT_DB_PATH)))

        print(f"Backing up {db_path} → {backup_dir}")
        try:
            backup_file = backup_database(db_path, backup_dir)
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)

        size = backup_file.stat().st_size
        print(f"Backup complete: {backup_file} ({size / 1024:.1f} KB)")
        print("Integrity: OK")

        deleted = clean_old_backups(backup_dir, BACKUP_KEEP)
        if deleted:
            print(f"Cleaned up {deleted} old backup(s).")
        print("Done.")


if __name__ == "__main__":
    main()
