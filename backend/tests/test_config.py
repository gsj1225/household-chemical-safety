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
