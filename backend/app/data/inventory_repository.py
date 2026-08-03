"""Inventory SQLite 仓储 — v2.0

产品、幂等操作记录。沿用同一 DATABASE_PATH，新增表，旧 challenges 表不动。
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import threading
from typing import Any, Iterator

from app.config import settings
from app.models.inventory import (
    ConfirmedFact,
    DatePrecision,
    FactSource,
    IdentificationConfidence,
    InformationStatus,
    InventoryFilters,
    InventoryProduct,
    PartialDate,
    ProductCategory,
    ProductCreate,
    ProductDelete,
    ProductUpdate,
    SafetyStatement,
)


class _TransactionConnection:
    """连接包装器：在事务上下文中阻止 with 语句提前 commit/rollback。

    sqlite3.Connection 的 __exit__ 会自动 commit/rollback，
    但在事务上下文中我们希望由 transaction() 统一控制。
    """

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def __enter__(self) -> sqlite3.Connection:
        return self._conn.__enter__()

    def __exit__(self, *args: Any) -> None:
        pass

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)


class InventoryRepository:
    """库存产品 CRUD + 幂等操作记录

    使用 transaction() 上下文管理器可以将多个操作包裹在同一个
    SQLite 事务中，确保原子性。在事务上下文内，所有 _connect()
    调用返回同一个连接，退出上下文时统一 commit 或 rollback。
    """

    def __init__(self, database_path: str | None = None):
        configured = Path(database_path or settings.DATABASE_PATH)
        if not configured.is_absolute():
            configured = Path(__file__).parents[2] / configured
        configured.parent.mkdir(parents=True, exist_ok=True)
        self._path = configured
        self._lock = threading.RLock()
        self._tls = threading.local()
        self._initialize()

    # ── 连接 ──────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        """获取数据库连接。

        如果当前线程处于 transaction() 上下文中，返回事务连接；
        否则创建新的独立连接。
        """
        txn_conn = getattr(self._tls, 'conn', None)
        if txn_conn is not None:
            return _TransactionConnection(txn_conn)
        conn = sqlite3.connect(self._path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """事务上下文管理器。

        在此上下文内，所有 _connect() 调用返回同一个连接。
        正常退出时 commit，异常时 rollback。
        """
        with self._lock:
            conn = sqlite3.connect(self._path, timeout=10)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("BEGIN")
            self._tls.conn = conn
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                self._tls.conn = None
                conn.close()

    def _initialize(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS inventory_products (
                    product_id TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL DEFAULT 1,
                    brand TEXT,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    barcode TEXT,
                    production_date_json TEXT NOT NULL,
                    expiry_date_json TEXT NOT NULL,
                    shelf_life_text TEXT,
                    facts_json TEXT NOT NULL,
                    information_status TEXT NOT NULL DEFAULT 'needs_information',
                    confidence TEXT NOT NULL DEFAULT 'unknown',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_inv_updated "
                "ON inventory_products(updated_at DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_inv_category "
                "ON inventory_products(category)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_inv_status "
                "ON inventory_products(information_status)"
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS inventory_mutations (
                    operation_id TEXT NOT NULL,
                    operation_type TEXT NOT NULL,
                    product_id TEXT,
                    request_hash TEXT NOT NULL,
                    response_json TEXT,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (operation_id, request_hash)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_mut_created "
                "ON inventory_mutations(created_at)"
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS compatibility_relations (
                    relation_id TEXT PRIMARY KEY,
                    product_a_id TEXT NOT NULL,
                    product_b_id TEXT NOT NULL,
                    relation_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    rule_id TEXT,
                    rule_version TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(product_a_id, product_b_id, rule_id),
                    FOREIGN KEY (product_a_id) REFERENCES inventory_products(product_id) ON DELETE CASCADE,
                    FOREIGN KEY (product_b_id) REFERENCES inventory_products(product_id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_rel_a "
                "ON compatibility_relations(product_a_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_rel_b "
                "ON compatibility_relations(product_b_id)"
            )

    # ── 序列化辅助 ────────────────────────────────

    @staticmethod
    def _product_to_row(p: InventoryProduct) -> dict[str, Any]:
        facts = {
            "ingredients": [f.model_dump() for f in p.ingredients],
            "label_warnings": [f.model_dump() for f in p.label_warnings],
            "storage_requirements": [s.model_dump() for s in p.storage_requirements],
            "hazards": [s.model_dump() for s in p.hazards],
            "incompatibility_targets": [s.model_dump() for s in p.incompatibility_targets],
        }
        return {
            "product_id": p.id,
            "revision": p.revision,
            "brand": p.brand,
            "name": p.name,
            "category": p.category.value,
            "barcode": p.barcode,
            "production_date_json": p.production_date.model_dump_json(),
            "expiry_date_json": p.expiry_date.model_dump_json(),
            "shelf_life_text": p.shelf_life_text,
            "facts_json": json.dumps(facts, ensure_ascii=False),
            "information_status": p.information_status.value,
            "confidence": p.identification_confidence.value,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        }

    @staticmethod
    def _row_to_product(row: sqlite3.Row) -> InventoryProduct:
        facts = json.loads(row["facts_json"])
        prod_date = PartialDate.model_validate_json(row["production_date_json"])
        exp_date = PartialDate.model_validate_json(row["expiry_date_json"])
        return InventoryProduct(
            productId=row["product_id"],
            revision=row["revision"],
            brand=row["brand"],
            name=row["name"],
            category=ProductCategory(row["category"]),
            barcode=row["barcode"],
            production_date=prod_date,
            expiry_date=exp_date,
            shelf_life_text=row["shelf_life_text"],
            ingredients=[ConfirmedFact.model_validate(f) for f in facts.get("ingredients", [])],
            label_warnings=[ConfirmedFact.model_validate(f) for f in facts.get("label_warnings", [])],
            storage_requirements=[SafetyStatement.model_validate(s) for s in facts.get("storage_requirements", [])],
            hazards=[SafetyStatement.model_validate(s) for s in facts.get("hazards", [])],
            incompatibility_targets=[SafetyStatement.model_validate(s) for s in facts.get("incompatibility_targets", [])],
            identification_confidence=IdentificationConfidence(row["confidence"]),
            information_status=InformationStatus(row["information_status"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _hash_request(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    # ── 幂等检查 ──────────────────────────────────

    def check_idempotency(
        self, operation_id: str, request_hash: str
    ) -> tuple[bool, dict[str, Any] | None]:
        """返回 (已存在?, 响应快照)"""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT response_json FROM inventory_mutations "
                "WHERE operation_id = ? AND request_hash = ?",
                (operation_id, request_hash),
            ).fetchone()
        if row:
            return True, json.loads(row["response_json"]) if row["response_json"] else None
        # 检查是否有相同 operation_id 但不同 request
        row2 = conn.execute(
            "SELECT 1 FROM inventory_mutations WHERE operation_id = ? AND request_hash != ?",
            (operation_id, request_hash),
        ).fetchone()
        if row2:
            raise IdempotencyConflictError(operation_id)
        return False, None

    def record_mutation(
        self,
        operation_id: str,
        operation_type: str,
        product_id: str | None,
        request_hash: str,
        response: dict[str, Any],
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO inventory_mutations
                    (operation_id, operation_type, product_id, request_hash, response_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    operation_id,
                    operation_type,
                    product_id,
                    request_hash,
                    json.dumps(response, ensure_ascii=False),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def cleanup_mutations(self, retention_days: int = 7) -> int:
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=retention_days)
        ).isoformat()
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM inventory_mutations WHERE created_at < ?",
                (cutoff,),
            )
            return cur.rowcount

    # ── CRUD ──────────────────────────────────────

    def create(self, req: ProductCreate) -> InventoryProduct:
        now = datetime.now(timezone.utc).isoformat()
        product = InventoryProduct(
            productId=req.product_id,
            revision=1,
            brand=req.brand,
            name=req.name,
            category=req.category,
            barcode=req.barcode,
            production_date=req.production_date,
            expiry_date=req.expiry_date,
            shelf_life_text=req.shelf_life_text,
            ingredients=req.ingredients,
            label_warnings=req.label_warnings,
            storage_requirements=req.storage_requirements,
            hazards=req.hazards,
            incompatibility_targets=req.incompatibility_targets,
            identification_confidence=req.identification_confidence,
            information_status=req.information_status,
            created_at=now,
            updated_at=now,
        )
        row_data = self._product_to_row(product)
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO inventory_products
                    (product_id, revision, brand, name, category, barcode,
                     production_date_json, expiry_date_json, shelf_life_text,
                     facts_json, information_status, confidence, created_at, updated_at)
                VALUES (:product_id, :revision, :brand, :name, :category, :barcode,
                        :production_date_json, :expiry_date_json, :shelf_life_text,
                        :facts_json, :information_status, :confidence, :created_at, :updated_at)
                """,
                row_data,
            )
        return product

    def get(self, product_id: str) -> InventoryProduct | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM inventory_products WHERE product_id = ?",
                (product_id,),
            ).fetchone()
        return self._row_to_product(row) if row else None

    def list(self, filters: InventoryFilters | None = None) -> tuple[list[InventoryProduct], int]:
        filters = filters or InventoryFilters()
        clauses: list[str] = []
        params: list[Any] = []

        if filters.query:
            clauses.append("name LIKE ?")
            params.append(f"%{filters.query}%")

        if filters.category:
            clauses.append("category = ?")
            params.append(filters.category.value)

        if filters.expiry_status == "unknown":
            clauses.append("expiry_date_json LIKE '%\"precision\": \"unknown\"%'")
        elif filters.expiry_status == "expiring_soon":
            clauses.append("expiry_date_json NOT LIKE '%\"precision\": \"unknown\"%'")

        if filters.safety_status == "needs_info":
            clauses.append("information_status = 'needs_information'")
        elif filters.safety_status == "has_hazard":
            clauses.append("facts_json LIKE '%\"hazards\"%' AND facts_json != '[]'")

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        sort_col = {"updated_at": "updated_at", "name": "name", "expiry": "expiry_date_json"}.get(
            filters.sort_by, "updated_at"
        )
        sort_dir = "ASC" if filters.sort_order == "asc" else "DESC"
        limit = max(1, min(filters.limit, 500))
        offset = max(0, filters.offset)

        with self._connect() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) as cnt FROM inventory_products {where}", params
            ).fetchone()["cnt"]

            rows = conn.execute(
                f"SELECT * FROM inventory_products {where} "
                f"ORDER BY {sort_col} {sort_dir} LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()

        return [self._row_to_product(r) for r in rows], total

    def update(self, product_id: str, req: ProductUpdate) -> InventoryProduct:
        existing = self.get(product_id)
        if existing is None:
            raise ProductNotFoundError(product_id)
        if existing.revision != req.expected_revision:
            raise RevisionConflictError(product_id, existing.revision, req.expected_revision)

        now = datetime.now(timezone.utc).isoformat()
        updated = InventoryProduct(
            productId=product_id,
            revision=existing.revision + 1,
            brand=req.brand,
            name=req.name,
            category=req.category,
            barcode=req.barcode,
            production_date=req.production_date,
            expiry_date=req.expiry_date,
            shelf_life_text=req.shelf_life_text,
            ingredients=req.ingredients,
            label_warnings=req.label_warnings,
            storage_requirements=req.storage_requirements,
            hazards=req.hazards,
            incompatibility_targets=req.incompatibility_targets,
            identification_confidence=req.identification_confidence,
            information_status=req.information_status,
            created_at=existing.created_at,
            updated_at=now,
        )
        row_data = self._product_to_row(updated)
        with self._lock, self._connect() as conn:
            result = conn.execute(
                """
                UPDATE inventory_products SET
                    revision = :revision,
                    brand = :brand,
                    name = :name,
                    category = :category,
                    barcode = :barcode,
                    production_date_json = :production_date_json,
                    expiry_date_json = :expiry_date_json,
                    shelf_life_text = :shelf_life_text,
                    facts_json = :facts_json,
                    information_status = :information_status,
                    confidence = :confidence,
                    updated_at = :updated_at
                WHERE product_id = :product_id AND revision = :revision - 1
                """,
                row_data,
            )
            if result.rowcount == 0:
                raise RevisionConflictError(product_id, existing.revision, req.expected_revision)

        # 删除涉及该产品的旧相容性关系（由 CompatibilityService 重算）
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM compatibility_relations WHERE product_a_id = ? OR product_b_id = ?",
                (product_id, product_id),
            )
        return updated

    def delete(self, product_id: str, req: ProductDelete) -> None:
        existing = self.get(product_id)
        if existing is None:
            raise ProductNotFoundError(product_id)
        if existing.revision != req.expected_revision:
            raise RevisionConflictError(product_id, existing.revision, req.expected_revision)

        with self._lock, self._connect() as conn:
            # 外键级联删除关系
            conn.execute(
                "DELETE FROM inventory_products WHERE product_id = ? AND revision = ?",
                (product_id, req.expected_revision),
            )

    # ── 相容性关系存储 ────────────────────────────

    def save_relations(self, relations: list[dict[str, Any]]) -> None:
        if not relations:
            return
        with self._lock, self._connect() as conn:
            for rel in relations:
                a_id = rel["product_a_id"]
                b_id = rel["product_b_id"]
                # 规范化：确保 a < b
                if a_id > b_id:
                    a_id, b_id = b_id, a_id
                    rel["product_a_id"] = a_id
                    rel["product_b_id"] = b_id

                conn.execute(
                    """
                    INSERT INTO compatibility_relations
                        (relation_id, product_a_id, product_b_id, relation_type,
                         severity, rule_id, rule_version, payload_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(product_a_id, product_b_id, rule_id) DO UPDATE SET
                        relation_type=excluded.relation_type,
                        severity=excluded.severity,
                        payload_json=excluded.payload_json,
                        updated_at=excluded.updated_at
                    """,
                    (
                        rel["relation_id"],
                        a_id,
                        b_id,
                        rel["relation_type"],
                        rel["severity"],
                        rel.get("rule_id"),
                        rel["rule_version"],
                        json.dumps(rel["payload"], ensure_ascii=False),
                        rel["updated_at"],
                    ),
                )

    def get_relations_for_product(self, product_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM compatibility_relations
                WHERE product_a_id = ? OR product_b_id = ?
                ORDER BY CASE severity
                    WHEN 'critical' THEN 0
                    WHEN 'attention' THEN 1
                    WHEN 'unknown' THEN 2
                    WHEN 'info' THEN 3
                END
                """,
                (product_id, product_id),
            ).fetchall()
        return [self._relation_row_to_dict(r) for r in rows]

    def get_all_relations(
        self, product_id: str | None = None
    ) -> list[dict[str, Any]]:
        where = "WHERE product_a_id = ? OR product_b_id = ?" if product_id else ""
        params = (product_id, product_id) if product_id else ()
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM compatibility_relations {where}
                ORDER BY CASE severity
                    WHEN 'critical' THEN 0
                    WHEN 'attention' THEN 1
                    WHEN 'unknown' THEN 2
                    WHEN 'info' THEN 3
                END
                """,
                params,
            ).fetchall()
        return [self._relation_row_to_dict(r) for r in rows]

    def count_products(self) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) as cnt FROM inventory_products"
            ).fetchone()["cnt"]

    def count_relations_by_severity(self) -> dict[str, int]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT severity, COUNT(*) as cnt
                FROM compatibility_relations
                GROUP BY severity
                """
            ).fetchall()
        return {row["severity"]: row["cnt"] for row in rows}

    def count_relations_by_type(self) -> dict[str, int]:
        """按 relation_type 统计关系数（needs_information 等是 type 而非 severity）"""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT relation_type, COUNT(*) as cnt
                FROM compatibility_relations
                GROUP BY relation_type
                """
            ).fetchall()
        return {row["relation_type"]: row["cnt"] for row in rows}

    def count_relations_by_severity_for_product(self, product_id: str) -> dict[str, int]:
        """按 severity 统计涉及指定产品的关系数"""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT severity, COUNT(*) as cnt
                FROM compatibility_relations
                WHERE product_a_id = ? OR product_b_id = ?
                GROUP BY severity
                """,
                (product_id, product_id),
            ).fetchall()
        return {row["severity"]: row["cnt"] for row in rows}

    def count_relations_by_type_for_product(self, product_id: str) -> dict[str, int]:
        """按 relation_type 统计涉及指定产品的关系数"""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT relation_type, COUNT(*) as cnt
                FROM compatibility_relations
                WHERE product_a_id = ? OR product_b_id = ?
                GROUP BY relation_type
                """,
                (product_id, product_id),
            ).fetchall()
        return {row["relation_type"]: row["cnt"] for row in rows}

    @staticmethod
    def _relation_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        payload = json.loads(row["payload_json"])
        return {
            "relation_id": row["relation_id"],
            "product_a_id": row["product_a_id"],
            "product_b_id": row["product_b_id"],
            "relation_type": row["relation_type"],
            "severity": row["severity"],
            "rule_id": row["rule_id"],
            "rule_version": row["rule_version"],
            "payload": payload,
            "updated_at": row["updated_at"],
        }

    # ── 测试辅助 ──────────────────────────────────

    def clear(self) -> None:
        """仅供自动化测试清理隔离数据。"""
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM inventory_mutations")
            conn.execute("DELETE FROM compatibility_relations")
            conn.execute("DELETE FROM inventory_products")


# ── 异常 ──────────────────────────────────────────


class ProductNotFoundError(Exception):
    def __init__(self, product_id: str):
        self.product_id = product_id
        super().__init__(f"Product not found: {product_id}")


class RevisionConflictError(Exception):
    def __init__(self, product_id: str, current: int, expected: int):
        self.product_id = product_id
        self.current = current
        self.expected = expected
        super().__init__(
            f"Revision conflict for {product_id}: current={current}, expected={expected}"
        )


class IdempotencyConflictError(Exception):
    def __init__(self, operation_id: str):
        self.operation_id = operation_id
        super().__init__(
            f"Idempotency conflict: operation {operation_id} already used with different request"
        )


class DuplicateCandidateError(Exception):
    def __init__(self, candidates: list[dict[str, Any]]):
        self.candidates = candidates
        super().__init__(f"Duplicate candidates found: {len(candidates)}")
