"""AssistantService — 家庭化学品助手安全编排层

固定处理顺序：
  校验输入与范围 → 读取库存和相容性关系 → LLM 生成结构化候选
  → 校验 productId 属于库存 → CompatibilityEngine 复核
  → 过滤危险步骤/混用建议 → 组装 AssistantResponse

安全编排规则：
1. 误食/中毒/吸入/身体不适等关键词 → out_of_scope=true，不生成化学操作步骤；
2. 关系为 critical 时强制生成 safetyWarnings，删除任何混合或连续使用步骤；
3. information_status=needs_information 的产品只能返回 needs_information；
4. LLM 返回未知 productId 时丢弃对应字段并追加不确定性说明；
5. generalAdvice 必须标记为非库存建议；
6. 没有库存候选时仍可给有限的通用建议，但必须明确边界。
"""

from __future__ import annotations

from typing import Any

from app.core.ai_provider import AIProvider
from app.core.compatibility_engine import CompatibilityEngine
from app.data.inventory_repository import InventoryRepository
from app.models.assistant import (
    AssistantDraft,
    AssistantProductAdvice,
    AssistantResponse,
    AssistantSafetyWarning,
)
from app.models.compatibility import Severity
from app.models.inventory import InformationStatus, InventoryFilters

_OUT_OF_SCOPE_KEYWORDS = [
    "误食", "中毒", "吸入", "身体不适", "急救", "呕吐", "晕厥", "昏迷", "就医",
]
_MIX_KEYWORDS = ("混", "混合", "一起用", "同时用", "连用")


class AssistantService:
    """助手问答编排服务"""

    def __init__(self, repo: InventoryRepository, engine: CompatibilityEngine):
        self._repo = repo
        self._engine = engine

    def is_out_of_scope(self, question: str) -> bool:
        """判断问题是否涉及意外事故处置（返回 True 则拒答）。"""
        q = question or ""
        return any(k in q for k in _OUT_OF_SCOPE_KEYWORDS)

    async def ask(
        self,
        question: str,
        history: list[dict],
        image_bytes: bytes | None,
        context_product_id: str | None,
        ai_provider: AIProvider,
    ) -> AssistantResponse:
        """执行问答编排，返回安全的结构化回答。"""
        # 1. 范围检查
        if self.is_out_of_scope(question):
            return AssistantResponse(
                answer=(
                    "抱歉，关于误食、中毒、吸入或身体不适等意外情况，"
                    "我无法提供处理建议。请立即联系急救或前往医院。"
                ),
                needs_clarification=False,
                out_of_scope=True,
            )

        # 2. 读取库存和相容性关系
        products, _ = self._repo.list(InventoryFilters(limit=500))
        relations = self._repo.get_all_relations()

        # 3. 构建 LLM 上下文
        inventory_context = [self._product_context(p) for p in products]
        compatibility_context = [self._relation_context(r) for r in relations]

        # 4. LLM 生成结构化候选
        draft = await ai_provider.answer_household_question(
            question=question,
            history=history or [],
            image_bytes=image_bytes,
            inventory_context=inventory_context,
            compatibility_context=compatibility_context,
        )

        # 5-7. 校验、复核、组装
        return self._assemble(draft, products)

    # ── 组装 ──────────────────────────────────────

    def _assemble(
        self, draft: AssistantDraft, products: list[Any]
    ) -> AssistantResponse:
        by_id = {p.id: p for p in products}

        # 5. 校验 productId 属于库存 + needs_information 兜底
        valid_advice: list[AssistantProductAdvice] = []
        dropped_unknown = False
        for adv in draft.product_advice:
            product = by_id.get(adv.product_id)
            if product is None:
                dropped_unknown = True
                continue  # 丢弃 LLM 编造的未知 productId
            a = adv
            if (
                product.information_status == InformationStatus.needs_information
                and a.recommendation == "recommended"
            ):
                a = a.model_copy(update={
                    "recommendation": "needs_information",
                    "steps": [],
                    "cautions": list(a.cautions)
                    + ["成分信息不完整，暂无法确认是否适合使用。"],
                })
            valid_advice.append(a)

        # 6. CompatibilityEngine 复核：critical 关系强制警告 + 剥离混用步骤
        engine_warnings: list[AssistantSafetyWarning] = []
        recommended = [
            a for a in valid_advice if a.recommendation == "recommended"
        ]
        for i in range(len(recommended)):
            for j in range(i + 1, len(recommended)):
                pa = by_id[recommended[i].product_id]
                pb = by_id[recommended[j].product_id]
                if pa is None or pb is None:
                    continue
                pair_relations = self._engine.check_pair(pa, pb)
                for rel in pair_relations:
                    if rel.severity != Severity.critical:
                        continue
                    engine_warnings.append(AssistantSafetyWarning(
                        severity="critical",
                        title=rel.title,
                        description=rel.rationale,
                        relation_id=rel.id,
                        recommended_action=rel.recommended_action,
                    ))
                    for adv in (recommended[i], recommended[j]):
                        adv.steps = [
                            s for s in adv.steps
                            if not any(k in s for k in _MIX_KEYWORDS)
                        ]

        # 合并 LLM 警告 + 引擎警告，按标题去重
        warnings = list(draft.safety_warnings)
        seen_titles = {w.title for w in warnings}
        for w in engine_warnings:
            if w.title not in seen_titles:
                warnings.append(w)
                seen_titles.add(w.title)

        # 证据：来自引擎的 critical 关系标题
        evidence = [w.title for w in engine_warnings]

        answer = draft.answer
        if dropped_unknown:
            answer = (
                answer
                + "（部分提到的产品不在当前库存中，已忽略，仅保留仓库内已有产品的建议。）"
            )

        return AssistantResponse(
            answer=answer,
            needs_clarification=draft.needs_clarification,
            clarification_questions=draft.clarification_questions,
            inventory_advice=valid_advice,
            general_advice=draft.general_advice,
            safety_warnings=warnings,
            out_of_scope=draft.out_of_scope,
            evidence=evidence,
        )

    # ── 上下文构建 ────────────────────────────────

    @staticmethod
    def _product_context(product: Any) -> dict[str, Any]:
        return {
            "productId": product.id,
            "name": product.name,
            "brand": product.brand,
            "category": product.category.value,
            "informationStatus": product.information_status.value,
            "ingredients": [
                f.display_value for f in product.ingredients
            ],
            "hazards": [h.text for h in product.hazards],
            "storageRequirements": [s.text for s in product.storage_requirements],
        }

    @staticmethod
    def _relation_context(relation: dict[str, Any]) -> dict[str, Any]:
        payload = relation.get("payload", {})
        return {
            "relationId": relation.get("relation_id"),
            "productAId": relation.get("product_a_id"),
            "productBId": relation.get("product_b_id"),
            "relationType": relation.get("relation_type"),
            "severity": relation.get("severity"),
            "title": payload.get("title", ""),
            "recommendedAction": payload.get("recommended_action", ""),
        }
