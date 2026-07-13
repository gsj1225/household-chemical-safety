"""报告生成服务。"""

from app.core.ai_provider import AIProvider
from app.data.repository import ChallengeRepository
from app.models.report import ReportData
from app.services.challenge_service import ChallengeService


class ReportService:
    def __init__(self, repository: ChallengeRepository, ai_provider: AIProvider):
        self._repository = repository
        self._ai = ai_provider
        self._challenges = ChallengeService(repository)

    async def generate(self, challenge_id: str) -> ReportData:
        challenge = self._challenges.require(challenge_id)
        if challenge.report is not None:
            return ReportData.model_validate(challenge.report)
        report = await self._ai.generate_report(
            challenge.scan_results, challenge.total_mines
        )
        challenge.report = report.model_dump(mode="json")
        challenge.is_completed = True
        self._repository.save(challenge)
        return report
