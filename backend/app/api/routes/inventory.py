"""Inventory API Routes — v2.0

HTTP、校验、状态码。不访问 SQL，不拼安全结论。
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.api.deps import get_inventory_service
from app.data.inventory_repository import (
    DuplicateCandidateError,
    IdempotencyConflictError,
    ProductNotFoundError,
    RevisionConflictError,
)
from app.models.compatibility import (
    CompatibilitySummary,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    ProductMutationResult,
)
from app.models.inventory import (
    InventoryFilters,
    InventoryListResponse,
    ProductCreate,
    ProductDelete,
    ProductUpdate,
)
from app.services.inventory_service import InventoryService

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ── 列表 ──────────────────────────────────────────

@router.get("/products", response_model=InventoryListResponse)
def list_products(
    query: str | None = Query(None),
    category: str | None = Query(None),
    expiry_status: str | None = Query(None),
    safety_status: str | None = Query(None),
    sort_by: str = Query("updated_at"),
    sort_order: str = Query("desc"),
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service: InventoryService = Depends(get_inventory_service),
):
    filters = InventoryFilters(
        query=query,
        category=category,
        expiry_status=expiry_status,
        safety_status=safety_status,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=limit,
        offset=offset,
    )
    items, total, summary = service.list_products(filters)
    return InventoryListResponse(
        items=items,
        total=total,
        summary=summary,
    )


# ── 详情 ──────────────────────────────────────────

@router.get("/products/{product_id}", response_model=ProductMutationResult)
def get_product(
    product_id: str,
    service: InventoryService = Depends(get_inventory_service),
):
    try:
        return service.get_product_detail(product_id)
    except ProductNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PRODUCT_NOT_FOUND", "message": f"产品不存在: {product_id}"}},
        )


# ── 创建 ──────────────────────────────────────────

@router.post(
    "/products",
    response_model=ProductMutationResult,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    req: ProductCreate,
    service: InventoryService = Depends(get_inventory_service),
):
    try:
        return service.create_product(req)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "BAD_REQUEST", "message": str(e)}},
        )
    except DuplicateCandidateError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "DUPLICATE_CANDIDATE",
                    "message": "发现疑似重复产品，请选择更新已有产品或添加另一件",
                    "candidates": [c.model_dump(by_alias=True) for c in e.candidates],
                }
            },
        )
    except IdempotencyConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "IDEMPOTENCY_CONFLICT",
                    "message": f"操作 {e.operation_id} 已用于不同的请求",
                }
            },
        )


# ── 修改 ──────────────────────────────────────────

@router.patch("/products/{product_id}", response_model=ProductMutationResult)
def update_product(
    product_id: str,
    req: ProductUpdate,
    service: InventoryService = Depends(get_inventory_service),
):
    try:
        return service.update_product(product_id, req)
    except ProductNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PRODUCT_NOT_FOUND", "message": f"产品不存在: {product_id}"}},
        )
    except RevisionConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "PRODUCT_VERSION_CONFLICT",
                    "message": f"版本冲突: 当前 revision={e.current}, 请求 expectedRevision={e.expected}",
                }
            },
        )
    except IdempotencyConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "IDEMPOTENCY_CONFLICT",
                    "message": f"操作 {e.operation_id} 已用于不同的请求",
                }
            },
        )


# ── 删除 ──────────────────────────────────────────

@router.delete("/products/{product_id}", response_model=CompatibilitySummary)
def delete_product(
    product_id: str,
    req: ProductDelete,
    service: InventoryService = Depends(get_inventory_service),
):
    try:
        return service.delete_product(product_id, req)
    except ProductNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PRODUCT_NOT_FOUND", "message": f"产品不存在: {product_id}"}},
        )
    except RevisionConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "PRODUCT_VERSION_CONFLICT",
                    "message": f"版本冲突: 当前 revision={e.current}, 请求 expectedRevision={e.expected}",
                }
            },
        )
    except IdempotencyConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": {
                    "code": "IDEMPOTENCY_CONFLICT",
                    "message": f"操作 {e.operation_id} 已用于不同的请求",
                }
            },
        )


# ── 疑似重复检查 ──────────────────────────────────

@router.post("/duplicates/check", response_model=DuplicateCheckResponse)
def check_duplicates(
    req: DuplicateCheckRequest,
    service: InventoryService = Depends(get_inventory_service),
):
    return service.check_duplicates(req)
