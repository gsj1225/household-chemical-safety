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
        AI_PROVIDER="qwen",
        QWEN_API_KEY="test-key",
    )
    assert configured.CORS_ORIGINS == ["https://demo.example.com"]


def test_production_accepts_empty_cors_for_native_apk():
    """原生 APK 无 Origin 头，空 CORS 列表可用。"""
    configured = Settings(
        DEBUG=False,
        CORS_ORIGINS=[],
        DEMO_ACCESS_TOKEN="some-token",
        AI_PROVIDER="qwen",
        QWEN_API_KEY="test-key",
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
        AI_PROVIDER="qwen",
        QWEN_API_KEY="test-key",
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


def test_production_rejects_mock_ai_provider():
    """生产（DEBUG=false）不得使用 Mock，必须真实 Qwen，禁止静默回退。"""
    with pytest.raises(ValidationError, match="AI_PROVIDER=qwen"):
        Settings(
            DEBUG=False,
            CORS_ORIGINS=[],
            DEMO_ACCESS_TOKEN="some-token",
            AI_PROVIDER="mock",
        )


def test_production_requires_qwen_api_key_no_mock_fallback():
    """生产强制 Qwen 时未配置 QWEN_API_KEY 必须明确报错，不静默回退 Mock。"""
    with pytest.raises(ValidationError, match="QWEN_API_KEY"):
        Settings(
            DEBUG=False,
            CORS_ORIGINS=[],
            DEMO_ACCESS_TOKEN="some-token",
            AI_PROVIDER="qwen",
            QWEN_API_KEY="",
        )


def test_production_accepts_real_qwen():
    """生产配置真实 Qwen + 有效 Key 通过校验。"""
    configured = Settings(
        DEBUG=False,
        CORS_ORIGINS=[],
        DEMO_ACCESS_TOKEN="some-token",
        AI_PROVIDER="qwen",
        QWEN_API_KEY="sk-test",
    )
    assert configured.AI_PROVIDER == "qwen"


# ---------------------------------------------------------------------------
# 环境变量模板测试：确认默认/部署模板不会把生产或演示问答配置成 Mock
# ---------------------------------------------------------------------------
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _read_key_value(env_text: str):
    """解析 .env 文本为 {KEY: VALUE}，忽略注释与空行。"""
    result = {}
    for raw in env_text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        result[key.strip()] = value.strip()
    return result


def _assert_template_not_mock(env_path: Path, label: str):
    assert env_path.exists(), f"{label} 模板文件缺失：{env_path}"
    kv = _read_key_value(env_path.read_text(encoding="utf-8"))

    # AI_PROVIDER 必须为 qwen，绝不能是 mock
    assert kv.get("AI_PROVIDER") == "qwen", (
        f"{label} 默认模板 AI_PROVIDER 必须是 qwen，实际为 {kv.get('AI_PROVIDER')!r}"
    )

    # 生产/部署模板必须 DEBUG=false
    assert kv.get("DEBUG") == "false", (
        f"{label} 默认模板 DEBUG 必须为 false，实际为 {kv.get('DEBUG')!r}"
    )

    # 不允许出现 AI_PROVIDER=mock 的配置行
    assert "AI_PROVIDER=mock" not in env_path.read_text(encoding="utf-8"), (
        f"{label} 默认模板中出现 AI_PROVIDER=mock，禁止"
    )


def test_backend_env_template_defaults_to_real_qwen():
    """backend/.env.example 默认模板不得把生产/演示问答配成 Mock。"""
    _assert_template_not_mock(BACKEND_DIR / ".env.example", "backend")


def test_deploy_env_template_defaults_to_real_qwen():
    """deploy/.env.example 默认模板不得把生产/演示问答配成 Mock。"""
    _assert_template_not_mock(BACKEND_DIR.parent / "deploy" / ".env.example", "deploy")


def test_backend_env_template_has_empty_secret_placeholders():
    """backend/.env.example 的密钥/令牌必须留空占位，禁止预填真实值。"""
    kv = _read_key_value((BACKEND_DIR / ".env.example").read_text(encoding="utf-8"))
    assert kv.get("QWEN_API_KEY", "").strip() == "" or "replace" in kv.get("QWEN_API_KEY", "").lower()
    assert kv.get("DEMO_ACCESS_TOKEN", "").strip() == ""
