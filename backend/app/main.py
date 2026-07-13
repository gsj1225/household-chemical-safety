"""FastAPI 应用入口、请求追踪与统一异常响应。"""

import json
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.api.routes import challenge, narration, scan
from app.config import settings
from app.core.exceptions import (
    AIProviderError,
    AIProviderTimeoutError,
    ChallengeCompletedError,
    ChallengeNotFoundError,
    IdentificationDraftNotFoundError,
    ScanLimitExceededError,
)
from app.core.rate_limit import rate_limiter

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("mine_challenge.api")

app = FastAPI(
    title=settings.APP_NAME,
    description="家庭化学品排雷大挑战 API",
    version="0.2.0",
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
    client = request.client.host if request.client else "unknown"
    path = request.url.path
    policy = None
    if path == "/api/challenge/start":
        policy = ("start", settings.RATE_LIMIT_START_PER_MINUTE)
    elif path.startswith("/api/scan/"):
        policy = ("scan", settings.RATE_LIMIT_SCAN_PER_MINUTE)
    elif path == "/api/narration/generate":
        policy = ("narration", settings.RATE_LIMIT_NARRATION_PER_MINUTE)
    elif path == "/api/challenge/result":
        policy = ("report", settings.RATE_LIMIT_SCAN_PER_MINUTE)

    if policy:
        allowed, retry_after = rate_limiter.check(
            f"{client}:{policy[0]}", policy[1]
        )
        if not allowed:
            response = error_response(
                request, 429, "RATE_LIMITED", "请求过于频繁，请稍后重试",
                headers={"Retry-After": str(retry_after)},
            )
        else:
            response = await _safe_call(request, call_next)
    else:
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


@app.exception_handler(ChallengeNotFoundError)
async def challenge_not_found_handler(request: Request, exc: ChallengeNotFoundError):
    return error_response(request, 404, "CHALLENGE_NOT_FOUND", "挑战不存在")


@app.exception_handler(ChallengeCompletedError)
async def challenge_completed_handler(request: Request, exc: ChallengeCompletedError):
    return error_response(request, 409, "CHALLENGE_COMPLETED", "挑战已完成")


@app.exception_handler(ScanLimitExceededError)
async def scan_limit_handler(request: Request, exc: ScanLimitExceededError):
    return error_response(
        request, 429, "SCAN_LIMIT_REACHED", "本次挑战的扫描次数已达上限"
    )


@app.exception_handler(AIProviderTimeoutError)
async def ai_timeout_handler(request: Request, exc: AIProviderTimeoutError):
    return error_response(request, 504, "AI_TIMEOUT", "模型识别超时，请重试")


@app.exception_handler(AIProviderError)
async def ai_provider_handler(request: Request, exc: AIProviderError):
    return error_response(
        request, 502, "AI_PROVIDER_ERROR", "模型识别暂时不可用，请重试"
    )


@app.exception_handler(IdentificationDraftNotFoundError)
async def draft_not_found_handler(
    request: Request, exc: IdentificationDraftNotFoundError
):
    return error_response(
        request, 409, "IDENTIFICATION_DRAFT_INVALID",
        "识别草稿已失效，请重新拍摄或选择照片",
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
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


app.include_router(challenge.router, prefix="/api")
app.include_router(scan.router, prefix="/api")
app.include_router(narration.router, prefix="/api")


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "ai_provider": settings.AI_PROVIDER,
    }


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "0.2.0",
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
