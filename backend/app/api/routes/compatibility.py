"""Compatibility API Routes — v2.0"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_compatibility_service
from app.services.compatibility_service import CompatibilityService

router = APIRouter(prefix="/inventory/compatibility", tags=["compatibility"])


@router.get("/summary")
def get_summary(
    service: CompatibilityService = Depends(get_compatibility_service),
):
    return service.get_summary()


@router.get("/relations")
def list_relations(
    product_id: str | None = Query(None),
    relation_type: str | None = Query(None),
    severity: str | None = Query(None),
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service: CompatibilityService = Depends(get_compatibility_service),
):
    items, total = service.list_relations(
        product_id=product_id,
        relation_type=relation_type,
        severity=severity,
    )
    return {"items": items, "total": total}


@router.get("/relations/{relation_id}")
def get_relation_detail(
    relation_id: str,
    service: CompatibilityService = Depends(get_compatibility_service),
):
    detail = service.get_relation_detail(relation_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "RELATION_NOT_FOUND", "message": f"关系不存在: {relation_id}"}},
        )
    return detail
