"""Inventory Application Service — v2.0

Route 不访问 SQL，Repository 不调用模型或规则。
Service 负责编排 CRUD + 幂等 + 重复检查 + 预留相容性注入点。
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any


from app.data.inventory_repository import (
    DuplicateCandidateError,
    IdempotencyConflictError,
    InventoryRepository,
    ProductNotFoundError,
    RevisionConflictError,
)
from app.models.compatibility import (
    CompatibilitySummary,
    CompatibilitySummaryStatus,
    DuplicateCandidate,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    ProductMutationResult,
)
from app.models.inventory import (
    DuplicateDecision,
    InventoryFilters,
    InventoryProduct,
    ProductCreate,
    ProductDelete,
    ProductUpdate,
)
from app.core.duplicate_matcher import DuplicateMatcher


class _ProductReaderAdapter:
    """将 InventoryRepository 适配为 DuplicateMatcher 所需的 ProductReader 接口"""

    def __init__(self, repo: InventoryRepository):
        self._repo = repo

    def list_all(self) -> list[InventoryProduct]:
        items, _ = self._repo.list(InventoryFilters(limit=500))
        return items


class InventoryService:
    """库存产品编排服务"""

    def __init__(self, repo: InventoryRepository):
        self._repo = repo
        self._duplicate_matcher = DuplicateMatcher(_ProductReaderAdapter(repo))
        # 相容性回调注入点（B2 填充）
        self._on_product_changed: Any | None = None

    def set_compatibility_callback(self, callback) -> None:
        """B2 注入：产品变更后重算受影响关系"""
        self._on_product_changed = callback

    # ── 幂等辅助 ──────────────────────────────────

    def _check_idempotent(
        self, operation_id: str, request_payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        request_hash = self._repo._hash_request(request_payload)
        try:
            exists, response = self._repo.check_idempotency(operation_id, request_hash)
        except IdempotencyConflictError:
            raise
        if exists and response:
            return response
        return None

    def _record_mutation(
        self,
        operation_id: str,
        operation_type: str,
        product_id: str | None,
        request_payload: dict[str, Any],
        response: dict[str, Any],
    ) -> None:
        request_hash = self._repo._hash_request(request_payload)
        self._repo.record_mutation(operation_id, operation_type, product_id, request_hash, response)

    # ── 列表 ──────────────────────────────────────

    def list_products(
        self, filters: InventoryFilters | None = None
    ) -> tuple[list[InventoryProduct], int, CompatibilitySummary]:
        items, total = self._repo.list(filters)
        summary = self._build_summary()
        return items, total, summary

    def get_product(self, product_id: str) -> InventoryProduct:
        product = self._repo.get(product_id)
        if product is None:
            raise ProductNotFoundError(product_id)
        return product

    def get_product_detail(self, product_id: str) -> ProductMutationResult:
        """获取产品详情，包含仅涉及该产品的相容性摘要和关系列表"""
        from app.models.compatibility import CompatibilityRelation, EvidenceStatus, RelationType, Severity
        product = self._repo.get(product_id)
        if product is None:
            raise ProductNotFoundError(product_id)
        summary = self._build_product_summary(product_id)
        raw_relations = self._repo.get_relations_for_product(product_id)
        relations = []
        for r in raw_relations:
            payload = r.get("payload", {})
            relations.append(CompatibilityRelation(
                id=r["relation_id"],
                product_a_id=r["product_a_id"],
                product_b_id=r["product_b_id"],
                relation_type=RelationType(r["relation_type"]),
                severity=Severity(r["severity"]),
                title=payload.get("title", ""),
                rationale=payload.get("rationale", ""),
                recommended_action=payload.get("recommended_action", ""),
                rule_id=r.get("rule_id"),
                rule_version=r["rule_version"],
                evidence_status=EvidenceStatus(payload.get("evidence_status", "needs_review")),
                sources=payload.get("sources", []),
                updated_at=r["updated_at"],
            ))
        return ProductMutationResult(
            product=product,
            compatibility_summary=summary,
            changed_relations=relations,
        )

    # ── 创建 ──────────────────────────────────────

    def create_product(self, req: ProductCreate) -> ProductMutationResult:
        # 幂等检查
        existing = self._check_idempotent(req.operation_id, req.model_dump(by_alias=True))
        if existing is not None:
            return ProductMutationResult.model_validate(existing)

        # 疑似重复检查
        # - check_first（默认）：首次提交，检查重复，有候选则返回 409
        # - create_another：用户已看过重复候选，选择创建另一件，跳过检查
        # - update_existing：用户选择更新已有产品，不应走创建接口
        if req.duplicate_decision == DuplicateDecision.update_existing:
            raise ValueError(
                "duplicate_decision=update_existing 应使用 PATCH /inventory/products/{id} 更新已有产品，"
                "而非 POST /inventory/products 创建新产品"
            )

        if req.duplicate_decision == DuplicateDecision.check_first:
            candidates = self._find_duplicates(
                req.name, req.brand, req.category.value, req.barcode
            )
            if candidates:
                raise DuplicateCandidateError(candidates)

        # 原子事务：产品创建 + 相容性重算 + 幂等记录
        with self._repo.transaction():
            product = self._repo.create(req)
            changed_relations = self._trigger_compatibility_recalc(product.id)
            result = ProductMutationResult(
                product=product,
                compatibility_summary=self._build_summary(),
                changed_relations=changed_relations,
            )
            self._record_mutation(
                req.operation_id,
                "create",
                product.id,
                req.model_dump(by_alias=True),
                result.model_dump(by_alias=True),
            )

        return result

    # ── 修改 ──────────────────────────────────────

    def update_product(self, product_id: str, req: ProductUpdate) -> ProductMutationResult:
        # 幂等检查
        existing = self._check_idempotent(req.operation_id, {**req.model_dump(by_alias=True), "product_id": product_id})
        if existing is not None:
            return ProductMutationResult.model_validate(existing)

        # 原子事务：产品更新 + 相容性重算 + 幂等记录
        with self._repo.transaction():
            product = self._repo.update(product_id, req)
            changed_relations = self._trigger_compatibility_recalc(product_id)
            result = ProductMutationResult(
                product=product,
                compatibility_summary=self._build_summary(),
                changed_relations=changed_relations,
            )
            self._record_mutation(
                req.operation_id,
                "update",
                product_id,
                {**req.model_dump(by_alias=True), "product_id": product_id},
                result.model_dump(by_alias=True),
            )

        return result

    # ── 删除 ──────────────────────────────────────

    def delete_product(self, product_id: str, req: ProductDelete) -> CompatibilitySummary:
        # 幂等检查
        existing = self._check_idempotent(
            req.operation_id, {**req.model_dump(by_alias=True), "product_id": product_id}
        )
        if existing is not None:
            return CompatibilitySummary.model_validate(existing["compatibilitySummary"])

        # 原子事务：产品删除 + 摘要刷新 + 幂等记录
        with self._repo.transaction():
            self._repo.delete(product_id, req)
            summary = self._build_summary()
            self._record_mutation(
                req.operation_id,
                "delete",
                product_id,
                {**req.model_dump(by_alias=True), "product_id": product_id},
                {"compatibilitySummary": summary.model_dump(by_alias=True)},
            )

        return summary

    # ── 重复检查 ──────────────────────────────────

    def check_duplicates(self, req: DuplicateCheckRequest) -> DuplicateCheckResponse:
        candidates = self._find_duplicates(req.name, req.brand, req.category, req.barcode)
        return DuplicateCheckResponse(
            candidates=candidates,
            hasCandidates=len(candidates) > 0,
        )

    def _find_duplicates(
        self,
        name: str,
        brand: str | None,
        category: str | None,
        barcode: str | None,
    ) -> list[DuplicateCandidate]:
        return self._duplicate_matcher.find_duplicates(
            name=name, brand=brand, category=category, barcode=barcode
        )

    # ── 摘要 ──────────────────────────────────────

    def _build_summary(self) -> CompatibilitySummary:
        total_products = self._repo.count_products()
        severity_counts = self._repo.count_relations_by_severity()
        type_counts = self._repo.count_relations_by_type()

        critical = severity_counts.get("critical", 0)
        attention = severity_counts.get("attention", 0)
        unknown = severity_counts.get("unknown", 0)
        # needs_information 是 relation_type，不是 severity
        needs_info = type_counts.get("needs_information", 0)
        total_relations = sum(severity_counts.values())

        if critical > 0 or attention > 0:
            status = CompatibilitySummaryStatus.has_conflict
        elif needs_info > 0:
            status = CompatibilitySummaryStatus.needs_information
        else:
            status = CompatibilitySummaryStatus.no_registered_conflict

        return CompatibilitySummary(
            status=status,
            totalRelations=total_relations,
            criticalCount=critical,
            attentionCount=attention,
            unknownCount=unknown,
            needsInformationCount=needs_info,
            totalProducts=total_products,
        )

    def _build_product_summary(self, product_id: str) -> CompatibilitySummary:
        """构建仅涉及指定产品的相容性摘要"""
        severity_counts = self._repo.count_relations_by_severity_for_product(product_id)
        type_counts = self._repo.count_relations_by_type_for_product(product_id)

        critical = severity_counts.get("critical", 0)
        attention = severity_counts.get("attention", 0)
        unknown = severity_counts.get("unknown", 0)
        needs_info = type_counts.get("needs_information", 0)
        total_relations = sum(severity_counts.values())

        if critical > 0 or attention > 0:
            status = CompatibilitySummaryStatus.has_conflict
        elif needs_info > 0:
            status = CompatibilitySummaryStatus.needs_information
        else:
            status = CompatibilitySummaryStatus.no_registered_conflict

        return CompatibilitySummary(
            status=status,
            totalRelations=total_relations,
            criticalCount=critical,
            attentionCount=attention,
            unknownCount=unknown,
            needsInformationCount=needs_info,
            totalProducts=1,
        )

    # ── 相容性重算 ────────────────────────────────

    def _trigger_compatibility_recalc(self, product_id: str) -> list:
        """B2 注入回调；MVP 阶段返回空列表"""
        if self._on_product_changed:
            return self._on_product_changed(product_id)
        return []

    def get_all_products_for_compatibility(self) -> list[InventoryProduct]:
        """供 B2 CompatibilityService 使用"""
        items, _ = self._repo.list(InventoryFilters(limit=500))
        return items
