"""
Stage 7 Visual QA — 自动化截图脚本（v2）

通过 CDP 对 QA 夹具的每个场景在指定视口下截图。
每个场景配置期望文字和禁止文字，等待期望内容出现后才截图。
出现禁止内容则标记 FAIL。

用法:
  python qa-screenshots.py
  python qa-screenshots.py --base-url http://127.0.0.1:8082 --cdp-port 50194
  python qa-screenshots.py --output-dir /path/to/screenshots
  python qa-screenshots.py --negative-test          # 负向验证（确认失败路径可用）

也支持环境变量:
  QA_BASE_URL  /  QA_CDP_PORT  /  QA_OUTPUT_DIR
"""

import websocket
import json
import base64
import time
import httpx
import os
import sys
import argparse

# ── 路径推导 ──────────────────────────────────────────────
# 脚本位于 mobile/scripts/qa-screenshots.py
# 项目根 = 上两级
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
DEFAULT_OUTPUT_DIR = os.path.join(PROJECT_ROOT, "docs", "screenshots", "stage7")
DEFAULT_BASE_URL = "http://127.0.0.1:8082"
DEFAULT_CDP_PORTS = [50194, 58264, 58664, 9222]

# ── 视口 ──────────────────────────────────────────────────
VIEWPORTS = [
    ("320x568", 320, 568),
    ("390x844", 390, 844),
    ("520x844", 520, 844),
    ("1280x900", 1280, 900),
]

# ── 场景配置 ──────────────────────────────────────────────
FORBIDDEN_COMMON = ["产品不存在"]

SCENES = [
    # 仓库
    {"name": "inventory-empty", "expect": ["库存为空"], "forbid": []},
    {"name": "inventory-content", "expect": ["共 4 件产品", "威猛先生"], "forbid": []},
    {"name": "inventory-loading", "expect": ["加载中"], "forbid": ["库存为空", "共4件产品"]},
    {"name": "inventory-error", "expect": ["无法连接服务"], "forbid": ["库存为空", "共 4 件产品"]},
    {"name": "inventory-no-results", "expect": ["不存在的"], "forbid": ["库存为空"]},
    # 入库
    {"name": "intake-review-normal", "expect": ["核对产品信息", "威猛先生"], "forbid": []},
    {"name": "intake-category-unknown", "expect": ["核对产品信息", "识别置信度较低"], "forbid": []},
    {"name": "intake-conflict", "expect": ["补拍冲突", "保留原值"], "forbid": []},
    {"name": "intake-permission-denied", "expect": ["权限被拒绝", "前往设置"], "forbid": []},
    {"name": "intake-partial-success", "expect": ["部分成功", "照片保存失败", "重新扫描封面"], "forbid": ["照片上传失败"]},
    # 详情
    {"name": "detail-full", "expect": ["威猛先生厨房清洁剂", "次氯酸钠", "不可混用对象"], "forbid": []},
    {"name": "detail-minimal", "expect": ["未知清洁剂", "暂无成分信息"], "forbid": []},
    {"name": "detail-long-text", "expect": ["超长名称", "着色剂"], "forbid": []},
    {"name": "detail-loading", "expect": ["加载中", "正在获取产品详情"], "forbid": ["威猛先生"]},
    {"name": "detail-error", "expect": ["加载失败", "网络连接失败"], "forbid": ["威猛先生厨房清洁剂", "编辑", "删除"]},
    # 编辑与对话框
    {"name": "edit-form", "expect": ["编辑产品", "保存"], "forbid": ["加载失败"]},
    {"name": "edit-unsaved-dialog", "expect": ["未保存的修改", "继续编辑"], "forbid": []},
    {"name": "detail-delete-dialog", "expect": ["确认删除", "此操作不可撤销"], "forbid": []},
    # 相容性
    {"name": "compat-critical", "expect": ["禁止混用", "含氯消毒剂"], "forbid": ["暂无相容性关系"]},
    {"name": "compat-attention", "expect": ["分开存放", "建议分开存放"], "forbid": ["暂无相容性关系"]},
    {"name": "compat-unknown", "expect": ["待补充信息", "成分信息不完整"], "forbid": ["暂无相容性关系"]},
    {"name": "compat-empty", "expect": ["暂无相容性关系"], "forbid": ["禁止混用", "含氯消毒剂"]},
    {"name": "compat-loading", "expect": ["加载中"], "forbid": ["暂无相容性关系", "禁止混用"]},
    {"name": "compat-error", "expect": ["加载相容性数据失败"], "forbid": ["暂无相容性关系", "禁止混用"]},
]

# 需要额外滚动到底部证据的场景
SCROLL_SCENES = ["detail-long-text", "edit-form"]

# 滚动场景的目标验证文字
SCROLL_TARGETS = {
    "edit-form": "保存",
    "detail-long-text": "删除",
}


# ── CDP 连接 ──────────────────────────────────────────────

def detect_cdp_port(candidate_ports):
    """自动检测可用的 CDP 端口。"""
    for port in candidate_ports:
        try:
            r = httpx.get(f"http://127.0.0.1:{port}/json/list", timeout=2)
            if r.status_code == 200:
                return port
        except Exception:
            pass
    return None


def get_page_ws(cdp_port):
    r = httpx.get(f"http://127.0.0.1:{cdp_port}/json/list", timeout=5)
    targets = r.json()
    for t in targets:
        if t.get("type") == "page":
            return t["webSocketDebuggerUrl"]
    raise RuntimeError("No page target found")


def send_cdp(ws, method, params=None, msg_id=1):
    msg = {"id": msg_id, "method": method}
    if params:
        msg["params"] = params
    ws.send(json.dumps(msg))
    while True:
        resp = json.loads(ws.recv())
        if resp.get("id") == msg_id:
            return resp


# ── 页面内容检测 ──────────────────────────────────────────

def get_page_text(ws, mid):
    mid[0] += 1
    resp = send_cdp(ws, "Runtime.evaluate", {
        "expression": "document.body.innerText"
    }, mid[0])
    return resp.get("result", {}).get("result", {}).get("value", "")


def wait_for_content(ws, scene_config, mid, timeout=20):
    """等待期望文字出现，检查禁止文字。返回 (ok, reason)。"""
    expected = scene_config["expect"]
    forbidden = FORBIDDEN_COMMON + scene_config["forbid"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        text = get_page_text(ws, mid)
        # 检查禁止文字
        for fb in forbidden:
            if fb in text:
                return False, f"禁止文字出现: '{fb}'"
        # 检查期望文字（全部出现）
        all_found = all(exp in text for exp in expected)
        if all_found:
            return True, "OK"
        time.sleep(1)
    # 超时，返回缺失的期望文字
    text = get_page_text(ws, mid)
    missing = [exp for exp in expected if exp not in text]
    return False, f"超时，缺失期望文字: {missing}"


# ── 截图 ──────────────────────────────────────────────────

def capture_screenshot(ws, filepath, mid):
    mid[0] += 1
    resp = send_cdp(ws, "Page.captureScreenshot", {
        "format": "jpeg",
        "quality": 90,
    }, mid[0])
    if "result" in resp and "data" in resp["result"]:
        img_data = base64.b64decode(resp["result"]["data"])
        with open(filepath, "wb") as f:
            f.write(img_data)
        return len(img_data)
    return 0


# ── 滚动验证 ──────────────────────────────────────────────

def scroll_and_verify(ws, scene, mid):
    """滚动到底部并验证目标文字进入视口。返回 (ok, reason)。"""
    target_text = SCROLL_TARGETS.get(scene)
    if not target_text:
        return True, "无滚动目标"

    # 记录滚动前的 scrollTop 并滚动到底部
    mid[0] += 1
    resp = send_cdp(ws, "Runtime.evaluate", {
        "expression": """
            (function() {
                var all = document.querySelectorAll('div');
                var maxScroll = 0;
                var scrollEl = null;
                all.forEach(function(el) {
                    var style = window.getComputedStyle(el);
                    var oy = style.overflowY;
                    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
                        if (el.scrollTop > maxScroll || scrollEl === null) {
                            maxScroll = el.scrollTop;
                            scrollEl = el;
                        }
                    }
                });
                if (!scrollEl) return JSON.stringify({found: false, beforeScroll: 0});
                scrollEl.scrollTop = scrollEl.scrollHeight;
                return JSON.stringify({
                    found: true,
                    beforeScroll: maxScroll,
                    scrollHeight: scrollEl.scrollHeight,
                    clientHeight: scrollEl.clientHeight,
                    afterScroll: scrollEl.scrollTop
                });
            })()
        """
    }, mid[0])
    scroll_info = json.loads(resp.get("result", {}).get("result", {}).get("value", "{}"))
    if not scroll_info.get("found"):
        return False, "未找到可滚动容器"

    time.sleep(1)

    # 验证目标文字是否在可见区域内
    mid[0] += 1
    resp = send_cdp(ws, "Runtime.evaluate", {
        "expression": f"""
            (function() {{
                var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                var target = {repr(target_text)};
                while (walker.nextNode()) {{
                    var node = walker.currentNode;
                    if (node.textContent.includes(target)) {{
                        var el = node.parentElement;
                        var rect = el.getBoundingClientRect();
                        if (rect.top >= 0 && rect.bottom <= window.innerHeight) {{
                            return JSON.stringify({{visible: true, text: target, top: rect.top, bottom: rect.bottom}});
                        }}
                    }}
                }}
                return JSON.stringify({{visible: false, text: target}});
            }})()
        """
    }, mid[0])
    vis_info = json.loads(resp.get("result", {}).get("result", {}).get("value", "{}"))
    if vis_info.get("visible"):
        return True, f"目标文字 '{target_text}' 在视口内可见"
    else:
        return False, f"目标文字 '{target_text}' 滚动后仍不可见"


# ── 单场景截图 ────────────────────────────────────────────

def capture_scene(ws, scene_config, vp_name, width, height, mid, output_dir, base_url):
    """
    截取单个场景在指定视口下的截图。
    始终返回 (ok, reason, size, bottom_result) 四元组。
    bottom_result 为 None 表示无滚动截图，否则为 dict。
    """
    scene = scene_config["name"]
    url = f"{base_url}?qa=1&scene={scene}&capture=1"

    # 设置视口
    mid[0] += 1
    send_cdp(ws, "Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": 1,
        "mobile": width < 768,
    }, mid[0])

    # 导航
    mid[0] += 1
    send_cdp(ws, "Page.navigate", {"url": url}, mid[0])

    # 等待内容就绪
    ok, reason = wait_for_content(ws, scene_config, mid)
    if not ok:
        print(f"  FAIL {scene}-{vp_name}: {reason}")
        # 仍然截图作为证据
        filepath = os.path.join(output_dir, f"{scene}-{vp_name}.jpg")
        size = capture_screenshot(ws, filepath, mid)
        # 截图 size <= 0 也标记 FAIL
        if size <= 0:
            reason = f"{reason}; 截图写入失败(size={size})"
        return False, reason, size, None

    # 截图
    filepath = os.path.join(output_dir, f"{scene}-{vp_name}.jpg")
    size = capture_screenshot(ws, filepath, mid)

    # size <= 0 标记 FAIL
    if size <= 0:
        print(f"  FAIL {scene}-{vp_name}: 截图写入失败(size={size})")
        return False, "截图写入失败(size=0)", size, None

    print(f"  OK {scene}-{vp_name}.jpg ({size} bytes) — {reason}")

    # 滚动证据
    bottom_result = None
    if scene in SCROLL_SCENES:
        scroll_ok, scroll_reason = scroll_and_verify(ws, scene, mid)
        bottom_path = os.path.join(output_dir, f"{scene}-{vp_name}-bottom.jpg")
        bottom_size = capture_screenshot(ws, bottom_path, mid)
        # bottom size <= 0 也标记 FAIL
        if bottom_size <= 0:
            scroll_ok = False
            scroll_reason = f"{scroll_reason}; 截图写入失败(size={bottom_size})"
        status = "PASS" if scroll_ok else "FAIL"
        print(f"  {status} {scene}-{vp_name}-bottom.jpg ({bottom_size} bytes) — {scroll_reason}")
        bottom_result = {
            "status": status,
            "reason": scroll_reason,
            "size": bottom_size,
        }

    return True, reason, size, bottom_result


# ── 主流程 ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Stage 7 Visual QA 截图脚本")
    parser.add_argument("--output-dir", default=None,
                        help="截图输出目录（默认: <项目根>/docs/screenshots/stage7）")
    parser.add_argument("--base-url", default=None,
                        help="QA 夹具 Web 地址（默认: http://127.0.0.1:8082）")
    parser.add_argument("--cdp-port", type=int, default=None,
                        help="CDP 调试端口（默认: 自动检测）")
    parser.add_argument("--negative-test", action="store_true",
                        help="负向验证模式：用不存在的期望文字确认失败路径可用")
    args = parser.parse_args()

    # 参数优先级：命令行 > 环境变量 > 默认值
    output_dir = args.output_dir or os.environ.get("QA_OUTPUT_DIR") or DEFAULT_OUTPUT_DIR
    base_url = args.base_url or os.environ.get("QA_BASE_URL") or DEFAULT_BASE_URL
    cdp_port = args.cdp_port or (
        int(os.environ["QA_CDP_PORT"]) if os.environ.get("QA_CDP_PORT") else None
    )

    # CDP 端口检测
    if cdp_port is None:
        cdp_port = detect_cdp_port(DEFAULT_CDP_PORTS)
    if cdp_port is None:
        tried = ", ".join(str(p) for p in DEFAULT_CDP_PORTS)
        print(f"ERROR: Cannot find CDP port. Tried: {tried}")
        print("提示: 使用 --cdp-port 指定端口，或设置 QA_CDP_PORT 环境变量")
        sys.exit(1)

    print(f"CDP port:    {cdp_port}")
    print(f"Base URL:    {base_url}")
    print(f"Output dir:  {output_dir}")

    os.makedirs(output_dir, exist_ok=True)

    ws_url = get_page_ws(cdp_port)
    print(f"Connecting to: {ws_url}")
    ws = websocket.create_connection(ws_url, timeout=30)

    mid = [0]
    send_cdp(ws, "Page.enable", {}, mid[0]); mid[0] += 1

    # 负向验证模式：仅跑2个场景，故意设置不存在的期望文字
    if args.negative_test:
        test_scenes = [
            {"name": "inventory-empty", "expect": ["这段文字绝对不存在于页面上_xyzzy_42"], "forbid": []},
            {"name": "inventory-content", "expect": ["共 4 件产品", "威猛先生"], "forbid": []},
        ]
        print("\n=== 负向验证模式 ===")
        print("场景1 期望文字故意不存在 → 应 FAIL")
        print("场景2 正常 → 应 PASS（验证后续场景继续执行）")
        scenes_to_run = test_scenes
    else:
        scenes_to_run = SCENES

    results = {}
    has_failure = False

    for scene_config in scenes_to_run:
        scene = scene_config["name"]
        print(f"\n--- {scene} ---")
        results[scene] = {}
        for vp_name, width, height in VIEWPORTS:
            try:
                ok, reason, size, bottom_result = capture_scene(
                    ws, scene_config, vp_name, width, height, mid, output_dir, base_url
                )
            except Exception as e:
                # 单场景异常：记录 FAIL，继续跑剩余场景
                ok = False
                reason = f"异常: {type(e).__name__}: {e}"
                size = 0
                bottom_result = None
                print(f"  EXCEPTION {scene}-{vp_name}: {reason}")

            results[scene][vp_name] = {
                "status": "PASS" if ok else "FAIL",
                "reason": reason,
                "size": size,
            }
            if not ok:
                has_failure = True
            if bottom_result is not None:
                results[scene][f"{vp_name}-bottom"] = bottom_result
                if bottom_result["status"] == "FAIL":
                    has_failure = True

    ws.close()

    # 汇总
    print("\n\n=== QA Screenshot Summary ===")
    total = 0
    passed = 0
    failed = 0
    for scene, vps in results.items():
        for vp, info in vps.items():
            total += 1
            if info["status"] == "PASS":
                passed += 1
            else:
                failed += 1
                print(f"  FAILED: {scene}/{vp}: {info['reason']}")
    print(f"Total: {total}, Passed: {passed}, Failed: {failed}")

    results_path = os.path.join(output_dir, "screenshot-results.json")
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nResults saved to: {results_path}")

    # 非零退出码：有 FAIL 时 CI 可感知
    sys.exit(1 if has_failure else 0)


if __name__ == "__main__":
    main()
