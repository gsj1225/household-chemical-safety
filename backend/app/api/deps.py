"""依赖注入。"""

from app.config import settings
from app.core.ai_provider import AIProvider
from app.core.compatibility_engine import CompatibilityEngine
from app.core.mock_ai import MockAI
from app.core.qwen_ai import QwenAI
from app.data.inventory_repository import InventoryRepository
from app.data.repository import ChallengeRepository
from app.services.compatibility_service import CompatibilityService
from app.services.inventory_service import InventoryService
from app.services.assistant_service import AssistantService

# 单例缓存
_ai_provider_instance: AIProvider | None = None
_challenge_repository_instance: ChallengeRepository | None = None
_inventory_repository_instance: InventoryRepository | None = None
_inventory_service_instance: InventoryService | None = None
_compatibility_engine_instance: CompatibilityEngine | None = None
_compatibility_service_instance: CompatibilityService | None = None
_assistant_service_instance: AssistantService | None = None


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


def get_inventory_repository() -> InventoryRepository:
    global _inventory_repository_instance
    if _inventory_repository_instance is None:
        _inventory_repository_instance = InventoryRepository()
    return _inventory_repository_instance


def get_inventory_service() -> InventoryService:
    global _inventory_service_instance
    if _inventory_service_instance is None:
        repo = get_inventory_repository()
        _inventory_service_instance = InventoryService(repo)
        # 注入相容性回调
        compat = get_compatibility_service()
        _inventory_service_instance.set_compatibility_callback(
            lambda product_id: compat.recalculate_for_product(product_id)
        )
    return _inventory_service_instance


def get_compatibility_engine() -> CompatibilityEngine:
    global _compatibility_engine_instance
    if _compatibility_engine_instance is None:
        _compatibility_engine_instance = CompatibilityEngine()
    return _compatibility_engine_instance


def get_compatibility_service() -> CompatibilityService:
    global _compatibility_service_instance
    if _compatibility_service_instance is None:
        repo = get_inventory_repository()
        engine = get_compatibility_engine()
        _compatibility_service_instance = CompatibilityService(repo, engine)
    return _compatibility_service_instance

def get_assistant_service() -> AssistantService:
    global _assistant_service_instance
    if _assistant_service_instance is None:
        repo = get_inventory_repository()
        engine = get_compatibility_engine()
        _assistant_service_instance = AssistantService(repo, engine)
    return _assistant_service_instance
