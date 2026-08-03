"""F3 RecognitionService 测试

覆盖：识别草稿格式、缺失字段、低置信度、观察记录构建。
使用 MockAI 避免 Qwen API 依赖。
"""

import pytest
from app.core.mock_ai import MockAI
from app.services.recognition_service import RecognitionService


@pytest.fixture
def service():
    return RecognitionService(MockAI())


class TestRecognizeProduct:
    """识别产品"""

    @pytest.mark.asyncio
    async def test_returns_draft_with_id(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        assert "draftId" in result
        assert result["draftId"].startswith("draft-")

    @pytest.mark.asyncio
    async def test_returns_observations(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        assert "observations" in result
        assert isinstance(result["observations"], list)

    @pytest.mark.asyncio
    async def test_returns_proposed_product(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        pp = result["proposedProduct"]
        assert "brand" in pp
        assert "name" in pp
        assert "category" in pp
        assert "ingredients" in pp

    @pytest.mark.asyncio
    async def test_returns_created_at(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        assert "createdAt" in result
        assert len(result["createdAt"]) > 0

    @pytest.mark.asyncio
    async def test_returns_missing_required_fields(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        assert "missingRequiredFields" in result
        assert isinstance(result["missingRequiredFields"], list)

    @pytest.mark.asyncio
    async def test_returns_low_confidence_fields(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        assert "lowConfidenceFields" in result
        assert isinstance(result["lowConfidenceFields"], list)

    @pytest.mark.asyncio
    async def test_returns_duplicate_candidates_empty(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        assert result["duplicateCandidates"] == []


class TestProposedProduct:
    """提议产品格式"""

    @pytest.mark.asyncio
    async def test_unknown_brand_becomes_empty(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        # MockAI may return "未知" for brand
        pp = result["proposedProduct"]
        # If brand is "未知", it should be empty string
        if pp["brand"] == "未知":
            assert pp["brand"] == ""  # This shouldn't happen due to conversion
        # The conversion should turn "未知" to ""
        assert pp["brand"] != "未知"

    @pytest.mark.asyncio
    async def test_ingredients_are_list(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        assert isinstance(result["proposedProduct"]["ingredients"], list)


class TestObservations:
    """观察记录"""

    @pytest.mark.asyncio
    async def test_observations_have_field_and_value(self, service):
        result = await service.recognize_product(b"fake-image-bytes")
        for obs in result["observations"]:
            assert "field" in obs
            assert "display_value" in obs
            assert "confidence" in obs
            assert "source" in obs
            assert obs["source"] == "model_observation"
