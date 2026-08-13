"""兼容性问题识别与产品匹配 — 确定性纯函数。

在 AssistantService.ask() 的早期阶段（LLM 调用之前）使用，
识别用户是否在直接询问产品混用安全性，并从问题文本匹配库存产品。

此模块不依赖 LLM、不依赖网络，全部为确定性逻辑。
"""

from __future__ import annotations

import re

from app.models.inventory import InventoryProduct

# ── 兼容性问题识别 ────────────────────────────────

# 匹配"产品A能和产品B一起用吗"等混用安全问题的模式
_COMPATIBILITY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p)
    for p in [
        # 能/可以 + 和 + 一起用/混用
        r"能.*和.*一起用",
        r"可以.*和.*一起用",
        r"能.*和.*混用",
        r"可以.*和.*混用",
        # 和 + 一起用/混用/同时用（不要求前面有"能/可以"）
        r"和.*一起用",
        r"和.*一起使用",
        r"和.*混用",
        r"和.*同时.*用",
        # 能不能/能否/是否
        r"能不能.*混合",
        r"能.*混合.*吗",
        r"可以.*混合.*吗",
        r"是否.*冲突",
        r"能.*同时使用",
        r"可以.*同时使用",
        r"搭配.*使用",
        # 单独关键词
        r"混用",
        r"混合.*使用",
        r"一起用",
        r"一起.*使用",
        r"同时.*使用",
        r"反应",
        r"中和",
    ]
]


def is_compatibility_question(question: str) -> bool:
    """判断问题是否为产品兼容性/混用安全问题。

    覆盖模式：
    - 能和……一起用吗 / 可以和……一起用吗
    - 能和……混用吗 / 可以和……混用吗
    - 能不能混合 / 能混合吗
    - 是否冲突
    - 能同时使用吗 / 可以同时使用吗
    - 搭配使用
    - 混用 / 混合使用 / 一起使用 / 同时使用
    - 反应 / 中和

    >>> is_compatibility_question("洁厕灵能和84消毒液一起用吗")
    True
    >>> is_compatibility_question("怎么清理马桶")
    False
    >>> is_compatibility_question("")
    False
    """
    q = question or ""
    if not q.strip():
        return False
    return any(p.search(q) for p in _COMPATIBILITY_PATTERNS)


# ── 产品名称匹配 ──────────────────────────────────


def match_products_from_question(
    question: str,
    products: list[InventoryProduct],
) -> list[InventoryProduct]:
    """从问题文本中匹配库存产品。

    匹配策略（按优先级）：
    1. 产品全名出现在问题中（精确子串匹配）
    2. 产品名去掉品牌前缀后的核心词出现在问题中
    3. 产品成分出现在问题中（如"次氯酸钠"、"盐酸"）

    返回匹配到的产品列表（保持库存顺序），去重。
    """
    q = question or ""
    if not q.strip() or not products:
        return []

    matched: list[InventoryProduct] = []
    seen_ids: set[str] = set()

    for p in products:
        if p.id in seen_ids:
            continue

        # 1. 精确全名匹配
        if p.name and _normalize(p.name) in _normalize(q):
            matched.append(p)
            seen_ids.add(p.id)
            continue

        # 2. 去品牌前缀后的核心词匹配
        core = _extract_core_name(p.name)
        if core and len(core) >= 2 and _normalize(core) in _normalize(q):
            matched.append(p)
            seen_ids.add(p.id)
            continue

        # 3. 成分匹配（已确认成分）
        for fact in p.ingredients:
            if fact.confirmation.value == "confirmed" and fact.display_value:
                if _normalize(fact.display_value) in _normalize(q):
                    matched.append(p)
                    seen_ids.add(p.id)
                    break

    return matched


def _normalize(text: str) -> str:
    """归一化文本：去空白、转小写。"""
    return re.sub(r"\s+", "", text).lower().strip()


def _extract_core_name(name: str) -> str:
    """从产品名中去掉常见品牌前缀，提取核心词。

    例如："威猛先生洁厕灵" → "洁厕灵"
          "蓝月亮洗衣液" → "洗衣液"
          "84消毒液" → "84消毒液"（数字开头不过滤）
    """
    if not name:
        return name

    # 常见品牌前缀（按长度降序匹配，优先匹配长前缀）
    brand_prefixes = [
        "威猛先生", "蓝月亮", "超能", "立白", "白猫", "雕牌",
        "威露士", "滴露", "舒肤佳", "清风", "心相印",
        "花王", "狮王", "绿伞", "优洁士", "老管家",
    ]
    result = name
    for prefix in sorted(brand_prefixes, key=len, reverse=True):
        if result.startswith(prefix):
            result = result[len(prefix):]
            break

    return result.strip()


def build_relevant_pairs(
    question: str,
    products: list[InventoryProduct],
) -> list[tuple[InventoryProduct, InventoryProduct]]:
    """构建需要检查的产品组合对。

    策略：
    1. 先从问题文本匹配产品名称
    2. 如果匹配到 >= 2 个产品，只检查这些产品之间的组合
    3. 如果匹配到 < 2 个产品，检查库存全部产品组合（全库扫描）
    4. 如果库存为空，返回空列表

    返回的 pair 列表中，匹配到的产品排在前面。
    """
    if not products or len(products) < 2:
        return []

    matched = match_products_from_question(question, products)

    if len(matched) >= 2:
        # 只检查匹配到的产品之间的组合
        pairs: list[tuple[InventoryProduct, InventoryProduct]] = []
        for i in range(len(matched)):
            for j in range(i + 1, len(matched)):
                pairs.append((matched[i], matched[j]))
        return pairs

    # 匹配不足 2 个 → 全库组合扫描
    pairs = []
    for i in range(len(products)):
        for j in range(i + 1, len(products)):
            pairs.append((products[i], products[j]))
    return pairs
