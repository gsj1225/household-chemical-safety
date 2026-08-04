"""FastAPI 应用入口、请求追踪与统一异常响应 — v2.0

V1 排雷挑战流程已退出，仅保留 V2 化学品库管理路由。
"""

from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.api.routes import compatibility, inventory, recognition
from app.config import settings

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("inventory.api")

app = FastAPI(
    title=settings.APP_NAME,
    description="家庭化学品安全库存 API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


def request_id_for(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def error_response(
    request: Request, status_code: int, code: str, message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        headers=headers,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id_for(request),
            }
        },
    )


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = uuid.uuid4().hex[:16]
    request.state.request_id = request_id
    started = time.perf_counter()

    response = await _safe_call(request, call_next)

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    logger.info(json.dumps({
        "event": "http_request",
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": duration_ms,
    }, ensure_ascii=False))
    return response


async def _safe_call(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception(
            "unexpected_error request_id=%s path=%s",
            request_id_for(request), request.url.path,
        )
        return error_response(
            request, 500, "INTERNAL_ERROR", "服务器暂时无法处理请求"
        )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        err = exc.detail["error"]
        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={
                "error": {
                    "code": err.get("code", "HTTP_ERROR"),
                    "message": err.get("message", "请求处理失败"),
                    "request_id": request_id_for(request),
                    **{k: v for k, v in err.items() if k not in ("code", "message")},
                }
            },
        )
    messages = {
        400: ("BAD_REQUEST", "请求内容不正确"),
        404: ("NOT_FOUND", "请求的资源不存在"),
        413: ("IMAGE_TOO_LARGE", "上传图片过大"),
        415: ("UNSUPPORTED_IMAGE_TYPE", "不支持的图片格式"),
    }
    code, fallback = messages.get(exc.status_code, ("HTTP_ERROR", "请求处理失败"))
    message = exc.detail if isinstance(exc.detail, str) else fallback
    return error_response(request, exc.status_code, code, message)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return error_response(request, 422, "VALIDATION_ERROR", "请求参数不完整或格式错误")


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "unexpected_error request_id=%s path=%s",
        request_id_for(request), request.url.path,
    )
    return error_response(request, 500, "INTERNAL_ERROR", "服务器暂时无法处理请求")


# ── V2 路由注册 ────────────────────────────────────

app.include_router(inventory.router, prefix="/api")
app.include_router(compatibility.router, prefix="/api")
app.include_router(recognition.router, prefix="/api")


@app.get("/health")
async def health_check():
    """健康检查：验证进程存活 + SQLite 可连通。"""
    import sqlite3
    db_ok = True
    try:
        conn = sqlite3.connect(str(settings.DATABASE_PATH))
        conn.execute("SELECT 1")
        conn.close()
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "app": settings.APP_NAME,
        "db": "ok" if db_ok else "error",
    }


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
