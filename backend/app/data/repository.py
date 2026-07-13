"""SQLite 挑战仓储。"""

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock

from app.config import settings
from app.models.challenge import ChallengeState


class ChallengeRepository:
    def __init__(self, database_path: str | None = None):
        configured = Path(database_path or settings.DATABASE_PATH)
        if not configured.is_absolute():
            configured = Path(__file__).parents[2] / configured
        configured.parent.mkdir(parents=True, exist_ok=True)
        self._path = configured
        self._lock = RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS challenges (
                    challenge_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_completed INTEGER NOT NULL,
                    state_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_challenges_updated_at "
                "ON challenges(updated_at DESC)"
            )

    def save(self, state: ChallengeState) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO challenges
                    (challenge_id, created_at, updated_at, is_completed, state_json)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(challenge_id) DO UPDATE SET
                    updated_at=excluded.updated_at,
                    is_completed=excluded.is_completed,
                    state_json=excluded.state_json
                """,
                (
                    state.challenge_id,
                    state.created_at.isoformat(),
                    now,
                    int(state.is_completed),
                    state.model_dump_json(),
                ),
            )
        self.cleanup()

    def get(self, challenge_id: str) -> ChallengeState | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT state_json FROM challenges WHERE challenge_id = ?",
                (challenge_id,),
            ).fetchone()
        return ChallengeState.model_validate_json(row["state_json"]) if row else None

    def list_recent(self, limit: int = 20) -> list[ChallengeState]:
        safe_limit = max(1, min(limit, 100))
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT state_json FROM challenges ORDER BY updated_at DESC LIMIT ?",
                (safe_limit,),
            ).fetchall()
        return [ChallengeState.model_validate_json(row["state_json"]) for row in rows]

    def cleanup(self) -> None:
        cutoff = (
            datetime.now(timezone.utc)
            - timedelta(seconds=settings.CHALLENGE_TTL_SECONDS)
        ).isoformat()
        with self._lock, self._connect() as connection:
            connection.execute(
                "DELETE FROM challenges WHERE is_completed = 0 AND created_at < ?",
                (cutoff,),
            )
            connection.execute(
                """
                DELETE FROM challenges WHERE challenge_id IN (
                    SELECT challenge_id FROM challenges
                    ORDER BY updated_at DESC LIMIT -1 OFFSET ?
                )
                """,
                (settings.MAX_ACTIVE_CHALLENGES,),
            )

    def clear(self) -> None:
        """仅供自动化测试清理隔离数据。"""
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM challenges")
