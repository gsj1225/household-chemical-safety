"""扫描识别、用户确认与风险评估编排。"""

import uuid

from app.config import settings
from app.core.ai_provider import AIProvider
from app.core.exceptions import (
    ChallengeCompletedError,
    IdentificationDraftNotFoundError,
    PanoramaReplacementNotAllowedError,
    ScanLimitExceededError,
)
from app.data.repository import ChallengeRepository
from app.models.risk import RiskType
from app.models.scan import (
    IdentificationConfidence,
    IdentificationDraft,
    PanoramaResult,
    ProductIdentification,
    ScanResult,
    ScanStatus,
)
from app.services.challenge_service import ChallengeService


class ScanService:
    def __init__(self, repository: ChallengeRepository, ai_provider: AIProvider):
        self._repository = repository
        self._ai = ai_provider
        self._challenges = ChallengeService(repository)

    async def panorama(self, challenge_id: str, image_bytes: bytes) -> PanoramaResult:
        challenge = self._challenges.require(challenge_id)
        self._ensure_active(challenge.is_completed)
        if challenge.scan_results:
            raise PanoramaReplacementNotAllowedError()
        result = await self._ai.analyze_panorama(image_bytes)
        challenge.scene_label = result.scene_label
        challenge.panorama_areas = [
            area.model_dump(mode="json") for area in result.areas
        ]
        challenge.pending_identifications = {}
        self._repository.save(challenge)
        return result

    async def identify(
        self, challenge_id: str, area_id: str, image_bytes: bytes
    ) -> IdentificationDraft:
        challenge = self._challenges.require(challenge_id)
        self._ensure_active(challenge.is_completed)
        self._ensure_quota(len(challenge.scan_results))

        product = await self._ai.identify_product(
            image_bytes, challenge.mock_scan_index
        )
        critical_unknown = any(
            value.strip() in {"", "未知"}
            for value in (product.name, product.category)
        )
        requires_review = (
            product.confidence != IdentificationConfidence.HIGH
            or critical_unknown
            or not product.ingredients
        )
        draft = IdentificationDraft(
            challenge_id=challenge_id,
            area_id=area_id,
            product=product,
            requires_review=requires_review,
            guide_message=(
                "识别信息不完整，请核对包装或重新拍摄。"
                if requires_review else "请核对识别结果，确认后再进行风险评估。"
            ),
        )

        challenge.pending_identifications = {
            draft_id: data
            for draft_id, data in challenge.pending_identifications.items()
            if data.get("area_id") != area_id
        }
        challenge.pending_identifications[draft.draft_id] = draft.model_dump(mode="json")
        self._repository.save(challenge)
        return draft

    async def confirm(
        self,
        challenge_id: str,
        draft_id: str,
        product: ProductIdentification,
    ) -> ScanResult:
        challenge = self._challenges.require(challenge_id)
        self._ensure_active(challenge.is_completed)
        self._ensure_quota(len(challenge.scan_results))
        draft_data = challenge.pending_identifications.get(draft_id)
        if draft_data is None:
            raise IdentificationDraftNotFoundError()

        draft = IdentificationDraft.model_validate(draft_data)
        assessment = await self._ai.assess_risk(product, challenge.scanned_products)
        risk_result = None
        if assessment.has_mine:
            conflicts = [
                risk for risk in assessment.risks
                if risk.type == RiskType.CHEMICAL_CONFLICT
            ]
            risk_result = conflicts[0] if conflicts else assessment.risks[0]
            status = ScanStatus.MINE
            guide = f"这是今天的第{challenge.total_mines + 1}个雷。继续，看看还有没有别的。"
        else:
            status = ScanStatus.SAFE
            guide = "未命中当前规则库中的风险，继续检查下一个。"

        product_record = {
            "brand": product.brand,
            "name": product.name,
            "category": product.category,
            "ingredients": product.ingredients,
            "confidence": product.confidence.value,
            "confirmed_by_user": True,
        }
        scan_id = f"scan-{uuid.uuid4().hex[:12]}"
        challenge.scanned_products.append(product_record)
        challenge.scan_results.append({
            "scan_id": scan_id,
            "status": status.value,
            "product_name": f"{product.brand} {product.name}",
            "product": product_record,
            "risk": risk_result.model_dump(mode="json") if risk_result else None,
            "confirmed_by_user": True,
        })
        challenge.pending_identifications.pop(draft_id, None)
        challenge.mock_scan_index += 1
        if assessment.has_mine:
            challenge.total_mines += 1
        self._repository.save(challenge)

        return ScanResult(
            scan_id=scan_id,
            challenge_id=challenge_id,
            area_id=draft.area_id,
            status=status,
            product=product,
            risk=risk_result,
            guide_message=guide,
            confirmed_by_user=True,
        )

    @staticmethod
    def _ensure_active(is_completed: bool) -> None:
        if is_completed:
            raise ChallengeCompletedError()

    @staticmethod
    def _ensure_quota(scan_count: int) -> None:
        if scan_count >= settings.MAX_SCANS_PER_CHALLENGE:
            raise ScanLimitExceededError()
