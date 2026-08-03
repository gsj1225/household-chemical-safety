"""RecognitionService — v2.0 产品识别服务

接收临时上传照片，调用 AI Provider 识别产品信息。
识别结果不是正式事实，用户确认是写库存的门槛。
照片不长期存储，识别完成后丢弃。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.ai_provider import AIProvider
from app.models.inventory import ProductCategory
from app.models.scan import ProductIdentification

# 中文品类别名到枚举值的映射
_CATEGORY_ALIASES: dict[str, str] = {
    "厨房清洁": "kitchen_cleaner",
    "厨房清洁剂": "kitchen_cleaner",
    "浴室清洁": "bathroom_cleaner",
    "浴室清洁剂": "bathroom_cleaner",
    "洁厕": "toilet_cleaner",
    "洁厕剂": "toilet_cleaner",
    "洁厕灵": "toilet_cleaner",
    "除垢": "descaler",
    "除垢剂": "descaler",
    "管道疏通": "drain_cleaner",
    "管道疏通剂": "drain_cleaner",
    "消毒": "disinfectant",
    "消毒液": "disinfectant",
    "消毒剂": "disinfectant",
    "漂白": "bleach",
    "漂白剂": "bleach",
    "漂白水": "bleach",
    "洗衣": "laundry",
    "洗衣液": "laundry",
    "柔顺": "fabric_softener",
    "柔顺剂": "fabric_softener",
    "去渍": "stain_remover",
    "去渍剂": "stain_remover",
    "杀虫": "pesticide",
    "杀虫剂": "pesticide",
    "驱虫": "insect_repellent",
    "驱虫剂": "insect_repellent",
    "其他": "other",
}

_VALID_CATEGORIES = {c.value for c in ProductCategory}


def _normalize_category(raw: str) -> str:
    """将 AI 返回的品类归一化为后端枚举值。"""
    trimmed = (raw or "").strip()
    if not trimmed or trimmed == "未知":
        return ""
    if trimmed in _VALID_CATEGORIES:
        return trimmed
    return _CATEGORY_ALIASES.get(trimmed, "")


class RecognitionService:
    """产品识别服务"""

    def __init__(self, ai_provider: AIProvider):
        self._ai = ai_provider

    async def recognize_product(
        self,
        image_bytes: bytes,
        scan_index: int = 0,
    ) -> dict[str, Any]:
        """识别产品照片，返回 RecognitionDraft 格式的字典

        Args:
            image_bytes: 图片字节数据
            scan_index: 扫描序号（用于多张照片场景）

        Returns:
            包含 draftId、observations、proposedProduct 的字典
        """
        identification = await self._ai.identify_product(image_bytes, scan_index)

        # 将 ProductIdentification 转换为 v2 RecognitionDraft 格式
        draft_id = f"draft-{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()

        observations = self._build_observations(identification)
        proposed_product = self._build_proposed_product(identification)

        # 补拍场景：如果已有日期/储存/危险性信息，也加入观察
        for field_name, value, display in [
            ("production_date", identification.production_date, identification.production_date),
            ("expiry_date", identification.expiry_date, identification.expiry_date),
        ]:
            if value and value != "未知":
                observations.append({
                    "field": field_name,
                    "display_value": value,
                    "confidence": identification.confidence,
                    "source": "model_observation",
                })

        for field_name, items in [
            ("storage_requirements", identification.storage_requirements),
            ("hazard_notes", identification.hazard_notes),
            ("label_warnings", identification.label_warnings),
        ]:
            for item in items:
                observations.append({
                    "field": field_name,
                    "display_value": item,
                    "confidence": identification.confidence,
                    "source": "model_observation",
                })

        return {
            "draftId": draft_id,
            "observations": observations,
            "proposedProduct": proposed_product,
            "missingRequiredFields": self._find_missing_fields(identification),
            "lowConfidenceFields": self._find_low_confidence_fields(identification),
            "duplicateCandidates": [],
            "createdAt": now,
        }

    @staticmethod
    def _build_observations(identification: ProductIdentification) -> list[dict]:
        """将识别结果转为观察记录列表"""
        observations: list[dict] = []

        if identification.brand and identification.brand != "未知":
            observations.append({
                "field": "brand",
                "display_value": identification.brand,
                "confidence": identification.confidence,
                "source": "model_observation",
            })

        if identification.name and identification.name != "未知":
            observations.append({
                "field": "name",
                "display_value": identification.name,
                "confidence": identification.confidence,
                "source": "model_observation",
            })

        if identification.category and identification.category != "未知":
            observations.append({
                "field": "category",
                "display_value": identification.category,
                "confidence": identification.confidence,
                "source": "model_observation",
            })

        for ingredient in identification.ingredients:
            observations.append({
                "field": "ingredients",
                "display_value": ingredient,
                "confidence": identification.confidence,
                "source": "model_observation",
            })

        return observations

    @staticmethod
    def _build_proposed_product(identification: ProductIdentification) -> dict:
        """构建提议的产品表单值"""
        return {
            "brand": identification.brand if identification.brand != "未知" else "",
            "name": identification.name if identification.name != "未知" else "",
            "category": _normalize_category(identification.category),
            "production_date": identification.production_date or "",
            "expiry_date": identification.expiry_date or "",
            "ingredients": list(identification.ingredients),
            "storage_requirements": list(identification.storage_requirements),
            "hazard_notes": list(identification.hazard_notes),
            "label_warnings": list(identification.label_warnings),
        }

    @staticmethod
    def _find_missing_fields(identification: ProductIdentification) -> list[str]:
        """找出缺失的必填字段（品类经过归一化后判断）"""
        missing: list[str] = []
        if not identification.name or identification.name == "未知":
            missing.append("name")
        # 品类归一化后为空字符串表示未识别
        if not _normalize_category(identification.category):
            missing.append("category")
        return missing

    @staticmethod
    def _find_low_confidence_fields(identification: ProductIdentification) -> list[str]:
        """找出低置信度字段"""
        if identification.confidence == "low":
            return ["brand", "name", "category", "ingredients"]
        return []
