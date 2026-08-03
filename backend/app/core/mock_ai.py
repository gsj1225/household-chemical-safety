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
