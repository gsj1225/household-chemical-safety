"""Qwen Provider 离线契约测试，不访问公网、不消耗额度。"""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import APITimeoutError

from app.config import settings
from app.core.exceptions import AIProviderError, AIProviderTimeoutError
from app.core.qwen_ai import QwenAI


def fake_client(content: str | None = None, error: Exception | None = None):
    create = AsyncMock()
    if error is not None:
        create.side_effect = error
    else:
        response = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )
        create.return_value = response
    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )


def test_analyze_panorama_uses_structured_multimodal_request():
    content = json.dumps({
        "areas": [{
            "description": "水槽下方",
            "items_hint": "两瓶清洁剂",
            "risk_level": "high",
            "guide_message": "请靠近拍标签",
            "bbox_2d": [120, 240, 560, 880],
        }],
        "guide_message": "发现一个待检查区域",
    }, ensure_ascii=False)
    client = fake_client(content)

    result = asyncio.run(QwenAI(client=client).analyze_panorama(b"jpeg-data"))

    assert result.areas[0].description == "水槽下方"
    assert result.areas[0].bbox_2d == (120, 240, 560, 880)
    kwargs = client.chat.completions.create.await_args.kwargs
    assert kwargs["response_format"] == {"type": "json_object"}
    assert kwargs["extra_body"] == {"enable_thinking": False}
    image_url = kwargs["messages"][0]["content"][0]["image_url"]["url"]
    assert image_url.startswith("data:image/jpeg;base64,")
    prompt = kwargs["messages"][0]["content"][1]["text"]
    assert "优先选择2到3个" in prompt


def test_panorama_keeps_three_normal_areas_and_removes_overlap():
    areas = [
        {
            "description": f"区域{i}",
            "items_hint": "清洁用品",
            "risk_level": "medium",
            "guide_message": "靠近拍摄",
            "bbox_2d": box,
        }
        for i, box in enumerate([
            [10, 10, 200, 200],
            [12, 12, 198, 198],
            [250, 10, 400, 200],
            [450, 10, 600, 200],
            [650, 10, 800, 200],
        ])
    ]
    client = fake_client(json.dumps({"areas": areas, "guide_message": "共5个"}))

    result = asyncio.run(QwenAI(client=client).analyze_panorama(b"image"))

    assert len(result.areas) == 3
    assert result.guide_message == "我标出了3个最值得检查的区域，请按顺序靠近拍摄。"


def test_identify_product_validates_json_schema():
    client = fake_client(json.dumps({
        "brand": "示例",
        "name": "含氯消毒液",
        "category": "含氯消毒剂",
        "ingredients": ["次氯酸钠"],
        "confidence": "high",
    }, ensure_ascii=False))

    product = asyncio.run(QwenAI(client=client).identify_product(b"image"))

    assert product.ingredients == ["次氯酸钠"]
    assert product.confidence.value == "high"


def test_invalid_json_and_timeout_are_domain_errors():
    with pytest.raises(AIProviderError):
        asyncio.run(QwenAI(client=fake_client("not-json")).analyze_panorama(b"image"))

    timeout = APITimeoutError(request=httpx.Request("POST", "https://example.test"))
    with pytest.raises(AIProviderTimeoutError):
        asyncio.run(QwenAI(client=fake_client(error=timeout)).identify_product(b"image"))


def test_missing_api_key_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "QWEN_API_KEY", "")
    with pytest.raises(AIProviderError):
        QwenAI()
