"""CompatibilityEngine — 确定性规则匹配引擎

规则匹配必须对 A/B 顺序对称，对别名、大小写和常见中文写法归一化。
不使用 AI 结论，不读取图片。
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.compatibility import (
    CompatibilityRelation,
    EvidenceSource,
    EvidenceStatus,
    RelationType,
    Severity,
)
from app.models.inventory import (
    FactSource,
    IdentificationConfidence,
    InformationStatus,
    InventoryProduct,
    ProductCategory,
)


class CompatibilityEngine:
    """规则驱动的相容性检查引擎"""

    def __init__(self, rules_path: str | None = None, aliases_path: str | None = None):
        base = Path(__file__).parents[1] / "data"
        self._rules = self._load_rules(rules_path or str(base / "compatibility_rules.json"))
        self._aliases = self._load_aliases(aliases_path or str(base / "ingredient_aliases.json"))
        self._alias_index = self._build_alias_index()

    # ── 数据加载 ──────────────────────────────────

    @staticmethod
    def _load_rules(path: str) -> list[dict[str, Any]]:
        with open(path, "r", encoding="utf-8") as f:
            rules = json.load(f)
        return [r for r in rules if r.get("enabled", True)]

    @staticmethod
    def _load_aliases(path: str) -> dict[str, list[str]]:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _build_alias_index(self) -> dict[str, str]:
        """构建 别名→标准名 的反向索引"""
        index: dict[str, str] = {}
        for canonical, aliases in self._aliases.items():
            index[self._normalize(canonical)] = canonical
            for alias in aliases:
                index[self._normalize(alias)] = canonical
        return index

    # ── 归一化 ────────────────────────────────────

    @staticmethod
    def _normalize(text: str) -> str:
        """统一大小写、去空白、繁简不转换（由别名表覆盖）"""
        return re.sub(r"\s+", "", text).lower().strip()

    def _resolve_ingredient(self, raw: str) -> str:
        """将原始成分名解析为标准名，未命中则返回归一化后的原始值"""
        normalized = self._normalize(raw)
        return self._alias_index.get(normalized, normalized)

    def _product_ingredients(self, product: InventoryProduct) -> set[str]:
        """提取产品中用户确认的成分标准名集合"""
        result: set[str] = set()
        for fact in product.ingredients:
            if fact.confirmation.value == "confirmed":
                resolved = self._resolve_ingredient(fact.display_value)
                if resolved:
                    result.add(resolved)
        return result

    @staticmethod
    def _product_categories(product: InventoryProduct) -> set[str]:
        return {product.category.value}

    # ── 规则匹配 ──────────────────────────────────

    def _match_side_ingredients(
        self, side: dict[str, Any], ingredients: set[str]
    ) -> bool:
        """检查产品的已确认成分是否命中规则某一侧的成分列表"""
        side_ingredients = {self._resolve_ingredient(i) for i in side.get("ingredients", [])}
        return bool(side_ingredients & ingredients)

    def _match_side_category(
        self, side: dict[str, Any], categories: set[str]
    ) -> bool:
        """检查产品的品类是否命中规则某一侧的品类列表"""
        side_categories = set(side.get("categories", []))
        return bool(side_categories & categories)

    def check_pair(
        self, product_a: InventoryProduct, product_b: InventoryProduct
    ) -> list[CompatibilityRelation]:
        """检查两个产品之间的相容性，返回所有命中的关系

        匹配层级：
        1. 成分命中：两侧均已确认的具体化学成分命中规则 → 确定性关系
        2. 品类命中：仅品类命中但无成分命中 → needs_information 提示
        3. 无命中：不产生关系
        """
        if product_a.id == product_b.id:
            return []

        ingredients_a = self._product_ingredients(product_a)
        ingredients_b = self._product_ingredients(product_b)
        categories_a = self._product_categories(product_a)
        categories_b = self._product_categories(product_b)

        # 信息不足检查：如果两个产品都没有确认成分，可能需要补充信息
        if not ingredients_a and not ingredients_b:
            if product_a.information_status == InformationStatus.needs_information or \
               product_b.information_status == InformationStatus.needs_information:
                return [self._make_needs_information(product_a, product_b)]

        relations: list[CompatibilityRelation] = []
        seen_rule_ids: set[str] = set()
        category_only_hits: list[dict[str, Any]] = []

        for rule in self._rules:
            if rule["id"] in seen_rule_ids:
                continue

            # 第一层：成分命中（两侧都必须有成分命中）
            ing_ab = self._match_side_ingredients(rule["side_a"], ingredients_a) and \
                     self._match_side_ingredients(rule["side_b"], ingredients_b)
            ing_ba = self._match_side_ingredients(rule["side_a"], ingredients_b) and \
                     self._match_side_ingredients(rule["side_b"], ingredients_a)

            if ing_ab or ing_ba:
                relations.append(self._build_relation(rule, product_a, product_b))
                seen_rule_ids.add(rule["id"])
                continue

            # 第二层：品类命中（两侧都只通过品类命中，无成分命中）
            # 仅记录，不立即产生确定性关系
            cat_ab = self._match_side_category(rule["side_a"], categories_a) and \
                     self._match_side_category(rule["side_b"], categories_b)
            cat_ba = self._match_side_category(rule["side_a"], categories_b) and \
                     self._match_side_category(rule["side_b"], categories_a)

            if cat_ab or cat_ba:
                # 检查是否至少一侧有已确认成分（但未命中规则成分列表）
                has_any_ingredients = bool(ingredients_a or ingredients_b)
                if not has_any_ingredients:
                    category_only_hits.append(rule)

        # 品类命中且无成分信息时，生成待补充提示
        if category_only_hits and not relations:
            relations.append(self._make_category_needs_info(product_a, product_b, category_only_hits))

        return relations

    def check_against_all(
        self, target: InventoryProduct, all_products: list[InventoryProduct]
    ) -> list[CompatibilityRelation]:
        """检查目标产品与库存中所有其他产品的关系"""
        relations: list[CompatibilityRelation] = []
        for other in all_products:
            if other.id == target.id:
                continue
            pair_relations = self.check_pair(target, other)
            relations.extend(pair_relations)
        return relations

    # ── 关系构建 ──────────────────────────────────

    def _build_relation(
        self, rule: dict[str, Any], product_a: InventoryProduct, product_b: InventoryProduct
    ) -> CompatibilityRelation:
        a_id, b_id = sorted([product_a.id, product_b.id])

        sources = [
            EvidenceSource(
                organization=s.get("organization", ""),
                title=s.get("title", ""),
                url=s.get("url"),
                reviewed_at=s.get("reviewed_at"),
            )
            for s in rule.get("sources", [])
        ]

        return CompatibilityRelation(
            relationId=f"rel-{uuid.uuid4().hex[:12]}",
            productAId=a_id,
            productBId=b_id,
            relationType=RelationType(rule["relation_type"]),
            severity=Severity(rule["severity"]),
            title=rule["title"],
            rationale=rule["rationale"],
            recommendedAction=rule["recommended_action"],
            ruleId=rule["id"],
            ruleVersion=rule.get("version", "1.0"),
            evidenceStatus=EvidenceStatus(rule.get("evidence_status", "needs_review")),
            sources=sources,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

    def _make_needs_information(
        self, product_a: InventoryProduct, product_b: InventoryProduct
    ) -> CompatibilityRelation:
        a_id, b_id = sorted([product_a.id, product_b.id])
        return CompatibilityRelation(
            relationId=f"rel-{uuid.uuid4().hex[:12]}",
            productAId=a_id,
            productBId=b_id,
            relationType=RelationType.needs_information,
            severity=Severity.unknown,
            title="成分信息待补充",
            rationale="两件产品的成分信息均不完整，暂时无法完成相容性检查。",
            recommendedAction="补拍产品标签或手动补充成分信息后重新检查。",
            ruleId=None,
            ruleVersion="system",
            evidenceStatus=EvidenceStatus.needs_review,
            sources=[],
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

    def _make_category_needs_info(
        self,
        product_a: InventoryProduct,
        product_b: InventoryProduct,
        matched_rules: list[dict[str, Any]],
    ) -> CompatibilityRelation:
        """品类命中但无成分命中时，生成待补充信息提示

        与 _make_needs_information 的区别：
        - _make_needs_information：两个产品都没有确认成分
        - _make_category_needs_info：品类命中了某条规则，但缺乏具体成分确认
          需要用户补充成分信息后才能判定是否真正冲突
        """
        a_id, b_id = sorted([product_a.id, product_b.id])
        rule_titles = "、".join(r["title"] for r in matched_rules)
        return CompatibilityRelation(
            relationId=f"rel-{uuid.uuid4().hex[:12]}",
            productAId=a_id,
            productBId=b_id,
            relationType=RelationType.needs_information,
            severity=Severity.unknown,
            title="品类匹配，成分信息待确认",
            rationale=(
                f"两件产品的品类组合命中了以下规则：{rule_titles}。"
                "但由于缺少已确认的具体成分信息，无法判定是否真正存在相容性风险。"
            ),
            recommendedAction=(
                "请补充或确认两件产品的具体化学成分，系统将自动重新检查。"
            ),
            ruleId=None,
            ruleVersion="system",
            evidenceStatus=EvidenceStatus.needs_review,
            sources=[],
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

    # ── 查询 ──────────────────────────────────────

    def get_rule_by_id(self, rule_id: str) -> dict[str, Any] | None:
        for rule in self._rules:
            if rule["id"] == rule_id:
                return rule
        return None

    @property
    def rule_count(self) -> int:
        return len(self._rules)
