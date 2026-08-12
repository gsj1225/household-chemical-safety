"""Assistant API Routes — Stage 4

POST /api/assistant/ask — multipart/form-data
文字 + 可选照片，返回结构化安全回答。
自动经过现有 Bearer 鉴权和 CORS 中间件。
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)

from app.api.deps import get_ai_provider
from app.api.deps import get_assistant_service
from app.config import settings
from app.core.ai_provider import AIProvider
from app.core.exceptions import AIProviderError, AIProviderTimeoutError
from app.core.rate_limit import rate_limiter
from app.models.assistant import AssistantHistoryMessage
from app.services.assistant_service import AssistantService
from app.utils.image import ALLOWED_IMAGE_TYPES

router = APIRouter(prefix="/assistant", tags=["assistant"])

MAX_QUESTION_LEN = 4000
MAX_HISTORY = 12


def _client_key(request: Request) -> str:
    """提取客户端标识用于限流（只信任 Nginx 写入的 X-Real-IP）。"""
    real_ip = request.headers.get("X-Real-IP", "")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _invalid(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={"error": {"code": code, "message": message}},
    )


def _parse_history(raw: str | None) -> list[dict[str, Any]]:
    """解析并校验 history JSON，截断为最近 12 条。"""
    if raw is None or raw.strip() == "":
        return []
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        raise _invalid("INVALID_ASSISTANT_INPUT", "对话历史格式错误")
    if not isinstance(data, list):
        raise _invalid("INVALID_ASSISTANT_INPUT", "对话历史格式错误")
    messages: list[dict[str, Any]] = []
    for item in data[-MAX_HISTORY:]:
        try:
            m = AssistantHistoryMessage.model_validate(item)
            messages.append(m.model_dump(by_alias=True))
        except Exception:
            raise _invalid("INVALID_ASSISTANT_INPUT", "对话历史格式错误")
    return messages


@router.post("/ask")
async def ask(
    request: Request,
    question: str = Form(...),
    history: str | None = Form(None),
    context_product_id: str | None = Form(None, alias="contextProductId"),
    allow_external_search: bool = Form(False, alias="allowExternalSearch"),
    allow_external_photo_upload: bool = Form(False, alias="allowExternalPhotoUpload"),
    image: UploadFile | None = File(None),
    ai_provider: AIProvider = Depends(get_ai_provider),
    service: AssistantService = Depends(get_assistant_service),
):
    """回答家庭化学品问题。

    文字 + 可选照片的 multipart 请求。
    每客户端每分钟最多 ASSISTANT_RATE_LIMIT_PER_MINUTE 次。
    """
    # 限流
    allowed, retry_after = rate_limiter.check(
        key=f"assistant:{_client_key(request)}",
        limit=settings.ASSISTANT_RATE_LIMIT_PER_MINUTE,
        window_seconds=60,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": f"提问过于频繁，请 {retry_after} 秒后重试",
                }
            },
            headers={"Retry-After": str(retry_after)},
        )

    # 校验问题
    q = (question or "").strip()
    if not q:
        raise _invalid("INVALID_ASSISTANT_INPUT", "问题不能为空")
    if len(q) > MAX_QUESTION_LEN:
        raise _invalid("INVALID_ASSISTANT_INPUT", "问题过长，最多 4000 字")

    # 校验图片
    image_bytes: bytes | None = None
    if image is not None and image.filename:
        if image.content_type not in ALLOWED_IMAGE_TYPES:
            raise _invalid("INVALID_ASSISTANT_INPUT", "不支持的图片格式")
        limit = int(settings.MAX_IMAGE_SIZE_MB * 1024 * 1024)
        content = await image.read(limit + 1)
        if not content:
            raise _invalid("INVALID_ASSISTANT_INPUT", "图片不能为空")
        if len(content) > limit:
            raise HTTPException(
                status_code=413,
                detail={
                    "error": {
                        "code": "IMAGE_TOO_LARGE",
                        "message": f"图片不能超过 {settings.MAX_IMAGE_SIZE_MB}MB",
                    }
                },
            )
        image_bytes = content

    # 校验并解析历史
    history_messages = _parse_history(history)

    try:
        return await service.ask(
            question=q,
            history=history_messages,
            image_bytes=image_bytes,
            context_product_id=context_product_id,
            ai_provider=ai_provider,
            allow_external_search=allow_external_search,
            allow_external_photo_upload=allow_external_photo_upload,
        )
    except AIProviderTimeoutError:
        raise HTTPException(
            status_code=504,
            detail={"error": {"code": "AI_PROVIDER_TIMEOUT", "message": "AI 服务超时，请重试"}},
        )
    except AIProviderError:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "AI_PROVIDER_ERROR", "message": "AI 服务暂时不可用"}},
        )
