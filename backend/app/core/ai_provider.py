"""AI 能力抽象接口。

当前由 MockAI 实现，后期由 QwenAI 实现。
切换方式：修改环境变量 AI_PROVIDER=mock / qwen
"""

from abc import ABC, abstractmethod
from app.models.scan import PanoramaResult, ProductIdentification
from app.models.risk import RiskAssessment
from app.models.report import ReportData
from app.models.assistant import LegacyAssistantDraft
from app.models.knowledge import (
    AssistantNarrativeDraft,
    KnowledgeIntentDraft,
)


class AIProvider(ABC):
    """AI 能力抽象基类。"""

    @abstractmethod
    async def analyze_panorama(self, image_bytes: bytes) -> PanoramaResult:
        """分析全景照，返回需细拍的高风险区域列表。"""
        pass

    @abstractmethod
    async def identify_product(
        self, image_bytes: bytes, scan_index: int = 0
    ) -> ProductIdentification:
        """识别细拍照中的产品信息（品牌、品类、成分表OCR）。"""
        pass

    @abstractmethod
    async def assess_risk(
        self,
        current_product: ProductIdentification,
        scanned_products: list[dict],
    ) -> RiskAssessment:
        """风险评估：单品风险 + 交叉风险（化学品冲突）。"""
        pass

    @abstractmethod
    async def generate_narration(self, context: dict) -> list[str]:
        """生成识别等待期间的趣味旁白。"""
        pass

    @abstractmethod
    async def generate_report(
        self,
        scan_results: list[dict],
        total_mines: int,
        scene_label: str = "当前场景",
    ) -> ReportData:
        """生成最终排雷报告。"""
        pass

    @abstractmethod
    async def answer_household_question(
        self,
        question: str,
        history: list[dict],
        image_bytes: bytes | None,
        inventory_context: list[dict],
        compatibility_context: list[dict],
        context_product_id: str | None = None,
    ) -> LegacyAssistantDraft:
        """[legacy] 回答家庭化学品库内的问题（单次调用，仅用于旧接口兼容）。

        返回 LegacyAssistantDraft。新知识库优先流程不使用本方法，只使用
        extract_knowledge_intent + generate_narrative 两次调用。
        """
        pass

    @abstractmethod
    async def extract_knowledge_intent(
        self,
        question: str,
        history: list[dict],
        image_bytes: bytes | None,
        inventory_context: list[dict],
        compatibility_context: list[dict],
        context_product_id: str | None = None,
    ) -> KnowledgeIntentDraft:
        """调用①：提取知识意图（污渍/材质/场景）。

        只产出意图，不得决定知识条目 ID、产品推荐、安全结论或 outOfScope。
        """
        pass

    @abstractmethod
    async def generate_narrative(
        self,
        context_bundle: dict,
        question: str,
        history: list[dict],
        context_product_id: str | None = None,
    ) -> AssistantNarrativeDraft:
        """调用②：仅接收后端已确认的上下文束，组织最终 answer 文字。

        不得重新生成知识/产品/规则/警告。
        """
        pass
