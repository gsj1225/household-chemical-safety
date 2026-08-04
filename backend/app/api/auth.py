"""演示访问令牌鉴权中间件。

仅在 DEMO_ACCESS_TOKEN 非空时启用。
所有 /api 路由需要携带 Authorization: Bearer <token>。
/health 和 / 豁免。
"""

from __future__ import annotations

import hmac

from fastapi import Request
from fastapi.responses import JSONResponse

from app.config import settings


async def demo_auth_middleware(request: Request, call_next):
    """演示令牌鉴权：拦截 /api 路由，校验 Bearer token。"""

    path = request.url.path

    # 豁免路径
    if path in ("/health", "/") or not path.startswith("/api"):
        return await call_next(request)

    # 未设置令牌则不启用鉴权（开发环境）
    if not settings.DEMO_ACCESS_TOKEN:
        return await call_next(request)

    # 校验 Authorization 头
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    if not hmac.compare_digest(token, settings.DEMO_ACCESS_TOKEN):
        return JSONResponse(
            status_code=401,
            content={
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "无效或缺失的访问令牌",
                    "request_id": getattr(request.state, "request_id", "unknown"),
                }
            },
        )

    return await call_next(request)
