"""挑战生命周期服务。"""

import uuid
from datetime import datetime, timezone

from app.core.exceptions import ChallengeNotFoundError
from app.data.repository import ChallengeRepository
from app.models.challenge import ChallengeInfo, ChallengeState


class ChallengeService:
    def __init__(self, repository: ChallengeRepository):
        self._repository = repository

    def start(self) -> ChallengeInfo:
        challenge_id = f"ch-{uuid.uuid4().hex[:12]}"
        state = ChallengeState(
            challenge_id=challenge_id,
            created_at=datetime.now(timezone.utc),
        )
        self._repository.save(state)
        return ChallengeInfo(challenge_id=challenge_id, created_at=state.created_at)

    def require(self, challenge_id: str) -> ChallengeState:
        challenge = self._repository.get(challenge_id)
        if challenge is None:
            raise ChallengeNotFoundError(challenge_id)
        return challenge

    def history(self, limit: int = 20) -> list[ChallengeState]:
        return self._repository.list_recent(limit)
