"""生产安全配置测试。"""

import pytest
from pydantic import ValidationError

from app.config import Settings

def test_production_rejects_wildcard_cors():
    with pytest.raises(ValidationError):
        Settings(DEBUG=False, CORS_ORIGINS=["*"])

def test_production_accepts_explicit_cors_origin():
    configured = Settings(
        DEBUG=False,
        CORS_ORIGINS=["https://demo.example.com"],
    )
    assert configured.CORS_ORIGINS == ["https://demo.example.com"]

def test_production_accepts_empty_cors_for_native_apk():
    """原生 APK 无 Origin 头，空 CORS 列表可用。"""
    configured = Settings(
        DEBUG=False,
        CORS_ORIGINS=[],
    )
    assert configured.CORS_ORIGINS == []

def test_debug_allows_wildcard_cors():
    configured = Settings(DEBUG=True, CORS_ORIGINS=["*"])
    assert "*" in configured.CORS_ORIGINS

def test_demo_access_token_default_empty():
    configured = Settings()
    assert configured.DEMO_ACCESS_TOKEN == ""

def test_recognition_rate_limit_configurable():
    configured = Settings(RECOGNITION_RATE_LIMIT_PER_MINUTE=5)
    assert configured.RECOGNITION_RATE_LIMIT_PER_MINUTE == 5
