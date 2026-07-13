"""风险评估引擎。

基于化学品冲突规则库，判断单品风险和交叉风险。
不依赖 AI，纯规则匹配 + 风险等级判定。
"""

import json
from pathlib import Path

from app.models.scan import ProductIdentification
from app.models.risk import (
    RiskAssessment, RiskResult, RiskLevel, RiskType,
)

DATA_DIR = Path(__file__).parent.parent / "data"


class RiskEngine:
    """风险评估引擎，基于规则匹配。"""

    def __init__(self):
        self._rules = self._load_rules()
        self._category_risks = self._load_category_risks()
        self._product_risks = self._load_product_risks()
        self._evidence = self._load_evidence()

    def _load_rules(self) -> list[dict]:
        """加载化学品冲突规则库"""
        rules_path = DATA_DIR / "risk_rules.json"
        if rules_path.exists():
            with open(rules_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def _load_category_risks(self) -> list[dict]:
        """加载品类通用风险模板"""
        path = DATA_DIR / "category_risks.json"
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def _load_product_risks(self) -> list[dict]:
        """加载已知风险产品库"""
        path = DATA_DIR / "product_risks.json"
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def _load_evidence(self) -> dict:
        path = DATA_DIR / "risk_evidence.json"
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"rules": {}, "products": {}}

    def _evidence_fields(self, group: str, item_id: str) -> dict:
        evidence = self._evidence.get(group, {}).get(item_id, {})
        return {
            "evidence_status": evidence.get("status", "needs_review"),
            "evidence_level": evidence.get("level", "unverified"),
            "reviewed_at": evidence.get("reviewed_at"),
            "sources": evidence.get("sources", []),
        }

    def assess(
        self,
        current_product: ProductIdentification,
        scanned_products: list[dict],
    ) -> RiskAssessment:
        """评估单个产品的风险，包括与已扫描产品的交叉风险。"""
        risks: list[RiskResult] = []

        # 1. 检查交叉风险（化学品冲突）
        cross_risks = self._check_cross_risks(current_product, scanned_products)
        risks.extend(cross_risks)

        # 2. 检查已知风险产品匹配
        product_risk = self._check_product_risk(current_product)
        if product_risk:
            risks.append(product_risk)

        # 3. 检查品类通用风险（如果没有已匹配的具体产品风险）
        if not product_risk:
            single_risk = self._check_single_risk(current_product)
            if single_risk:
                risks.append(single_risk)

        return RiskAssessment(
            products=[current_product.model_dump()],
            risks=risks,
            has_mine=len(risks) > 0,
            mine_count=len(risks),
        )

    def _check_cross_risks(
        self,
        current: ProductIdentification,
        scanned: list[dict],
    ) -> list[RiskResult]:
        """检查当前产品与已扫描产品之间的化学品冲突。"""
        results = []

        for rule in self._rules:
            trigger = rule.get("trigger", {})
            ingredients_1 = trigger.get("ingredients_1", [])
            ingredients_2 = trigger.get("ingredients_2", [])

            if not ingredients_1 or not ingredients_2:
                continue

            current_ingredients = set(current.ingredients)
            if not current_ingredients & set(ingredients_1):
                if not current_ingredients & set(ingredients_2):
                    continue
                ingredients_1, ingredients_2 = ingredients_2, ingredients_1

            for prev_product in scanned:
                prev_ingredients = set(prev_product.get("ingredients", []))
                if prev_ingredients & set(ingredients_2):
                    results.append(RiskResult(
                        level=RiskLevel(rule["level"]),
                        type=RiskType.CHEMICAL_CONFLICT,
                        title=rule["title"],
                        description=rule["description"],
                        advice=rule["advice"],
                        **self._evidence_fields("rules", rule.get("id", "")),
                    ))
                    break

        return results

    def _check_product_risk(self, product: ProductIdentification) -> RiskResult | None:
        """检查是否匹配已知风险产品库。"""
        product_text = f"{product.brand} {product.name} {product.category}".lower()
        for prod_risk in self._product_risks:
            keyword = prod_risk.get("product_keyword", "").lower()
            if keyword and keyword in product_text:
                # 映射 risk_level 到 RiskLevel 枚举
                level_map = {
                    "critical": RiskLevel.CRITICAL,
                    "high": RiskLevel.CRITICAL,
                    "medium": RiskLevel.MEDIUM,
                    "low": RiskLevel.LOW,
                }
                return RiskResult(
                    level=level_map.get(prod_risk["risk_level"], RiskLevel.LOW),
                    type=RiskType.GENERAL,
                    title=f"{product.name}安全警告",
                    description=prod_risk["description"],
                    advice=prod_risk["advice"],
                    **self._evidence_fields("products", prod_risk.get("id", "")),
                )
        return None

    def _check_single_risk(self, product: ProductIdentification) -> RiskResult | None:
        """检查产品品类的通用风险。"""
        for cat_risk in self._category_risks:
            if cat_risk["category"] in product.category or product.category in cat_risk["category"]:
                level = RiskLevel(cat_risk["default_risk"])
                if level == RiskLevel.SAFE:
                    return None
                return RiskResult(
                    level=level,
                    type=RiskType.GENERAL,
                    title=f"{product.category}注意",
                    description=cat_risk["risk_note"],
                    advice="请仔细阅读产品说明，按推荐方式使用。",
                )
        return None
