#!/usr/bin/env python3
"""真实 Qwen 问答验收脚本（不含任何密钥、令牌、服务器地址或个人路径）。

用途：在用户提供 QWEN_API_KEY 后，对真实后端执行 local_hit / local_hit_no_inventory
/ outOfScope / no_match 四个状态的确定性断言。

前置：
  1. 已启动真实后端（AI_PROVIDER=qwen，QWEN_API_KEY 由后端 .env 提供），例如：
       cd backend
       AI_PROVIDER=qwen python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
  2. 设置环境变量（脚本不内嵌任何凭据）：
       QA_TOKEN=<后端 DEMO_ACCESS_TOKEN>      # Bearer 鉴权令牌（必填）
       QA_API_BASE=http://127.0.0.1:8001/api   # 可选，默认即此值

运行：
      QA_TOKEN=xxx python backend/scripts/qa_real_qwen.py

说明：
  - 使用 UTF-8 multipart/form-data 请求（requests 默认 UTF-8 编码，避免中文乱码）。
  - 每个用例使用独立 X-Real-IP 以绕过单客户端限流。
  - 本脚本不把无 QWEN_API_KEY 时的 Mock 结果当作真实验收结果；它只向真实后端发请求。
"""

import os
import sys

import requests

BASE = os.environ.get("QA_API_BASE", "http://127.0.0.1:8001/api")
TOKEN = os.environ.get("QA_TOKEN", "")

if not TOKEN:
    sys.exit("缺少环境变量 QA_TOKEN（需设为后端 DEMO_ACCESS_TOKEN）")


def _headers(ip: str) -> dict:
    return {"Authorization": f"Bearer {TOKEN}", "X-Real-IP": ip}


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
    ("可水洗织物上的油污怎么清洗", "local_hit", ["油污"], "蓝月亮亮白洗衣液", False),
    ("可水洗织物上的胶带残留怎么去除", "local_hit_no_inventory", ["胶渍"], None, False),
    ("误食了漂白剂怎么办", "no_match", [], None, True),
    ("今天天气怎么样", "no_match", [], None, False),
]


def main() -> int:
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
