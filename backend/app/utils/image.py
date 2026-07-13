"""图片处理工具"""

import base64
from fastapi import HTTPException, UploadFile

from app.config import settings

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def image_bytes_to_base64(image_bytes: bytes) -> str:
    """将图片字节转为 base64 编码字符串（供 AI API 调用使用）。"""
    return base64.b64encode(image_bytes).decode('utf-8')


def image_bytes_to_data_url(image_bytes: bytes) -> str:
    """创建内存 Data URL，不写入磁盘。"""
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        mime_type = "image/png"
    elif image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        mime_type = "image/webp"
    else:
        mime_type = "image/jpeg"
    return f"data:{mime_type};base64,{image_bytes_to_base64(image_bytes)}"


def validate_image(image_bytes: bytes, max_size_mb: int = 10) -> bool:
    """验证图片大小是否在限制内。"""
    max_size = max_size_mb * 1024 * 1024
    return len(image_bytes) <= max_size


async def read_validated_image(image: UploadFile) -> bytes:
    """读取并校验上传图片，拒绝空文件、伪装类型和超大请求。"""
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="仅支持 JPEG、PNG 或 WEBP 图片")
    limit = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    content = await image.read(limit + 1)
    if not content:
        raise HTTPException(status_code=400, detail="图片不能为空")
    if len(content) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"图片不能超过 {settings.MAX_IMAGE_SIZE_MB}MB",
        )
    return content


def get_image_mime_type(filename: str) -> str:
    """根据文件名获取 MIME 类型。"""
    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
    mime_map = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
    }
    return mime_map.get(ext, 'image/jpeg')
