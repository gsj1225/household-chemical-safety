"""CompatibilityService — 相容性编排层

产品变更后重算受影响关系。前端不自行计算关系。
"""

from __future__ import annotations

from typing import Any

from app.core.compatibility_engine import CompatibilityEngine
from app.data.inventory_repository import InventoryRepository
from app.models.compatibility import (
    CompatibilityRelation,
    CompatibilitySummary,
    CompatibilitySummaryStatus,
    EvidenceSource,
)
from app.models.inventory import InventoryProduct


class CompatibilityService:
    """相容性查询与重算服务"""

    def __init__(self, repo: InventoryRepository, engine: CompatibilityEngine):
        self._repo = repo
        self._engine = engine

    # ── 重算 ──────────────────────────────────────

    def recalculate_for_product(self, product_id: str) -> list[CompatibilityRelation]:
        """产品变更后重算受影响关系，返回变更的关系列表"""
        target = self._repo.get(product_id)
        if target is None:
            return []

        # 获取全部产品用于比较
        all_products, _ = self._repo.list()
        others = [p for p in all_products if p.id != product_id]

        # 计算新关系
        new_relations = self._engine.check_against_all(target, others)

        # 转换为存储格式
        relations_data = [self._relation_to_storage_dict(r, target) for r in new_relations]
        self._repo.save_relations(relations_data)

        return new_relations

    @staticmethod
    def _relation_to_storage_dict(
        relation: CompatibilityRelation, target: InventoryProduct
    ) -> dict[str, Any]:
        """将 CompatibilityRelation 转为 Repository 存储格式"""
        return {
            "relation_id": relation.id,
            "product_a_id": relation.product_a_id,
            "product_b_id": relation.product_b_id,
            "relation_type": relation.relation_type.value,
            "severity": relation.severity.value,
            "rule_id": relation.rule_id,
            "rule_version": relation.rule_version,
            "payload": {
                "title": relation.title,
                "rationale": relation.rationale,
                "recommended_action": relation.recommended_action,
                "evidence_status": relation.evidence_status.value,
                "sources": [s.model_dump() for s in relation.sources],
            },
            "updated_at": relation.updated_at,
        }

    # ── 查询 ──────────────────────────────────────

    def get_summary(self) -> CompatibilitySummary:
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

    def list_relations(
        self,
        product_id: str | None = None,
        relation_type: str | None = None,
        severity: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """列出关系，按严重等级排序"""
        raw_relations = self._repo.get_all_relations(product_id)

        # 过滤
        if relation_type:
            raw_relations = [r for r in raw_relations if r["relation_type"] == relation_type]
        if severity:
            raw_relations = [r for r in raw_relations if r["severity"] == severity]

        return raw_relations, len(raw_relations)

    def get_relation_detail(self, relation_id: str) -> dict[str, Any] | None:
        """获取单个关系详情"""
        all_relations = self._repo.get_all_relations()
        for r in all_relations:
            if r["relation_id"] == relation_id:
                return r
        return None
