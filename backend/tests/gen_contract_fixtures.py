"""P0 契约夹具生成 — 验证前后端字段一致性"""

import json
from pathlib import Path

from app.models.inventory import (
    InventoryProduct,
    ProductCategory,
    IdentificationConfidence,
    InformationStatus,
    PartialDate,
    DatePrecision,
    FactSource,
    ConfirmedFact,
)
from app.models.compatibility import (
    CompatibilitySummary,
    CompatibilitySummaryStatus,
    CompatibilityRelation,
    RelationType,
    Severity,
    EvidenceStatus,
    EvidenceSource,
    DuplicateCheckResponse,
    DuplicateCandidate,
)


def build_fixtures():
    # 1. 正常产品
    normal = InventoryProduct(
        productId="p-001",
        name="84消毒液",
        category=ProductCategory.disinfectant,
        brand="某品牌",
        identification_confidence=IdentificationConfidence.high,
        information_status=InformationStatus.complete,
        production_date=PartialDate(
            value="2025-05", precision=DatePrecision.month, source=FactSource.label
        ),
        expiry_date=PartialDate(
            value="2027-05", precision=DatePrecision.month, source=FactSource.label
        ),
        ingredients=[ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)],
    )

    # 2. 未知字段产品
    unknown = InventoryProduct(
        productId="p-002",
        name="强力除霉剂",
        category=ProductCategory.bathroom_cleaner,
        identification_confidence=IdentificationConfidence.low,
        information_status=InformationStatus.needs_information,
        production_date=PartialDate(precision=DatePrecision.unknown),
        expiry_date=PartialDate(precision=DatePrecision.unknown),
    )

    # 3. 疑似重复
    dup = DuplicateCheckResponse(
        candidates=[
            DuplicateCandidate(
                productId="p-001",
                name="84消毒液",
                category="disinfectant",
                brand="某品牌",
                matchReason="品牌+产品名一致",
                matchStrength="strong",
            )
        ],
        hasCandidates=True,
    )

    # 4. 冲突关系
    conflict = CompatibilityRelation(
        relationId="r-001",
        productAId="p-001",
        productBId="p-003",
        relationType=RelationType.do_not_mix,
        severity=Severity.critical,
        title="含氯消毒剂 x 酸性清洁剂",
        rationale="含氯产品与酸性清洁剂混合可能产生有害气体",
        recommendedAction="不要混合使用，更换产品前充分冲洗并保持通风",
        ruleId="RULE-001",
        ruleVersion="1.0",
        evidenceStatus=EvidenceStatus.verified,
        sources=[
            EvidenceSource(
                organization="CDC",
                title="氯气安全指南",
                url=None,
                reviewed_at="2024-01-01",
            )
        ],
    )

    # 5. 无命中摘要
    no_conflict = CompatibilitySummary(
        status=CompatibilitySummaryStatus.no_registered_conflict,
        totalProducts=3,
    )

    return {
        "normal_product": normal.model_dump(by_alias=True),
        "unknown_product": unknown.model_dump(by_alias=True),
        "duplicate_candidates": dup.model_dump(by_alias=True),
        "conflict_relation": conflict.model_dump(by_alias=True),
        "no_conflict_summary": no_conflict.model_dump(by_alias=True),
    }


if __name__ == "__main__":
    fixtures = build_fixtures()
    out = Path(__file__).parent / "contract_fixtures.json"
    out.write_text(json.dumps(fixtures, ensure_ascii=False, indent=2), encoding="utf-8")

    # 验证
    raw = json.dumps(fixtures, ensure_ascii=False)
    assert "safe" not in CompatibilitySummaryStatus.__members__
    assert '"status": "no_registered_conflict"' in raw
    assert "productId" in fixtures["normal_product"]
    assert "draftId" not in fixtures["normal_product"]

    print(f"Fixtures written to {out}")
    print(f"Keys: {list(fixtures.keys())}")
    print("No 'safe' status in enums: OK")
    print("camelCase alias working: OK")
    print("ALL PASSED")
