"""应用配置管理"""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

class Settings(BaseSettings):
    """全局配置，可通过环境变量覆盖"""

    # 应用基础
    APP_NAME: str = "家庭化学品库"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    MAX_IMAGE_SIZE_MB: int = 5
    CHALLENGE_TTL_SECONDS: int = 3600
    MAX_ACTIVE_CHALLENGES: int = 1000
    DATABASE_PATH: str = "data/inventory.db"
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    MAX_SCANS_PER_CHALLENGE: int = 20
    RATE_LIMIT_START_PER_MINUTE: int = 10
    RATE_LIMIT_SCAN_PER_MINUTE: int = 30
    RATE_LIMIT_NARRATION_PER_MINUTE: int = 60

    # AI 提供者切换
    # mock: 使用 MockAI
    # qwen: 使用 Qwen 云 API
    AI_PROVIDER: Literal["mock", "qwen"] = "mock"

    # Qwen OpenAI-compatible API 配置
    QWEN_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_VL_MODEL: str = "qwen3-vl-plus"
    QWEN_TEXT_MODEL: str = "qwen-flash"
    QWEN_TIMEOUT_SECONDS: float = 30.0
    QWEN_MAX_RETRIES: int = 1

    # CORS
    # DEBUG=true 时允许 ["*"]；DEBUG=false 时必须为明确 Origin 列表或空列表
    # 空列表 [] 适用于原生 APK（无 Origin 头，CORS 不生效）
    CORS_ORIGINS: list[str] = ["*"]

    # 演示访问令牌（仅用于比赛演示，支持随时轮换）
    # 设置后所有 /api 请求需携带 Authorization: Bearer <token>
    # 留空则不启用鉴权（仅开发环境）
    DEMO_ACCESS_TOKEN: str = ""

    # 识别接口限流（独立于通用限流）
    RECOGNITION_RATE_LIMIT_PER_MINUTE: int = 10

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def validate_production_cors(self):
        if not self.DEBUG and "*" in self.CORS_ORIGINS:
            raise ValueError(
                "生产环境 CORS_ORIGINS 不得使用通配符 *。"
                "原生 APK 用空列表 []；Web QA 用明确 Origin。"
            )
        if self.AI_PROVIDER == "qwen" and not self.QWEN_API_KEY:
            raise ValueError("AI_PROVIDER=qwen 时必须配置 QWEN_API_KEY")
        return self

settings = Settings()
