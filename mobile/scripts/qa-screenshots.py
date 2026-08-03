"""
Stage 7 Visual QA — 自动化截图脚本（v2）

通过 CDP 对 QA 夹具的每个场景在指定视口下截图。
每个场景配置期望文字和禁止文字，等待期望内容出现后才截图。
出现禁止内容则标记 FAIL。
"""

import websocket
import json
import base64
import time
import httpx
import os
import sys

# 自动检测 CDP 端口
CDP_PORT = None
for _port in [50194, 58264, 58664]:
    try:
        r = httpx.get(f"http://127.0.0.1:{_port}/json/list", timeout=2)
        if r.status_code == 200:
            CDP_PORT = _port
            break
    except Exception:
        pass
if CDP_PORT is None:
    print("ERROR: Cannot find CDP port. Tried 50194, 58264, 58664")
    sys.exit(1)
print(f"Using CDP port: {CDP_PORT}")
OUTPUT_DIR = r"D:\lingxi\lingxi-claw\20260710-20-42-12-237\docs\screenshots\stage7"
BASE_URL = "http://127.0.0.1:8082"

VIEWPORTS = [
    ("320x568", 320, 568),
    ("390x844", 390, 844),
    ("520x844", 520, 844),
    ("1280x900", 1280, 900),
]

# 场景配置：期望文字（全部出现才PASS）、禁止文字（任何出现即FAIL）
# "产品不存在" 全局禁止；"加载失败" 仅在非错误场景禁止
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

def get_page_ws():
    r = httpx.get(f"http://127.0.0.1:{CDP_PORT}/json/list", timeout=5)
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

def scroll_to_bottom(ws, mid):
    # React Native Web ScrollView renders as a div with overflowY:auto/scroll
    # Find all divs and check computed style for scrollable containers
    mid[0] += 1
    send_cdp(ws, "Runtime.evaluate", {
        "expression": """
            (function() {
                var all = document.querySelectorAll('div');
                var scrolled = 0;
                all.forEach(function(el) {
                    var style = window.getComputedStyle(el);
                    var oy = style.overflowY;
                    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
                        el.scrollTop = el.scrollHeight;
                        scrolled++;
                    }
                });
                return scrolled + ' containers scrolled';
            })()
        """
    }, mid[0])
    time.sleep(2)

def capture_scene(ws, scene_config, vp_name, width, height, mid):
    scene = scene_config["name"]
    url = f"{BASE_URL}?qa=1&scene={scene}&capture=1"

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
        filepath = os.path.join(OUTPUT_DIR, f"{scene}-{vp_name}.jpg")
        size = capture_screenshot(ws, filepath, mid)
        return False, reason, size

    # 截图
    filepath = os.path.join(OUTPUT_DIR, f"{scene}-{vp_name}.jpg")
    size = capture_screenshot(ws, filepath, mid)
    print(f"  OK {scene}-{vp_name}.jpg ({size} bytes) — {reason}")

    # 滚动证据
    if scene in SCROLL_SCENES:
        scroll_to_bottom(ws, mid)
        bottom_path = os.path.join(OUTPUT_DIR, f"{scene}-{vp_name}-bottom.jpg")
        bottom_size = capture_screenshot(ws, bottom_path, mid)
        print(f"  OK {scene}-{vp_name}-bottom.jpg ({bottom_size} bytes) — 滚动到底部")

    return True, reason, size

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    ws_url = get_page_ws()
    print(f"Connecting to: {ws_url}")
    ws = websocket.create_connection(ws_url, timeout=30)

    mid = [0]
    send_cdp(ws, "Page.enable", {}, mid[0]); mid[0] += 1

    results = {}

    for scene_config in SCENES:
        scene = scene_config["name"]
        print(f"\n--- {scene} ---")
        results[scene] = {}
        for vp_name, width, height in VIEWPORTS:
            ok, reason, size = capture_scene(ws, scene_config, vp_name, width, height, mid)
            results[scene][vp_name] = {
                "status": "PASS" if ok else "FAIL",
                "reason": reason,
                "size": size,
            }

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
                print(f"  FAILED: {scene}-{vp}: {info['reason']}")
    print(f"Total: {total}, Passed: {passed}, Failed: {failed}")

    results_path = os.path.join(OUTPUT_DIR, "screenshot-results.json")
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nResults saved to: {results_path}")

if __name__ == "__main__":
    main()
