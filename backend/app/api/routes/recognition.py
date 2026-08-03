"""Recognition API Routes — v2.0

接收临时上传照片，返回识别草稿。
照片不长期存储，识别完成后丢弃。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_ai_provider
from app.core.ai_provider import AIProvider
from app.services.recognition_service import RecognitionService
from app.utils.image import read_validated_image

router = APIRouter(prefix="/inventory/recognition", tags=["recognition"])


@router.post("/recognize")
async def recognize_product(
    image: UploadFile = File(...),
    ai_provider: AIProvider = Depends(get_ai_provider),
):
    """识别产品照片

    上传一张产品照片，返回识别草稿（RecognitionDraft 格式）。
    照片仅在识别过程中临时使用，不做长期存储。
    """
    image_bytes = await read_validated_image(image)
    service = RecognitionService(ai_provider)
    return await service.recognize_product(image_bytes)
