"""旁白生成服务。"""

from app.core.ai_provider import AIProvider
from app.data.repository import ChallengeRepository
from app.models.report import NarrationResponse
from app.services.challenge_service import ChallengeService


class NarrationService:
    def __init__(self, repository: ChallengeRepository, ai_provider: AIProvider):
        self._ai = ai_provider
        self._challenges = ChallengeService(repository)

    async def generate(
        self, challenge_id: str, current_area: str, scan_count: int
    ) -> NarrationResponse:
        self._challenges.require(challenge_id)
        narrations = await self._ai.generate_narration({
            "challenge_id": challenge_id,
            "current_area": current_area,
            "scan_count": scan_count,
        })
        return NarrationResponse(narrations=narrations)
