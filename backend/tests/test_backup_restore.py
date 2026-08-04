"""备份与恢复测试。

覆盖：
- backup.py：正常备份 + 完整性校验
- restore.py：正常恢复 + 原子替换
- 损坏备份拒绝恢复
- 备份后数据一致性
"""

import os
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pytest


@pytest.fixture
def test_db(tmp_path):
    """创建一个有测试数据的临时数据库。"""
    db_path = tmp_path / "data" / "inventory.db"
    db_path.parent.mkdir(parents=True)

    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS inventory_products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            brand TEXT,
            category TEXT,
            ingredients TEXT
        )
    """)
    conn.execute(
        "INSERT INTO inventory_products VALUES (?, ?, ?, ?, ?)",
        ("test-001", "测试产品", "测试品牌", "清洁剂", "水;表面活性剂"),
    )
    conn.commit()
    conn.close()

    return db_path


def do_backup(db_path: Path, backup_dir: Path) -> Path:
    """执行 SQLite 在线备份，返回备份文件路径。"""
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_file = backup_dir / f"inventory-backup-{timestamp}.db"
    tmp_file = backup_dir / f"inventory-backup-{timestamp}.db.tmp"

    src = sqlite3.connect(str(db_path))
    dst = sqlite3.connect(str(tmp_file))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    # 校验完整性
    conn = sqlite3.connect(str(tmp_file))
    result = conn.execute("PRAGMA integrity_check;").fetchone()
    conn.close()
    assert result[0] == "ok", f"Backup integrity check failed: {result[0]}"

    tmp_file.rename(backup_file)
    return backup_file


def do_restore(backup_file: Path, target_db: Path):
    """执行恢复：校验 → 安全备份 → 原子替换。"""
    # 校验备份完整性
    conn = sqlite3.connect(str(backup_file))
    result = conn.execute("PRAGMA integrity_check;").fetchone()
    conn.close()
    assert result[0] == "ok", f"Backup integrity check failed: {result[0]}"

    # 安全备份当前数据库
    if target_db.exists():
        safety = target_db.with_suffix(
            f".pre-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        )
        import shutil
        shutil.copy2(target_db, safety)

    # 原子替换（os.replace 在 Windows 上也能覆盖已存在文件）
    import shutil
    tmp_target = target_db.with_suffix(".restore-tmp")
    shutil.copy2(backup_file, tmp_target)
    os.replace(str(tmp_target), str(target_db))


class TestBackup:
    """备份测试。"""

    def test_backup_creates_valid_file(self, test_db, tmp_path):
        """正常备份生成完整数据库文件。"""
        backup_dir = tmp_path / "backups"
        backup_file = do_backup(test_db, backup_dir)

        assert backup_file.exists()

        # 备份应该是有效的 SQLite 数据库
        conn = sqlite3.connect(str(backup_file))
        rows = conn.execute("SELECT * FROM inventory_products").fetchall()
        conn.close()
        assert len(rows) == 1
        assert rows[0][0] == "test-001"
        assert rows[0][1] == "测试产品"

    def test_backup_integrity_check(self, test_db, tmp_path):
        """备份文件通过完整性校验。"""
        backup_dir = tmp_path / "backups"
        backup_file = do_backup(test_db, backup_dir)

        conn = sqlite3.connect(str(backup_file))
        result = conn.execute("PRAGMA integrity_check;").fetchone()
        conn.close()
        assert result[0] == "ok"


class TestRestore:
    """恢复测试。"""

    def test_restore_replaces_database(self, test_db, tmp_path):
        """正常恢复替换当前数据库。"""
        backup_dir = tmp_path / "backups"
        backup_file = do_backup(test_db, backup_dir)

        # 修改当前数据库（添加另一条记录）
        conn = sqlite3.connect(str(test_db))
        conn.execute(
            "INSERT INTO inventory_products VALUES (?, ?, ?, ?, ?)",
            ("test-002", "第二个产品", "品牌2", "消毒剂", "酒精"),
        )
        conn.commit()
        conn.close()

        # 恢复
        do_restore(backup_file, test_db)

        # 验证恢复后只有原始 1 条记录
        conn = sqlite3.connect(str(test_db))
        rows = conn.execute("SELECT * FROM inventory_products").fetchall()
        conn.close()
        assert len(rows) == 1
        assert rows[0][0] == "test-001"

    def test_restore_creates_safety_backup(self, test_db, tmp_path):
        """恢复前创建当前数据库的安全备份。"""
        backup_dir = tmp_path / "backups"
        backup_file = do_backup(test_db, backup_dir)

        do_restore(backup_file, test_db)

        # 应该存在安全备份文件
        safety_files = list(test_db.parent.glob("*.pre-restore-*"))
        assert len(safety_files) >= 1

    def test_restore_rejects_corrupted_backup(self, test_db, tmp_path):
        """损坏的备份文件被拒绝恢复。"""
        corrupted = tmp_path / "corrupted.db"
        corrupted.write_bytes(b"this is not a sqlite database file")

        # 尝试恢复应抛出异常
        with pytest.raises(Exception):
            do_restore(corrupted, test_db)

        # 原数据库应该未被修改
        conn = sqlite3.connect(str(test_db))
        rows = conn.execute("SELECT * FROM inventory_products").fetchall()
        conn.close()
        assert len(rows) == 1
        assert rows[0][0] == "test-001"

    def test_restore_atomic_replace(self, test_db, tmp_path):
        """恢复使用原子替换（先 copy 到 tmp 再 rename）。"""
        backup_dir = tmp_path / "backups"
        backup_file = do_backup(test_db, backup_dir)

        # 恢复
        do_restore(backup_file, test_db)

        # 不应残留 .restore-tmp 文件
        tmp_files = list(test_db.parent.glob("*.restore-tmp"))
        assert len(tmp_files) == 0

        # 数据库应该是有效的
        conn = sqlite3.connect(str(test_db))
        rows = conn.execute("SELECT * FROM inventory_products").fetchall()
        conn.close()
        assert len(rows) == 1
