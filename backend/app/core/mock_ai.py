"""Mock AI 实现。

返回预设的合理数据，确保前端可以完整走通全流程。
后期替换为 QwenAI 后，只需修改环境变量 AI_PROVIDER=qwen。
"""

import random
import json
from pathlib import Path

from app.core.ai_provider import AIProvider
from app.models.scan import (
    PanoramaResult, PanoramaArea, ProductIdentification,
    IdentificationConfidence,
)
from app.models.risk import RiskAssessment
from app.models.report import ReportData
from app.models.assistant import (
    LegacyAssistantDraft,
    AssistantProductAdvice,
    AssistantSafetyWarning,
)
from app.models.knowledge import (
    AssistantNarrativeDraft,
    KnowledgeIntent,
    KnowledgeIntentDraft,
)
from app.core.risk_engine import RiskEngine
from app.utils.reporting import build_report

# 数据文件路径
DATA_DIR = Path(__file__).parent.parent / "data"


def _load_json(filename: str) -> dict | list:
    """加载 JSON 数据文件"""
    with open(DATA_DIR / filename, "r", encoding="utf-8") as f:
        return json.load(f)


# 预设产品库（Mock用）
# 顺序设计为演示递进：安全 → 单品风险 → 交叉风险(critical)
_MOCK_PRODUCTS = [
    {
        "brand": "蓝月亮",
        "name": "亮白增艳洗衣液",
        "category": "洗衣液",
        "ingredients": ["表面活性剂", "增白剂", "香精"],
        "confidence": "high",
        "production_date": "2025-03",
        "expiry_date": "2028-03",
        "storage_requirements": ["避光阴凉"],
        "hazard_notes": ["不可食用"],
        "label_warnings": [],
    },
    {
        "brand": "威猛先生",
        "name": "洁厕灵",
        "category": "洁厕剂",
        "ingredients": ["盐酸"],
        "confidence": "high",
        "production_date": "2025-01",
        "expiry_date": "2027-06",
        "storage_requirements": ["远离儿童"],
        "hazard_notes": ["腐蚀性", "不可混用漂白剂"],
        "label_warnings": ["不可吞食"],
    },
    {
        "brand": "84",
        "name": "消毒液",
        "category": "含氯消毒剂",
        "ingredients": ["次氯酸钠"],
        "confidence": "high",
        "production_date": "2025-02",
        "expiry_date": "2027-02",
        "storage_requirements": ["避光", "远离儿童"],
        "hazard_notes": ["腐蚀性", "不可混用酸性产品"],
        "label_warnings": ["不可与洁厕灵混用"],
    },
    {
        "brand": "雷达",
        "name": "驱蚊液",
        "category": "驱蚊液",
        "ingredients": ["避蚊胺", "DEET", "乙醇"],
        "confidence": "high",
        "production_date": "",
        "expiry_date": "2027-12",
        "storage_requirements": [],
        "hazard_notes": ["易燃"],
        "label_warnings": [],
    },
    {
        "brand": "立白",
        "name": "洗洁精",
        "category": "洗洁精",
        "ingredients": ["表面活性剂", "椰油酰胺"],
        "confidence": "high",
        "production_date": "2025-05",
        "expiry_date": "2028-05",
        "storage_requirements": ["常温保存"],
        "hazard_notes": [],
        "label_warnings": [],
    },
]


class MockAI(AIProvider):
    """Mock AI 实现，返回预设数据。"""

    def __init__(self):
        self._risk_engine = RiskEngine()

    async def analyze_panorama(self, image_bytes: bytes) -> PanoramaResult:
        """返回预设的全景分析结果——3个区域。"""
        areas = [
            PanoramaArea(
                description="右侧水槽下方柜子",
                items_hint="多瓶液体容器",
                risk_level="high",
                guide_message="右边柜子下面有好几个瓶子，靠近拍一下最前面那个。",
                bbox_2d=(560, 480, 900, 920),
            ),
            PanoramaArea(
                description="左侧台面",
                items_hint="喷雾罐",
                risk_level="medium",
                guide_message="台面上那个喷雾也拍一下，看着像驱蚊液。",
                bbox_2d=(80, 160, 350, 520),
            ),
            PanoramaArea(
                description="墙角架子",
                items_hint="洗衣液瓶",
                risk_level="low",
                guide_message="墙角那瓶大的也拍一下，应该是洗衣液。",
                bbox_2d=(690, 120, 930, 460),
            ),
        ]
        return PanoramaResult(
            scene_label="厨房水槽场景",
            areas=areas,
            guide_message="我看到了3个需要检查的区域，我们逐个靠近拍一下。",
        )

    async def identify_product(
        self, image_bytes: bytes, scan_index: int = 0
    ) -> ProductIdentification:
        """轮换返回预设产品，确保能触发交叉风险。"""
        product_data = _MOCK_PRODUCTS[scan_index % len(_MOCK_PRODUCTS)]
        return ProductIdentification(
            brand=product_data["brand"],
            name=product_data["name"],
            category=product_data["category"],
            ingredients=product_data["ingredients"],
            production_date=product_data.get("production_date", ""),
            expiry_date=product_data.get("expiry_date", ""),
            storage_requirements=product_data.get("storage_requirements", []),
            hazard_notes=product_data.get("hazard_notes", []),
            label_warnings=product_data.get("label_warnings", []),
            confidence=IdentificationConfidence(product_data["confidence"]),
        )

    async def assess_risk(
        self,
        current_product: ProductIdentification,
        scanned_products: list[dict],
    ) -> RiskAssessment:
        """使用风险评估引擎进行评估。"""
        return self._risk_engine.assess(current_product, scanned_products)

    async def generate_narration(self, context: dict) -> list[str]:
        """从模板中随机选取趣味旁白。"""
        templates = _load_json("narration_templates.json")
        start_pool = templates.get("start", ["让我看看这是什么……"])
        analyzing_pool = templates.get("analyzing", ["这个成分表字也太小了吧……"])
        found_pool = templates.get("found_something", ["叮！找到了。"])

        narrations = [
            random.choice(start_pool),
            random.choice(analyzing_pool),
            random.choice(found_pool),
        ]
        return narrations

    async def generate_report(
        self,
        scan_results: list[dict],
        total_mines: int,
        scene_label: str = "当前场景",
    ) -> ReportData:
        """使用确定性逻辑生成排雷报告。"""
        return build_report(scan_results, total_mines, scene_label)

    async def answer_household_question(
        self,
        question: str,
        history: list[dict],
        image_bytes: bytes | None,
        inventory_context: list[dict],
        compatibility_context: list[dict],
        context_product_id: str | None = None,
    ) -> LegacyAssistantDraft:
        """[legacy] Mock 回答：旧接口兼容，新知识库流程不调用。"""
        q = question or ""
        products = {p.get("productId"): p for p in inventory_context}
        focus = (
            next((p for p in inventory_context if p.get("productId") == context_product_id), None)
            if context_product_id else None
        )

        # 1. 超范围：误食/中毒/吸入/身体不适等
        out_keywords = ["误食", "中毒", "吸入", "身体不适", "急救", "呕吐", "晕厥"]
        if any(k in q for k in out_keywords):
            return LegacyAssistantDraft(
                answer="抱歉，关于误食、中毒或身体不适等意外情况，我无法提供处理建议。请立即联系急救或前往医院。",
                out_of_scope=True,
            )

        # 2. 需要追问：信息不足
        clarify_keywords = ["什么", "怎么区分", "不确定", "哪个"]
        if any(k in q for k in clarify_keywords):
            return LegacyAssistantDraft(
                answer="我需要更多信息来给出准确建议，可以先回答下面几个问题。",
                needs_clarification=True,
                clarification_questions=[
                    "你主要想处理什么场景？",
                    "产品标签上还有哪些成分信息？",
                ],
            )

        # 3. 混用场景：推荐洁厕+消毒（让服务层用引擎复核并剥离混用步骤）
        mixing = ("混" in q) or ("一起用" in q) or ("同时用" in q)
        advice = []
        warnings = []
        if focus:
            answer_prefix = f"已结合你家仓库中的「{focus.get('name','')}」来回答："
        else:
            answer_prefix = "根据你家的库存，我给出了下面的建议。"
        if mixing:
            for pid, p in products.items():
                name = p.get("name", "")
                if "洁厕" in name or "盐酸" in str(p.get("category", "")):
                    advice.append(AssistantProductAdvice(
                        product_id=pid,
                        recommendation="recommended",
                        reason="用于清洁马桶",
                        steps=["倒入洁厕剂", "与消毒液混合使用"],
                        cautions=["佩戴手套"],
                    ))
                elif "消毒" in name or "84" in name:
                    advice.append(AssistantProductAdvice(
                        product_id=pid,
                        recommendation="recommended",
                        reason="用于消毒",
                        steps=["稀释后擦拭表面", "与洁厕剂混合使用"],
                        cautions=["通风"],
                    ))
            warnings.append(AssistantSafetyWarning(
                severity="critical",
                title="禁止混用",
                description="洁厕剂与含氯消毒剂混合会产生有毒氯气。",
                recommended_action="请勿混合使用，分开清洁。",
            ))
        else:
            # 4. 常规推荐：挑选一个非消毒剂产品
            recommended = []
            for pid, p in products.items():
                name = p.get("name", "")
                if "消毒" in name or "84" in name:
                    continue
                recommended.append(pid)
                if len(recommended) >= 1:
                    break
            for pid in recommended:
                p = products[pid]
                advice.append(AssistantProductAdvice(
                    product_id=pid,
                    recommendation="recommended",
                    reason="{}适合用于当前清洁需求".format(p.get("name", "该产品")),
                    steps=["佩戴手套", "按标签比例稀释使用"],
                    cautions=["避免接触眼睛"],
                ))

        return LegacyAssistantDraft(
            answer=answer_prefix,
            product_advice=advice,
            general_advice=["通用建议：使用前请阅读产品标签，注意通风。"],
            safety_warnings=warnings,
        )

    # ── 两次 LLM 调用（知识库优先）────────────────────

    # 关键词 → 标准别名（与知识库条目 aliases 对齐）
    _KEYWORD_ALIASES: list[tuple[str, list[str]]] = [
        ("油污", ["油污", "油渍"]), ("油渍", ["油污", "油渍"]), ("机油", ["油污", "油渍"]),
        ("血", ["血渍", "蛋白污渍"]), ("奶", ["奶渍", "蛋白污渍"]), ("蛋", ["蛋渍", "蛋白污渍"]),
        ("咖啡", ["咖啡渍", "咖啡"]), ("茶", ["茶渍", "茶"]),
        ("墨水", ["墨水", "墨水渍"]), ("圆珠笔", ["圆珠笔渍"]),
        ("口红", ["口红渍"]), ("粉底", ["粉底渍"]), ("化妆品", ["化妆品"]), ("彩妆", ["彩妆"]),
        ("胶带", ["胶渍", "胶带残留"]), ("贴纸", ["胶渍", "贴纸残留"]), ("胶渍", ["胶渍"]),
        ("水垢", ["水垢", "皂垢"]), ("皂垢", ["水垢", "皂垢"]),
        ("马桶", ["马桶", "水垢", "皂垢"]), ("水龙头", ["水龙头", "水垢", "皂垢"]),
        ("霉斑", ["霉斑", "霉菌", "发霉"]), ("霉菌", ["霉斑", "霉菌", "发霉"]), ("发霉", ["霉斑", "霉菌", "发霉"]),
        ("铁锈", ["铁锈", "锈渍"]), ("锈渍", ["铁锈", "锈渍"]),
        ("厨房台面", ["厨房台面"]), ("台面", ["厨房台面"]), ("玻璃", ["玻璃"]), ("瓷砖", ["瓷砖"]),
    ]

    async def extract_knowledge_intent(
        self,
        question: str,
        history: list[dict],
        image_bytes: bytes | None,
        inventory_context: list[dict],
        compatibility_context: list[dict],
        context_product_id: str | None = None,
    ) -> KnowledgeIntentDraft:
        """Mock 调用①：按关键词提取意图别名，不决定 entry_id/产品/结论。"""
        q = question or ""
        aliases: list[str] = []
        for kw, al in self._KEYWORD_ALIASES:
            if kw in q:
                for a in al:
                    if a not in aliases:
                        aliases.append(a)
        if not aliases:
            return KnowledgeIntentDraft()
        return KnowledgeIntentDraft(knowledge_intent=KnowledgeIntent(aliases=aliases))

    async def generate_narrative(
        self,
        context_bundle: dict,
        question: str,
        history: list[dict],
        context_product_id: str | None = None,
    ) -> AssistantNarrativeDraft:
        """Mock 调用②：仅依据后端已确认的上下文束组织 answer。"""
        lines = []
        kb = context_bundle.get("knowledge", [])
        inv = context_bundle.get("inventory_advice", [])
        warnings = context_bundle.get("safety_warnings", [])
        if kb:
            lines.append(f"根据知识库，针对「{kb[0].get('topic','')}」可按以下步骤处理。")
        if inv:
            names = "、".join(a.get("productName") for a in inv[:3])
            lines.append(f"结合你家仓库，可考虑使用：{names}。")
        elif kb:
            lines.append("你家的库存中暂无通过安全校验的适用产品。")
        if warnings:
            lines.append("请注意查看下方的安全提醒。")
        if not lines:
            lines.append("暂无足够依据给出具体建议。")
        return AssistantNarrativeDraft(answer="".join(lines))
