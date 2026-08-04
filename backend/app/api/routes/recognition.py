"""Recognition API Routes — v2.0

接收临时上传照片，返回识别草稿。
照片不长期存储，识别完成后丢弃。
识别接口接入独立限流，防止 Qwen API 配额耗尽。

限流客户端标识：只信任 Nginx 写入的 X-Real-IP 头。
不信任 X-Forwarded-For（客户端可伪造）。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.api.deps import get_ai_provider
from app.config import settings
from app.core.ai_provider import AIProvider
from app.core.rate_limit import rate_limiter
from app.services.recognition_service import RecognitionService
from app.utils.image import read_validated_image

router = APIRouter(prefix="/inventory/recognition", tags=["recognition"])


def _client_key(request: Request) -> str:
    """提取客户端标识用于限流。

    只信任 Nginx 写入的 X-Real-IP 头。
    不信任 X-Forwarded-For（客户端可伪造）。
    开发环境（无 Nginx）回退到 request.client.host。
    """
    real_ip = request.headers.get("X-Real-IP", "")
    if real_ip:
        return real_ip.strip()
    # 开发环境回退
    return request.client.host if request.client else "unknown"


@router.post("/recognize")
async def recognize_product(
    request: Request,
    image: UploadFile = File(...),
    ai_provider: AIProvider = Depends(get_ai_provider),
):
    """识别产品照片

    上传一张产品照片，返回识别草稿（RecognitionDraft 格式）。
    照片仅在识别过程中临时使用，不做长期存储。
    每客户端每分钟最多 RECOGNITION_RATE_LIMIT_PER_MINUTE 次。
    """
    # 限流检查
    allowed, retry_after = rate_limiter.check(
        key=f"recognition:{_client_key(request)}",
        limit=settings.RECOGNITION_RATE_LIMIT_PER_MINUTE,
        window_seconds=60,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": f"识别请求过于频繁，请 {retry_after} 秒后重试",
                }
            },
            headers={"Retry-After": str(retry_after)},
        )

    image_bytes = await read_validated_image(image)
    service = RecognitionService(ai_provider)
    return await service.recognize_product(image_bytes)
