"""AssistantService — 家庭化学品助手安全编排层（Stage 3 知识库优先）

固定处理顺序：
  输入标准化 → SafetyScopeClassifier（前置，命中即短路）
  → LLM 调用① extract_knowledge_intent（只提取意图）
  → 本地知识库检索 → 权威回填（仅 reviewed 进入 knowledge）
  → 库存候选筛选（类别只筛候选 → 标签/成分/危险性/信息完整性）
  → CompatibilityEngine 复核（critical 最高优先级）
  → knowledgeStatus 状态转换
  → 满足门槛时 LLM 调用② generate_narrative（仅组织 answer）

安全编排规则（沿用 Stage 4 并扩展）：
1. 误食/中毒/吸入/身体不适等 → outOfScope=true，前置短路，不调用任何 LLM/知识库；
2. 知识库 reviewed 才可生成知识步骤；provisional 不进入 knowledge；
3. allowed_product_categories 只筛候选，不能仅凭类别推荐；
4. needs_information 产品只能返回 needs_information；
5. CompatibilityEngine critical 覆盖所有普通建议并剥离混用步骤；
6. LLM 不决定 entry_id、产品推荐、safetyWarnings、outOfScope、知识步骤、比例、接触时间；
7. out_of_scope/no_match/insufficient/external_fail 使用固定模板，不调用调用②。
"""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.core.ai_provider import AIProvider
from app.core.compatibility_engine import CompatibilityEngine
from app.core.knowledge_provider import (
    ExternalKnowledgeProvider,
    ExternalSearchResult,
    LocalKnowledgeProvider,
)
from app.core.safety_scope_classifier import SafetyScopeClassifier
from app.data.inventory_repository import InventoryRepository
from app.data.knowledge_repository import HIT_THRESHOLD, KnowledgeRepository
from app.models.assistant import (
    AssistantProductAdvice,
    AssistantResponse,
    AssistantSafetyWarning,
)
from app.models.compatibility import Severity
from app.models.inventory import InformationStatus, InventoryFilters
from app.models.knowledge import (
    KnowledgeEvidence,
    KnowledgeIntent,
    KnowledgeQuery,
    KnowledgeStatus,
    SourceRef,
)

_MIX_KEYWORDS = ("混", "混合", "一起用", "同时用", "连用")

_OUT_OF_SCOPE_ANSWER = (
    "抱歉，关于误食、中毒、吸入或身体不适等意外情况，"
    "我无法提供处理建议。请立即联系急救或前往医院。"
)
_PROVISIONAL_NOTICE = "存在待审核资料，尚未通过审核，暂不提供操作建议。"

_FIXED_ANSWERS: dict[str, str] = {
    "no_match": "暂无足够依据给出具体建议。你可以补充更多信息，例如污渍类型、材质或使用场景。",
    "insufficient": "现有信息不足，暂无法给出可靠建议。可以补充污渍类型、材质或场景后重试。",
    "external_fail": "暂时无法获取可靠的参考资料，暂不提供操作建议。",
}

# 允许调用调用② 的状态
_NARRATIVE_ALLOWED = {"local_hit", "local_hit_no_inventory", "external_hit"}


class AssistantService:
    """助手问答编排服务（知识库优先）。"""

    def __init__(
        self,
        repo: InventoryRepository,
        engine: CompatibilityEngine,
        classifier: SafetyScopeClassifier | None = None,
        local_provider: LocalKnowledgeProvider | None = None,
        external_provider: ExternalKnowledgeProvider | None = None,
    ):
        self._repo = repo
        self._engine = engine
        self._classifier = classifier or SafetyScopeClassifier()
        self._local = local_provider or LocalKnowledgeProvider()
        self._external = external_provider or ExternalKnowledgeProvider()
        self._kb: KnowledgeRepository = self._local.repository

    # ── 主入口 ─────────────────────────────────────

    async def ask(
        self,
        question: str,
        history: list[dict],
        image_bytes: bytes | None,
        context_product_id: str | None,
        ai_provider: AIProvider,
        allow_external_search: bool = False,
        allow_external_photo_upload: bool = False,
    ) -> AssistantResponse:
        """执行问答编排，返回安全的结构化回答。"""
        # 1. 超范围前置短路（方案 A）：仅文字判定，不调用任何 LLM、不检索知识库；
        #    图片首期只用于污渍/材质/场景识别，不参与事故视觉判定。
        if self._classifier.is_out_of_scope(question):
            return self._out_of_scope_response()

        # 2. 读取库存和相容性关系
        products, _ = self._repo.list(InventoryFilters(limit=500))
        relations = self._repo.get_all_relations()
        by_id = {p.id: p for p in products}
        context_product = by_id.get(context_product_id) if context_product_id else None

        inventory_context = [self._product_context(p) for p in products]
        compatibility_context = [self._relation_context(r) for r in relations]
        focus_ctx = self._focus_product_context(context_product_id, products)
        if focus_ctx:
            inventory_context.append(focus_ctx)

        # 3. 调用① 意图提取（LLM 只产出意图）
        intent_draft = await ai_provider.extract_knowledge_intent(
            question=question,
            history=history or [],
            image_bytes=image_bytes,
            inventory_context=inventory_context,
            compatibility_context=compatibility_context,
            context_product_id=context_product_id,
        )
        intent = intent_draft.knowledge_intent

        # 4. 本地知识库检索
        query = self._build_query(intent)
        local_result = await self._local.search(query)

        # 5. 权威回填（仅 reviewed）
        knowledge_evidence = self._build_knowledge_evidence(local_result)

        # 6. 库存候选筛选 + 引擎复核
        inventory_advice, safety_warnings, engine_evidence = (
            self._build_inventory_and_warnings(knowledge_evidence, products, context_product, by_id)
        )

        # 7. 外部决策
        external_state = await self._external_decision(
            local_result, query, allow_external_search, allow_external_photo_upload
        )

        # 8. 状态转换
        status = self._transition(local_result.local_status, inventory_advice, external_state)
        external_sources = external_state["sources"]

        # 9. 组装 knowledge / sources / notice
        provisional = self._provisional_hint(local_result)
        sources = self._collect_sources(knowledge_evidence, inventory_advice, safety_warnings, external_sources)
        knowledge_models = [e for e in knowledge_evidence]  # already KnowledgeEvidence

        # 10. 回答：满足门槛才调用②，否则固定模板
        if status in _NARRATIVE_ALLOWED:
            bundle = {
                "knowledge": [e.model_dump(by_alias=True) for e in knowledge_models],
                "inventory_advice": [a.model_dump(by_alias=True) for a in inventory_advice],
                "safety_warnings": [w.model_dump(by_alias=True) for w in safety_warnings],
                "external_sources": [s.model_dump(by_alias=True) for s in external_sources],
            }
            narrative = await ai_provider.generate_narrative(
                context_bundle=bundle,
                question=question,
                history=history or [],
                context_product_id=context_product_id,
            )
            answer = narrative.answer or _FIXED_ANSWERS.get(status, "")
        else:
            answer = _FIXED_ANSWERS.get(status, "")

        if context_product is not None:
            answer = answer + f"（已结合当前产品「{context_product.name}」的相容性进行核验。）"

        return AssistantResponse(
            answer=answer,
            needs_clarification=False,
            clarification_questions=[],
            inventory_advice=inventory_advice,
            general_advice=[],
            safety_warnings=safety_warnings,
            out_of_scope=False,
            evidence=engine_evidence,
            knowledge=knowledge_models,
            knowledge_status=status,
            external_sources=external_sources,
            sources=sources,
            pending_knowledge_notice=provisional,
        )

    # ── 辅助 ───────────────────────────────────────

    def _out_of_scope_response(self) -> AssistantResponse:
        return AssistantResponse(
            answer=_OUT_OF_SCOPE_ANSWER,
            needs_clarification=False,
            clarification_questions=[],
            inventory_advice=[],
            general_advice=[],
            safety_warnings=[],
            out_of_scope=True,
            evidence=[],
            knowledge=[],
            knowledge_status="no_match",
            external_sources=[],
            sources=[],
            pending_knowledge_notice="",
        )

    @staticmethod
    def _build_query(intent: KnowledgeIntent | None) -> KnowledgeQuery:
        if intent is None:
            return KnowledgeQuery()
        return KnowledgeQuery(
            topic=intent.topic,
            aliases=list(intent.aliases),
            surface=intent.surface,
            scene=intent.scene,
        )

    def _build_knowledge_evidence(self, local_result) -> list[KnowledgeEvidence]:
        # 仅完整 local_hit 才生成知识步骤与库存候选；
        # insufficient（材质未知/provisional/no_match）不返回可执行步骤，也不生成库存推荐。
        if local_result.local_status != "local_hit":
            return []
        evidence: list[KnowledgeEvidence] = []
        for match in local_result.matches:
            entry = match.entry
            if entry.confidence != "reviewed":
                continue
            if match.score < HIT_THRESHOLD:
                continue
            evidence.append(KnowledgeEvidence(
                entry_id=entry.id,
                topic=entry.topic,
                surfaces=list(entry.surfaces),
                excluded_surfaces=list(entry.excluded_surfaces),
                reviewed_at=entry.reviewed_at,
                steps=entry.ordered_steps(),
                warnings=list(entry.warnings),
                prohibited_actions=list(entry.prohibited_actions),
                stop_conditions=list(entry.stop_conditions),
                tag_condition=entry.tag_condition,
                sources=list(entry.sources),
                confidence="reviewed",
            ))
        return evidence

    @staticmethod
    def _provisional_hint(local_result) -> str:
        """provisional 命中时返回固定文案，不含任何内容。"""
        if local_result.local_status != "insufficient":
            return ""
        for match in local_result.matches:
            if match.entry.confidence == "provisional" and match.score >= HIT_THRESHOLD:
                return _PROVISIONAL_NOTICE
        return ""

    def _build_inventory_and_warnings(
        self,
        knowledge_evidence: list[KnowledgeEvidence],
        products: list[Any],
        context_product: Any,
        by_id: dict[str, Any],
    ) -> tuple[list[AssistantProductAdvice], list[AssistantSafetyWarning], list[str]]:
        allowed: set[str] = set()
        for k in knowledge_evidence:
            entry = self._kb.get(k.entry_id)
            if entry:
                allowed.update(entry.allowed_product_categories)

        # 主适用知识条目（用于标签/危险性核验）
        primary_entry = (
            self._kb.get(knowledge_evidence[0].entry_id) if knowledge_evidence else None
        )
        steps = self._top_knowledge_steps(knowledge_evidence)

        inventory_advice: list[AssistantProductAdvice] = []
        for p in products:
            # allowed_product_categories 仅筛候选，不能仅凭类别推荐
            if p.category.value not in allowed:
                continue
            inventory_advice.append(self._evaluate_candidate(p, primary_entry, steps))

        # 引擎复核：推荐产品两两 + 上下文产品 vs 所有其他
        recommended = [a for a in inventory_advice if a.recommendation == "recommended"]
        pairs: list[tuple[Any, Any]] = []
        for i in range(len(recommended)):
            for j in range(i + 1, len(recommended)):
                pairs.append((by_id[recommended[i].product_id], by_id[recommended[j].product_id]))
        if context_product is not None:
            for other in products:
                if other.id != context_product.id:
                    pairs.append((context_product, other))

        engine_warnings, evidence = self._check_critical_pairs(pairs, inventory_advice, by_id)

        # 知识条目警告 → safetyWarnings（attention 级别）
        warnings: list[AssistantSafetyWarning] = []
        seen_titles: set[str] = set()
        for k in knowledge_evidence:
            for text in k.warnings + k.prohibited_actions + k.stop_conditions:
                if text in seen_titles:
                    continue
                seen_titles.add(text)
                warnings.append(AssistantSafetyWarning(
                    severity="attention",
                    title=text,
                    description=text,
                    relation_id=None,
                    recommended_action=text,
                ))
        for w in engine_warnings:
            if w.title not in seen_titles:
                warnings.append(w)
                seen_titles.add(w.title)

        return inventory_advice, warnings, evidence

    def _evaluate_candidate(
        self,
        product: Any,
        entry: Any | None,
        steps: list[str],
    ) -> AssistantProductAdvice:
        """对候选产品做完整确定性安全核验，返回推荐结论。

        判定链（P1-1）：
          1. information_status 必须 complete
          2. 必须有可核验的产品标签或成分
          3. 知识条目适用条件（excluded_surfaces / tag_condition）与产品信息匹配
          4. 产品成分/标签/危害不得违反知识条目的 prohibited_actions / warnings / forbidden_terms
          5. CompatibilityEngine 在外部统一复核
          6. 全部通过才 recommended；否则 needs_information / not_recommended。

        不使用 LLM 的 product_advice 作为安全结论；不因类别匹配即推荐。
        """
        base = AssistantProductAdvice(
            product_id=product.id,
            product_name=product.name,
            recommendation="recommended",
            reason="",
            steps=list(steps),
            cautions=[],
        )

        ingredients = [f.display_value for f in product.ingredients]
        labels = [f.display_value for f in product.label_warnings]
        hazards = [h.text for h in product.hazards]
        product_text = " ".join(ingredients + labels + hazards)

        # 1. 信息完整性
        if product.information_status != InformationStatus.complete:
            return base.model_copy(update={
                "recommendation": "needs_information",
                "reason": "成分信息不完整，暂无法确认是否适合使用。",
                "steps": [],
                "cautions": ["成分信息不完整，暂无法确认是否适合使用。"],
            })

        # 2. 必须有可核验的产品标签或成分
        if not (ingredients or labels or hazards):
            return base.model_copy(update={
                "recommendation": "needs_information",
                "reason": "缺少可核验的产品标签或成分信息，无法判断适用性。",
                "steps": [],
                "cautions": ["缺少可核验的产品标签或成分信息，无法判断适用性。"],
            })

        # 3. 知识条目适用条件匹配：排除材质命中 → 标签明确不适用
        if entry is not None:
            for ex in entry.excluded_surfaces:
                if ex and ex in product_text:
                    return base.model_copy(update={
                        "recommendation": "not_recommended",
                        "reason": f"产品明确不适用于该材质：{ex}",
                        "steps": [],
                        "cautions": [f"产品明确不适用于该材质：{ex}"],
                    })

        # 4. 危险性/成分/标签冲突检查（确定性）
        conflict = self._find_product_conflict(entry, product_text)
        if conflict:
            return base.model_copy(update={
                "recommendation": "not_recommended",
                "reason": f"产品成分/危害与知识禁用条件冲突：{conflict}",
                "steps": [],
                "cautions": [f"产品成分/危害与知识禁用条件冲突：{conflict}"],
            })

        # 5. CompatibilityEngine 在外部统一复核；6. 全部通过 → recommended
        return base.model_copy(update={
            "reason": "该产品类别适用，且已通过成分、标签与安全性核验。",
            "steps": list(steps),
            "cautions": [],
        })

    def _find_product_conflict(self, entry: Any | None, product_text: str) -> str | None:
        """返回首个与知识条目冲突的禁用条件，无冲突则 None。"""
        if entry is None:
            return None
        # 结构化禁用词（确定性，优先）
        for term in entry.forbidden_terms:
            if term and term in product_text:
                return term
        # 知识条目自由文本禁用条件：产品文本包含完整禁止短语（含 tag_condition）
        for phrase in list(entry.prohibited_actions) + list(entry.warnings) + [entry.tag_condition]:
            if phrase and len(phrase) >= 2 and phrase in product_text:
                return phrase
        return None

    @staticmethod
    def _top_knowledge_steps(knowledge_evidence: list[KnowledgeEvidence]) -> list[str]:
        if not knowledge_evidence:
            return []
        return list(knowledge_evidence[0].steps)

    async def _external_decision(
        self,
        local_result,
        query: KnowledgeQuery,
        allow_external_search: bool,
        allow_external_photo_upload: bool,
    ) -> dict[str, Any]:
        """外部检索决策：返回 {attempted, failed, sources}。"""
        sources: list[SourceRef] = []
        attempted = False
        failed = False

        # P2-1：图片不会发送给外部 Provider。
        # 首期 ExternalKnowledgeProvider 只接收结构化 KnowledgeQuery，不接收 image_bytes；
        # 图片仅用于污渍/材质/场景识别。allowExternalPhotoUpload 字段为未来扩展预留。
        if local_result.local_status in ("insufficient", "no_match"):
            eligible = (
                allow_external_search
                and settings.EXTERNAL_KNOWLEDGE_ENABLED
            )
            if eligible:
                attempted = True
                try:
                    result: ExternalSearchResult = await self._external.search(query)
                    if result.failed:
                        failed = True
                    else:
                        sources = self._external.filter_allowed(result.sources)
                        if not sources:
                            failed = True
                except Exception:
                    failed = True

        return {"attempted": attempted, "failed": failed, "sources": sources}

    @staticmethod
    def _transition(
        local_status: str,
        inventory_advice: list[AssistantProductAdvice],
        external_state: dict[str, Any],
    ) -> KnowledgeStatus:
        """确定性状态转换。"""
        has_safe = any(a.recommendation == "recommended" for a in inventory_advice)

        if local_status == "local_hit":
            return "local_hit" if has_safe else "local_hit_no_inventory"

        # insufficient / no_match
        if external_state["attempted"]:
            if external_state["failed"]:
                return "external_fail"
            if external_state["sources"]:
                return "external_hit"
            return "no_match"
        return "insufficient" if local_status == "insufficient" else "no_match"

    def _collect_sources(
        self,
        knowledge_evidence: list[KnowledgeEvidence],
        inventory_advice: list[AssistantProductAdvice],
        safety_warnings: list[AssistantSafetyWarning],
        external_sources: list[SourceRef],
    ) -> list[SourceRef]:
        sources: list[SourceRef] = []
        seen: set[tuple[str, str]] = set()

        def _add(s: SourceRef):
            key = (s.type, s.ref)
            if key in seen:
                return
            seen.add(key)
            sources.append(s)

        # 知识库来源
        for k in knowledge_evidence:
            for s in k.sources:
                _add(s)
        # 我的仓库来源
        for a in inventory_advice:
            _add(SourceRef(type="warehouse", title=a.product_name, ref=a.product_id))
        # 安全规则来源
        for w in safety_warnings:
            if w.relation_id:
                _add(SourceRef(type="rule", title=w.title, ref=w.relation_id))
        # 外部来源
        for s in external_sources:
            _add(s)

        # 固定展示顺序
        order = {"local_kb": 0, "warehouse": 1, "rule": 2, "external": 3}
        sources.sort(key=lambda s: order.get(s.type, 9))
        return sources

    def _check_critical_pairs(
        self,
        pairs: list[tuple[Any, Any]],
        valid_advice: list[AssistantProductAdvice],
        by_id: dict[str, Any],
    ) -> tuple[list[AssistantSafetyWarning], list[str]]:
        engine_warnings: list[AssistantSafetyWarning] = []
        for pa, pb in pairs:
            if pa is None or pb is None:
                continue
            for rel in self._engine.check_pair(pa, pb):
                if rel.severity != Severity.critical:
                    continue
                engine_warnings.append(AssistantSafetyWarning(
                    severity="critical",
                    title=rel.title,
                    description=rel.rationale,
                    relation_id=rel.id,
                    recommended_action=rel.recommended_action,
                ))
                for pid in (pa.id, pb.id):
                    for adv in valid_advice:
                        if adv.product_id == pid:
                            adv.steps = [
                                s for s in adv.steps
                                if not any(k in s for k in _MIX_KEYWORDS)
                            ]
        evidence = [w.title for w in engine_warnings]
        return engine_warnings, evidence

    # ── 上下文构建 ────────────────────────────────

    @staticmethod
    def _product_context(product: Any) -> dict[str, Any]:
        return {
            "productId": product.id,
            "name": product.name,
            "brand": product.brand,
            "category": product.category.value,
            "informationStatus": product.information_status.value,
            "ingredients": [f.display_value for f in product.ingredients],
            "hazards": [h.text for h in product.hazards],
            "storageRequirements": [s.text for s in product.storage_requirements],
        }

    @staticmethod
    def _focus_product_context(context_product_id: str | None, products: list[Any]) -> dict[str, Any] | None:
        if not context_product_id:
            return None
        for p in products:
            if p.id == context_product_id:
                ctx = AssistantService._product_context(p)
                ctx["focusProduct"] = True
                return ctx
        return None

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
