"""扫描识别 HTTP 路由。"""

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import get_ai_provider, get_challenge_repository
from app.core.ai_provider import AIProvider
from app.data.repository import ChallengeRepository
from app.models.scan import (
    IdentificationDraft,
    PanoramaResult,
    ProductConfirmationRequest,
    ScanResult,
)
from app.services.scan_service import ScanService
from app.utils.image import read_validated_image

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("/panorama", response_model=PanoramaResult)
async def scan_panorama(
    image: UploadFile = File(...),
    challenge_id: str = Form(...),
    repository: ChallengeRepository = Depends(get_challenge_repository),
    ai_provider: AIProvider = Depends(get_ai_provider),
):
    image_bytes = await read_validated_image(image)
    return await ScanService(repository, ai_provider).panorama(
        challenge_id, image_bytes
    )


@router.post("/identify", response_model=IdentificationDraft)
async def identify_product(
    image: UploadFile = File(...),
    challenge_id: str = Form(...),
    area_id: str = Form(""),
    repository: ChallengeRepository = Depends(get_challenge_repository),
    ai_provider: AIProvider = Depends(get_ai_provider),
):
    image_bytes = await read_validated_image(image)
    return await ScanService(repository, ai_provider).identify(
        challenge_id, area_id, image_bytes
    )


@router.post("/confirm", response_model=ScanResult)
async def confirm_product(
    confirmation: ProductConfirmationRequest,
    repository: ChallengeRepository = Depends(get_challenge_repository),
    ai_provider: AIProvider = Depends(get_ai_provider),
):
    return await ScanService(repository, ai_provider).confirm(
        confirmation.challenge_id,
        confirmation.draft_id,
        confirmation.product,
    )
