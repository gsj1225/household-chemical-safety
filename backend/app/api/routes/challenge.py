"""挑战相关 HTTP 路由。"""

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_ai_provider, get_challenge_repository
from app.core.ai_provider import AIProvider
from app.data.repository import ChallengeRepository
from app.models.challenge import ChallengeHistoryItem, ChallengeInfo
from app.models.report import ReportData
from app.services.challenge_service import ChallengeService
from app.services.report_service import ReportService

router = APIRouter(prefix="/challenge", tags=["challenge"])


@router.post("/start", response_model=ChallengeInfo)
async def start_challenge(
    repository: ChallengeRepository = Depends(get_challenge_repository),
):
    return ChallengeService(repository).start()


@router.post("/result", response_model=ReportData)
async def get_result(
    challenge_id: str,
    repository: ChallengeRepository = Depends(get_challenge_repository),
    ai_provider: AIProvider = Depends(get_ai_provider),
):
    return await ReportService(repository, ai_provider).generate(challenge_id)


@router.get("/history", response_model=list[ChallengeHistoryItem])
async def get_history(
    limit: int = Query(default=20, ge=1, le=100),
    repository: ChallengeRepository = Depends(get_challenge_repository),
):
    states = ChallengeService(repository).history(limit)
    return [
        ChallengeHistoryItem(
            challenge_id=state.challenge_id,
            created_at=state.created_at,
            total_mines=state.total_mines,
            is_completed=state.is_completed,
            score=state.report.get("score") if state.report else None,
            scene_label=state.scene_label or "历史场景",
        )
        for state in states
    ]
