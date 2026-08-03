"""补拍字段识别测试 — 验证识别服务返回日期/储存/危险性等字段

P1-2 后端修复：recognition_service 应生成 production_date、expiry_date、
storage_requirements、hazard_notes 的观察记录。
"""

import pytest
from app.core.mock_ai import MockAI
from app.services.recognition_service import RecognitionService


@pytest.fixture
def service():
    return RecognitionService(MockAI())


class TestRecognitionExtendedFields:
    """验证识别结果包含方案承诺的全部字段"""

    @pytest.mark.asyncio
    async def test_mock_returns_extended_fields(self):
        """MockAI 应返回日期、储存、危险性字段"""
        ai = MockAI()
        result = await ai.identify_product(b"fake", scan_index=1)
        assert result.production_date  # 洁厕灵有生产日期
        assert result.expiry_date
        assert len(result.storage_requirements) > 0
        assert len(result.hazard_notes) > 0

    @pytest.mark.asyncio
    async def test_recognition_service_generates_date_observations(self, service):
        """识别服务应为日期生成观察记录"""
        draft = await service.recognize_product(b"fake", scan_index=1)
        observations = draft["observations"]
        fields = [obs["field"] for obs in observations]
        assert "production_date" in fields
        assert "expiry_date" in fields

    @pytest.mark.asyncio
    async def test_recognition_service_generates_storage_observations(self, service):
        """识别服务应为储存条件生成观察记录"""
        draft = await service.recognize_product(b"fake", scan_index=2)
        observations = draft["observations"]
        fields = [obs["field"] for obs in observations]
        assert "storage_requirements" in fields

    @pytest.mark.asyncio
    async def test_recognition_service_generates_hazard_observations(self, service):
        """识别服务应为危险性说明生成观察记录"""
        draft = await service.recognize_product(b"fake", scan_index=2)
        observations = draft["observations"]
        fields = [obs["field"] for obs in observations]
        assert "hazard_notes" in fields

    @pytest.mark.asyncio
    async def test_proposed_product_includes_dates(self, service):
        """proposedProduct 应包含识别出的日期"""
        draft = await service.recognize_product(b"fake", scan_index=0)
        proposed = draft["proposedProduct"]
        assert proposed["production_date"]  # 蓝月亮有日期
        assert proposed["expiry_date"]
        assert proposed["storage_requirements"]  # 有储存条件


class TestQwenExtendedFields:
    """验证 Qwen 提示词输出契约包含新字段"""

    @pytest.mark.asyncio
    async def test_qwen_prompt_mentions_all_fields(self):
        """Qwen identify_product 提示词应包含所有新字段"""
        import inspect
        from app.core.qwen_ai import QwenAI
        source = inspect.getsource(QwenAI.identify_product)
        assert "production_date" in source
        assert "expiry_date" in source
        assert "storage_requirements" in source
        assert "hazard_notes" in source
        assert "label_warnings" in source

    @pytest.mark.asyncio
    async def test_qwen_vision_json_returns_new_fields(self):
        """模拟 Qwen _vision_json 返回新字段，验证 ProductIdentification 解析"""
        from app.core.qwen_ai import QwenAI
        from app.models.scan import ProductIdentification

        # 模拟 _vision_json 返回包含新字段的 JSON
        class FakeQwen(QwenAI):
            async def _vision_json(self, operation, image_bytes, prompt):
                return {
                    "brand": "蓝月亮",
                    "name": "洗衣液",
                    "category": "laundry",
                    "ingredients": ["表面活性剂", "水"],
                    "production_date": "2025-01",
                    "expiry_date": "2027-01",
                    "storage_requirements": ["避光", "阴凉处"],
                    "hazard_notes": ["不可食用"],
                    "label_warnings": ["远离儿童"],
                    "confidence": "high",
                }

        qwen = FakeQwen(client=object())  # 跳过 API key 检查
        result = await qwen.identify_product(b"fake")
        assert isinstance(result, ProductIdentification)
        assert result.production_date == "2025-01"
        assert result.expiry_date == "2027-01"
        assert len(result.storage_requirements) == 2
        assert len(result.hazard_notes) == 1
        assert len(result.label_warnings) == 1

    @pytest.mark.asyncio
    async def test_recognition_service_proposed_product_includes_label_warnings(self):
        """proposedProduct 应包含 label_warnings"""
        service = RecognitionService(MockAI())
        draft = await service.recognize_product(b"fake", scan_index=2)
        proposed = draft["proposedProduct"]
        assert "label_warnings" in proposed


class TestCategoryNormalization:
    """验证品类归一化逻辑"""

    def test_normalize_valid_category(self):
        """合法枚举值直接通过"""
        from app.services.recognition_service import _normalize_category
        assert _normalize_category("disinfectant") == "disinfectant"
        assert _normalize_category("kitchen_cleaner") == "kitchen_cleaner"

    def test_normalize_chinese_alias(self):
        """中文别名映射到枚举值"""
        from app.services.recognition_service import _normalize_category
        assert _normalize_category("消毒液") == "disinfectant"
        assert _normalize_category("漂白水") == "bleach"
        assert _normalize_category("洁厕灵") == "toilet_cleaner"

    def test_normalize_unknown(self):
        """未知或空返回空字符串"""
        from app.services.recognition_service import _normalize_category
        assert _normalize_category("未知") == ""
        assert _normalize_category("") == ""
        assert _normalize_category("随机文字") == ""

    @pytest.mark.asyncio
    async def test_normalize_in_proposed_product(self):
        """proposedProduct 中的 category 经过归一化"""
        service = RecognitionService(MockAI())
        draft = await service.recognize_product(b"fake", scan_index=0)
        # MockAI 返回 "laundry"，应直接通过
        assert draft["proposedProduct"]["category"] == "laundry"

    @pytest.mark.asyncio
    async def test_proposed_product_category_normalized_when_chinese(self):
        """如果 AI 返回中文品类，proposedProduct 应返回归一化后的枚举值"""
        from app.models.scan import ProductIdentification, IdentificationConfidence
        service = RecognitionService(MockAI())

        # 直接调用 _build_proposed_product 测试中文归一化
        identification = ProductIdentification(
            brand="测试",
            name="测试产品",
            category="消毒液",  # 中文
            ingredients=[],
            confidence=IdentificationConfidence.HIGH,
        )
        proposed = service._build_proposed_product(identification)
        assert proposed["category"] == "disinfectant"
