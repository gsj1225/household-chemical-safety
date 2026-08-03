"""DuplicateMatcher — 疑似重复产品检测

只返回候选和原因，不合并记录。
匹配优先级：条码强匹配 > 品牌+名称强匹配 > 名称普通匹配。
"""

from __future__ import annotations

from typing import Protocol

from app.models.compatibility import DuplicateCandidate
from app.models.inventory import InventoryProduct


class ProductReader(Protocol):
    """DuplicateMatcher 需要的产品读取接口"""

    def list_all(self) -> list[InventoryProduct]:
        """返回全部库存产品供匹配"""
        ...


class DuplicateMatcher:
    """疑似重复检测器

    纯函数式匹配，不修改任何数据。
    """

    def __init__(self, reader: ProductReader):
        self._reader = reader

    def find_duplicates(
        self,
        name: str,
        brand: str | None = None,
        category: str | None = None,
        barcode: str | None = None,
    ) -> list[DuplicateCandidate]:
        """查找疑似重复产品

        匹配优先级（短路返回）：
        1. 条码完全一致 → strong
        2. 品牌+产品名一致 → strong
        3. 产品名一致 → normal

        Args:
            name: 产品名称
            brand: 品牌名（可选）
            category: 品类（可选，当前未参与匹配）
            barcode: 条码（可选）

        Returns:
            候选列表，无匹配时返回空列表
        """
        products = self._reader.list_all()
        candidates: list[DuplicateCandidate] = []

        # 1. 条码强匹配
        if barcode:
            for item in products:
                if item.barcode and item.barcode == barcode:
                    candidates.append(
                        DuplicateCandidate(
                            productId=item.id,
                            name=item.name,
                            category=item.category.value,
                            brand=item.brand,
                            matchReason="条码完全一致",
                            matchStrength="strong",
                        )
                    )

        if candidates:
            return candidates

        # 2. 品牌+名称强匹配
        if brand and name:
            name_lower = name.strip().lower()
            brand_lower = brand.strip().lower()
            for item in products:
                if (
                    item.name.strip().lower() == name_lower
                    and item.brand
                    and item.brand.strip().lower() == brand_lower
                ):
                    candidates.append(
                        DuplicateCandidate(
                            productId=item.id,
                            name=item.name,
                            category=item.category.value,
                            brand=item.brand,
                            matchReason="品牌+产品名一致",
                            matchStrength="strong",
                        )
                    )

        if candidates:
            return candidates

        # 3. 名称普通匹配
        if name:
            name_lower = name.strip().lower()
            for item in products:
                if item.name.strip().lower() == name_lower:
                    candidates.append(
                        DuplicateCandidate(
                            productId=item.id,
                            name=item.name,
                            category=item.category.value,
                            brand=item.brand,
                            matchReason="产品名一致",
                            matchStrength="normal",
                        )
                    )

        return candidates
