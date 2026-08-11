"""AI 能力抽象接口。

当前由 MockAI 实现，后期由 QwenAI 实现。
切换方式：修改环境变量 AI_PROVIDER=mock / qwen
"""

from abc import ABC, abstractmethod
from app.models.scan import PanoramaResult, ProductIdentification
from app.models.risk import RiskAssessment
from app.models.report import ReportData
from app.models.assistant import AssistantDraft


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
    ) -> AssistantDraft:
        """回答家庭化学品库内的问题。

        返回结构化候选（AssistantDraft），只允许引用传入的 productId。
        输出仅视为候选回答，不能直接作为安全结论；由 AssistantService 校验。
        """
        pass
