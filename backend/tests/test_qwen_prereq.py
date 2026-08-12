"""qa_real_qwen.py 库存前置检查测试。

覆盖场景：无产品 / 品牌相同但类别错误 / 信息不完整 / 无成分和标签 / 完整产品通过。
仅测试脚本的库存前置检查逻辑；不触碰真实后端、不创建/修改产品、不使用 Mock。
"""

import contextlib
import io
import os
import sys
from pathlib import Path

# 脚本模块在 import 时若 QA_TOKEN 为空会 sys.exit，先设置测试令牌
os.environ.setdefault("QA_TOKEN", "test-token")

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import qa_real_qwen as q  # noqa: E402


class _FakeResp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = "fake-body"

    def json(self):
        return self._payload


def _patch_inventory(monkeypatch, items):
    resp = _FakeResp(200, {"items": items, "total": len(items)})
    monkeypatch.setattr(q.requests, "get", lambda *a, **k: resp)


def _run_prereq(monkeypatch, items):
    """运行 _check_inventory_prereq，返回 (exit_code, captured_output)。"""
    _patch_inventory(monkeypatch, items)
    buf = io.StringIO()
    exit_code = None
    with contextlib.redirect_stdout(buf):
        try:
            q._check_inventory_prereq()
        except SystemExit as e:
            exit_code = e.code
    return exit_code, buf.getvalue()


# 完整目标产品样例（满足全部前置条件）
def _complete_product(**overrides):
    product = {
        "name": "蓝月亮洗衣液",
        "brand": "蓝月亮",
        "category": "laundry",
        "information_status": "complete",
        "ingredients": [{"display_value": "表面活性剂"}],
        "label_warnings": [{"display_value": "不可食用"}],
    }
    product.update(overrides)
    return product


# ── _check_inventory_prereq 整体行为 ───────────────────────────────

def test_no_product_exits_1(monkeypatch):
    """库存无产品：输出「请先录入蓝月亮洗衣液」并退出码 1。"""
    exit_code, out = _run_prereq(monkeypatch, [])
    assert exit_code == 1
    assert "请先录入蓝月亮洗衣液" in out


def test_brand_same_but_wrong_category_exits_1(monkeypatch):
    """品牌相同但品类错误（disinfectant 而非 laundry）：找不到目标产品，退出码 1。"""
    exit_code, out = _run_prereq(
        monkeypatch,
        [{"name": "蓝月亮洗手液", "brand": "蓝月亮", "category": "disinfectant"}],
    )
    assert exit_code == 1
    assert "请先录入蓝月亮洗衣液" in out


def test_incomplete_info_exits_1(monkeypatch):
    """目标产品信息不完整（informationStatus != complete）：退出码 1。"""
    exit_code, out = _run_prereq(
        monkeypatch,
        [_complete_product(information_status="needs_information")],
    )
    assert exit_code == 1
    assert "信息不完整" in out
    assert "needs_information" in out


def test_no_ingredients_no_warnings_exits_1(monkeypatch):
    """目标产品无成分且无标签：退出码 1。"""
    exit_code, out = _run_prereq(
        monkeypatch,
        [_complete_product(ingredients=[], label_warnings=[])],
    )
    assert exit_code == 1
    assert "缺少成分" in out


def test_complete_product_passes(monkeypatch):
    """完整产品通过：不退出，并输出产品名/品类/informationStatus/成分/标签。"""
    exit_code, out = _run_prereq(monkeypatch, [_complete_product()])
    assert exit_code is None
    assert "库存前置检查通过" in out
    assert "蓝月亮洗衣液" in out
    assert "laundry" in out
    assert "complete" in out
    assert "成分=1项" in out


# ── _validate_target_product 纯函数 ────────────────────────────────

def test_validate_category_error():
    missing = q._validate_target_product(_complete_product(category="disinfectant"))
    assert any("品类错误" in m for m in missing)


def test_validate_info_status_error():
    missing = q._validate_target_product(_complete_product(information_status="needs_information"))
    assert any("信息不完整" in m for m in missing)


def test_validate_missing_ingredients_and_warnings():
    missing = q._validate_target_product(_complete_product(ingredients=[], label_warnings=[]))
    assert any("缺少成分" in m for m in missing)


def test_validate_accepts_camelcase_information_status():
    """兼容 API 返回 informationStatus（camelCase）字段。"""
    item = _complete_product()
    item.pop("information_status")
    item["informationStatus"] = "complete"
    assert q._validate_target_product(item) == []


def test_validate_complete_returns_empty():
    assert q._validate_target_product(_complete_product()) == []
