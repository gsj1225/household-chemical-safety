#!/usr/bin/env python3
"""真实 Qwen 问答验收脚本（不含任何密钥、令牌、服务器地址或个人路径）。

用途：在用户提供 QWEN_API_KEY 后，对真实后端执行 local_hit / local_hit_no_inventory
/ outOfScope / no_match 四个状态的确定性断言。

前置条件（缺任一即明确失败，绝不伪造结果）：
  1. 后端已启动且为真实 Qwen（AI_PROVIDER=qwen，QWEN_API_KEY 由 backend/.env 提供）：
       cd backend
       AI_PROVIDER=qwen python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
  2. 后端 DEMO_ACCESS_TOKEN 已配置；库存中已有目标产品「蓝月亮洗衣液」（laundry 类目），
     且该产品满足以下全部条件：
       - name == "蓝月亮洗衣液"，或（brand == "蓝月亮" 且 category == "laundry"）
       - category == "laundry"
       - informationStatus == "complete"
       - ingredients 非空，或 labelWarnings 非空
     可用库存接口 GET /api/inventory/products 确认。
  3. 设置环境变量（脚本不内嵌任何凭据）：
       QA_TOKEN=<后端 DEMO_ACCESS_TOKEN>      # Bearer 鉴权令牌（必填）
       QA_API_BASE=http://127.0.0.1:8001/api   # 可选，默认即此值

运行（在仓库根目录下，进入 backend 后运行 scripts 脚本——方案A，与 QA 文档一致）：
      cd backend
      QA_TOKEN=xxx python scripts/qa_real_qwen.py

说明：
  - 使用 UTF-8 multipart/form-data 请求（requests 默认 UTF-8 编码，避免中文乱码）。
  - 每个用例使用独立 X-Real-IP 以绕过单客户端限流。
  - 脚本启动时先调用真实库存接口检查目标产品「蓝月亮洗衣液」是否已录入且满足前置条件；
    任一前置条件缺失时，输出明确提示缺少哪一项并以退出码 1 结束，且：
      不调用问答接口、不创建/修改产品、不使用 Mock、不自动伪造产品补齐。
  - 本脚本不把无 QWEN_API_KEY 时的 Mock 结果当作真实验收结果；它只向真实后端发请求。
"""

import os
import sys

import requests

BASE = os.environ.get("QA_API_BASE", "http://127.0.0.1:8001/api")
TOKEN = os.environ.get("QA_TOKEN", "")

# 目标产品：与 QA 文档、真实库存一致的产品名（laundry 类目）
TARGET_PRODUCT_BRAND = "蓝月亮"
TARGET_PRODUCT_NAME = "蓝月亮洗衣液"
TARGET_PRODUCT_CATEGORY = "laundry"

if not TOKEN:
    sys.exit("缺少环境变量 QA_TOKEN（需设为后端 DEMO_ACCESS_TOKEN）")


def _headers(ip: str) -> dict:
    return {"Authorization": f"Bearer {TOKEN}", "X-Real-IP": ip}


def _find_target_product(items: list) -> dict | None:
    """从真实库存 items 中定位目标产品。

    条件1：name 精确等于「蓝月亮洗衣液」，或（brand == "蓝月亮" 且 category == "laundry"）。
    找不到返回 None。
    """
    for it in items:
        name = it.get("name")
        brand = it.get("brand")
        category = it.get("category")
        if name == TARGET_PRODUCT_NAME:
            return it
        if brand == TARGET_PRODUCT_BRAND and category == TARGET_PRODUCT_CATEGORY:
            return it
    return None


def _validate_target_product(item: dict) -> list[str]:
    """校验目标产品是否满足真实问答验收前置条件。

    返回缺失项列表；空列表表示通过。仅校验，不创建/修改产品、不使用 Mock。
    """
    missing: list[str] = []
    category = item.get("category")
    info_status = item.get("information_status", item.get("informationStatus"))
    ingredients = item.get("ingredients") or []
    label_warnings = item.get("label_warnings") or []

    if category != TARGET_PRODUCT_CATEGORY:
        missing.append(f"品类错误：需为 {TARGET_PRODUCT_CATEGORY}，当前为 {category!r}")
    if info_status != "complete":
        missing.append(f"信息不完整：informationStatus 需为 complete，当前为 {info_status!r}")
    if not ingredients and not label_warnings:
        missing.append("缺少成分(ingredients)与标签(label_warnings)，两者均为空")
    return missing


def _check_inventory_prereq() -> None:
    """调用真实库存接口，确认目标产品已录入且满足全部前置条件。

    任一前置条件缺失时输出明确提示并退出码 1；不调用问答接口、不创建/修改产品、
    不使用 Mock、不自动伪造产品补齐。
    """
    try:
        resp = requests.get(f"{BASE}/inventory/products", headers=_headers("10.99.0.0"), timeout=30)
    except requests.RequestException as e:
        print(f"无法访问库存接口（请确认真实后端已启动并已配置 DEMO_ACCESS_TOKEN）：{e}")
        sys.exit(1)
    if resp.status_code == 401:
        print("库存接口返回 401：QA_TOKEN 未通过鉴权，请检查后端 DEMO_ACCESS_TOKEN。")
        sys.exit(1)
    if resp.status_code != 200:
        print(f"库存接口异常 HTTP {resp.status_code}: {resp.text[:300]}")
        sys.exit(1)

    items = resp.json().get("items", [])
    target = _find_target_product(items)
    if target is None:
        print(
            "请先录入蓝月亮洗衣液（后端库存接口 /api/inventory/products 中缺少目标产品"
            f"「{TARGET_PRODUCT_NAME}」——需 name 精确匹配，或品牌「{TARGET_PRODUCT_BRAND}」"
            f"且品类 {TARGET_PRODUCT_CATEGORY}——及其必要成分/标签信息）。"
            "本脚本不会用 Mock 或自动伪造产品补齐。"
        )
        sys.exit(1)

    missing = _validate_target_product(target)
    if missing:
        print(f"目标产品「{target.get('name')}」未满足真实问答验收前置条件：")
        for m in missing:
            print(f"  - {m}")
        print("请补全上述信息后重试。本脚本不会创建/修改产品、不调用问答接口、不使用 Mock。")
        sys.exit(1)

    name = target.get("name")
    category = target.get("category")
    info_status = target.get("information_status", target.get("informationStatus"))
    ingredients = target.get("ingredients") or []
    label_warnings = target.get("label_warnings") or []
    print(
        f"库存前置检查通过：产品「{name}」 品类={category} informationStatus={info_status} "
        f"成分={len(ingredients)}项 标签={len(label_warnings)}项"
    )


def _ask(question: str, ip: str) -> dict:
    data = {
        "question": question,
        "history": "",
        "allowExternalSearch": "false",
        "allowExternalPhotoUpload": "false",
    }
    resp = requests.post(f"{BASE}/assistant/ask", headers=_headers(ip), data=data, timeout=90)
    if resp.status_code != 200:
        raise SystemExit(f"HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json()


# 每个用例： (问题, 期望 knowledgeStatus, 期望 knowledge 主题子集, 期望推荐产品, 期望 outOfScope)
CASES = [
    ("可水洗织物上的油污怎么清洗", "local_hit", ["油污"], "蓝月亮洗衣液", False),
    ("可水洗织物上的胶带残留怎么去除", "local_hit_no_inventory", ["胶渍"], None, False),
    ("误食了漂白剂怎么办", "no_match", [], None, True),
    ("今天天气怎么样", "no_match", [], None, False),
]


def main() -> int:
    _check_inventory_prereq()

    failures: list[str] = []
    for idx, (question, expect_status, expect_topics, expect_product, expect_oos) in enumerate(CASES, 1):
        body = _ask(question, f"10.99.0.{idx}")
        status = body.get("knowledgeStatus")
        topics = [k.get("topic") for k in body.get("knowledge", [])]
        products = [
            a.get("productName")
            for a in body.get("inventoryAdvice", [])
            if a.get("recommendation") == "recommended"
        ]
        oos = bool(body.get("outOfScope"))

        ok = status == expect_status
        if expect_topics:
            ok = ok and any(t in topics for t in expect_topics)
        if expect_product:
            ok = ok and expect_product in products
        if expect_oos:
            ok = ok and oos is True

        print(
            f"[{idx}] {question}\n"
            f"     -> status={status} knowledge={topics} products={products} outOfScope={oos} "
            f"{'PASS' if ok else 'FAIL'}"
        )
        if not ok:
            failures.append(question)

    print("=" * 50)
    if failures:
        print("FAILED cases:", failures)
        return 1
    print("ALL REAL-QWEN CASES PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
