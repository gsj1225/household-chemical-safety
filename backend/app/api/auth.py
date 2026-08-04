"""演示访问令牌鉴权中间件（唯一生产实现）。

仅在 DEMO_ACCESS_TOKEN 非空时启用。
所有 /api 路由需要携带 Authorization: Bearer <token>。
豁免：/health、/、CORS OPTIONS 预检请求。
"""

from __future__ import annotations

import hmac
import json
import logging
import time

from fastapi import Request
from fastapi.responses import JSONResponse

from app.config import settings

logger = logging.getLogger("inventory.api")


async def demo_auth_middleware(request: Request, call_next):
    """演示令牌鉴权：拦截 /api 路由，校验 Bearer token。

    豁免规则：
    - 非 /api 路径（/health、/、/docs 等）
    - OPTIONS 请求（CORS 预检）
    - DEMO_ACCESS_TOKEN 为空（开发环境）
    """

    path = request.url.path

    # 豁免：非 /api 路径
    if not path.startswith("/api"):
        return await call_next(request)

    # 豁免：CORS OPTIONS 预检请求
    if request.method == "OPTIONS":
        return await call_next(request)

    # 豁免：未设置令牌（开发环境）
    if not settings.DEMO_ACCESS_TOKEN:
        return await call_next(request)

    # 校验 Authorization 头
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    request_id = getattr(request.state, "request_id", "unknown")

    if not hmac.compare_digest(token, settings.DEMO_ACCESS_TOKEN):
        logger.info(json.dumps({
            "event": "auth_rejected",
            "request_id": request_id,
            "path": path,
        }, ensure_ascii=False))
        return JSONResponse(
            status_code=401,
            content={
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "无效或缺失的访问令牌",
                    "request_id": request_id,
                }
            },
        )

    return await call_next(request)
