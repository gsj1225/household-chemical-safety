"""风险规则引擎单元测试。"""

import json
from pathlib import Path

from app.core.risk_engine import RiskEngine
from app.models.risk import RiskType
from app.models.scan import IdentificationConfidence, ProductIdentification


def product(name: str, category: str, ingredients: list[str]) -> ProductIdentification:
    return ProductIdentification(
        brand="测试品牌",
        name=name,
        category=category,
        ingredients=ingredients,
        confidence=IdentificationConfidence.HIGH,
    )


def test_safe_product_has_no_mine():
    result = RiskEngine().assess(product("洗衣液", "洗衣液", ["表面活性剂"]), [])
    assert result.has_mine is False
    assert result.risks == []


def test_detects_chemical_conflict_in_either_scan_order():
    cleaner = product("洁厕灵", "洁厕剂", ["盐酸"])
    bleach = product("84消毒液", "含氯消毒剂", ["次氯酸钠"])
    engine = RiskEngine()

    forward = engine.assess(bleach, [cleaner.model_dump()])
    reverse = engine.assess(cleaner, [bleach.model_dump()])

    assert any(risk.type == RiskType.CHEMICAL_CONFLICT for risk in forward.risks)
    assert any(risk.type == RiskType.CHEMICAL_CONFLICT for risk in reverse.risks)


def test_every_rule_and_product_has_valid_evidence_registration():
    data_dir = Path(__file__).parents[1] / "app" / "data"
    rules = json.loads((data_dir / "risk_rules.json").read_text(encoding="utf-8"))
    products = json.loads((data_dir / "product_risks.json").read_text(encoding="utf-8"))
    evidence = json.loads((data_dir / "risk_evidence.json").read_text(encoding="utf-8"))

    assert {item["id"] for item in rules} == set(evidence["rules"])
    assert {item["id"] for item in products} == set(evidence["products"])

    for group in evidence.values():
        for item in group.values():
            assert item["status"] in {"verified", "needs_review"}
            assert item["level"] in {"authoritative", "secondary", "unverified"}
            assert item["reviewed_at"]
            if item["status"] == "verified":
                assert item["level"] != "unverified"
                assert item["sources"]
                for source in item["sources"]:
                    assert source["organization"]
                    assert source["title"]
                    assert source["url"].startswith("https://")


def test_verified_conflict_exposes_authoritative_source():
    cleaner = product("洁厕灵", "洁厕剂", ["盐酸"])
    bleach = product("84消毒液", "含氯消毒剂", ["次氯酸钠"])
    result = RiskEngine().assess(bleach, [cleaner.model_dump()])
    conflict = next(risk for risk in result.risks if risk.type == RiskType.CHEMICAL_CONFLICT)
    assert conflict.evidence_status == "verified"
    assert conflict.evidence_level == "authoritative"
    assert conflict.sources[0].url.startswith("https://www.cdc.gov/")
