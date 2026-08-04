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
        DEMO_ACCESS_TOKEN="some-token",
    )
    assert configured.CORS_ORIGINS == ["https://demo.example.com"]


def test_production_accepts_empty_cors_for_native_apk():
    """原生 APK 无 Origin 头，空 CORS 列表可用。"""
    configured = Settings(
        DEBUG=False,
        CORS_ORIGINS=[],
        DEMO_ACCESS_TOKEN="some-token",
    )
    assert configured.CORS_ORIGINS == []


def test_debug_allows_wildcard_cors():
    configured = Settings(DEBUG=True, CORS_ORIGINS=["*"])
    assert "*" in configured.CORS_ORIGINS


def test_production_requires_demo_access_token():
    """DEBUG=false 时 DEMO_ACCESS_TOKEN 必须非空。"""
    with pytest.raises(ValidationError, match="DEMO_ACCESS_TOKEN"):
        Settings(DEBUG=False, CORS_ORIGINS=[], DEMO_ACCESS_TOKEN="")


def test_production_accepts_non_empty_demo_token():
    """DEBUG=false 时非空令牌通过校验。"""
    configured = Settings(
        DEBUG=False,
        CORS_ORIGINS=[],
        DEMO_ACCESS_TOKEN="my-demo-token",
    )
    assert configured.DEMO_ACCESS_TOKEN == "my-demo-token"


def test_debug_allows_empty_demo_token():
    """DEBUG=true 时允许空令牌（开发环境）。"""
    configured = Settings(DEBUG=True, DEMO_ACCESS_TOKEN="")
    assert configured.DEMO_ACCESS_TOKEN == ""


def test_demo_access_token_default_empty():
    configured = Settings()
    assert configured.DEMO_ACCESS_TOKEN == ""


def test_recognition_rate_limit_configurable():
    configured = Settings(RECOGNITION_RATE_LIMIT_PER_MINUTE=5)
    assert configured.RECOGNITION_RATE_LIMIT_PER_MINUTE == 5
