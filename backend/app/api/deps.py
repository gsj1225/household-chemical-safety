"""依赖注入。"""

from app.config import settings
from app.core.ai_provider import AIProvider
from app.core.mock_ai import MockAI
from app.core.qwen_ai import QwenAI
from app.data.repository import ChallengeRepository


# 单例缓存
_ai_provider_instance: AIProvider | None = None
_challenge_repository_instance: ChallengeRepository | None = None


def get_ai_provider() -> AIProvider:
    """根据配置返回 AI Provider 单例实例。"""
    global _ai_provider_instance
    if _ai_provider_instance is None:
        if settings.AI_PROVIDER == "qwen":
            _ai_provider_instance = QwenAI()
        else:
            _ai_provider_instance = MockAI()
    return _ai_provider_instance


def get_challenge_repository() -> ChallengeRepository:
    global _challenge_repository_instance
    if _challenge_repository_instance is None:
        _challenge_repository_instance = ChallengeRepository()
    return _challenge_repository_instance
