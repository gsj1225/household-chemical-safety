"""趣味旁白 HTTP 路由。"""

from fastapi import APIRouter, Depends

from app.api.deps import get_ai_provider, get_challenge_repository
from app.core.ai_provider import AIProvider
from app.data.repository import ChallengeRepository
from app.models.report import NarrationResponse
from app.services.narration_service import NarrationService

router = APIRouter(prefix="/narration", tags=["narration"])


@router.post("/generate", response_model=NarrationResponse)
async def generate_narration(
    challenge_id: str = "",
    current_area: str = "",
    scan_count: int = 0,
    repository: ChallengeRepository = Depends(get_challenge_repository),
    ai_provider: AIProvider = Depends(get_ai_provider),
):
    return await NarrationService(repository, ai_provider).generate(
        challenge_id, current_area, scan_count
    )
