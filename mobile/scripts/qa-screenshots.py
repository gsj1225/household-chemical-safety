"""
Stage 7 Visual QA — 自动化截图脚本

通过 CDP 对 QA 夹具的每个场景在指定视口下截图。
"""

import websocket
import json
import base64
import time
import httpx
import os
import sys

# CDP endpoint
CDP_PORT = 58264
OUTPUT_DIR = r"D:\lingxi\lingxi-claw\20260710-20-42-12-237\docs\screenshots\stage7"
BASE_URL = "http://127.0.0.1:8082"

# Viewports
VIEWPORTS = [
    ("320x568", 320, 568),
    ("390x844", 390, 844),
    ("520x844", 520, 844),
    ("1280x900", 1280, 900),
]

# All 24 scenes
SCENES = [
    # 仓库 (5)
    "inventory-empty",
    "inventory-content",
    "inventory-loading",
    "inventory-error",
    "inventory-no-results",
    # 入库 (5)
    "intake-review-normal",
    "intake-category-unknown",
    "intake-conflict",
    "intake-permission-denied",
    "intake-partial-success",
    # 详情 (5)
    "detail-full",
    "detail-minimal",
    "detail-long-text",
    "detail-loading",
    "detail-error",
    # 编辑 (2)
    "edit-form",
    "edit-unsaved-dialog",
    # 删除确认 (1)
    "detail-delete-dialog",
    # 相容性 (6)
    "compat-critical",
    "compat-attention",
    "compat-unknown",
    "compat-empty",
    "compat-loading",
    "compat-error",
]

def get_page_ws():
    """Get the WebSocket URL for the first page target."""
    r = httpx.get(f"http://127.0.0.1:{CDP_PORT}/json/list", timeout=5)
    targets = r.json()
    for t in targets:
        if t.get("type") == "page":
            return t["webSocketDebuggerUrl"]
    raise RuntimeError("No page target found")

def send_cdp(ws, method, params=None, msg_id=1):
    """Send a CDP command and return the result."""
    msg = {"id": msg_id, "method": method}
    if params:
        msg["params"] = params
    ws.send(json.dumps(msg))
    while True:
        resp = json.loads(ws.recv())
        if resp.get("id") == msg_id:
            return resp

def capture_scene(ws, scene, viewport_name, width, height, msg_id_counter):
    """Navigate to a scene, set viewport, and capture screenshot."""
    url = f"{BASE_URL}?qa=1&scene={scene}"
    
    # Set device metrics
    msg_id_counter[0] += 1
    send_cdp(ws, "Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": 1,
        "mobile": width < 768,
    }, msg_id_counter[0])
    
    # Navigate
    msg_id_counter[0] += 1
    send_cdp(ws, "Page.navigate", {"url": url}, msg_id_counter[0])
    
    # Wait for page to load (detail/edit scenes need API mock + render)
    wait_time = 5 if scene.startswith(("detail-", "edit-")) else 3
    time.sleep(wait_time)
    
    # Capture screenshot
    msg_id_counter[0] += 1
    resp = send_cdp(ws, "Page.captureScreenshot", {
        "format": "jpeg",
        "quality": 90,
    }, msg_id_counter[0])
    
    if "result" in resp and "data" in resp["result"]:
        img_data = base64.b64decode(resp["result"]["data"])
        filename = f"{scene}-{viewport_name}.jpg"
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(img_data)
        print(f"  OK {filename} ({len(img_data)} bytes)")
        return True
    else:
        print(f"  FAIL {scene}-{viewport_name}: Failed to capture")
        return False

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    ws_url = get_page_ws()
    print(f"Connecting to: {ws_url}")
    ws = websocket.create_connection(ws_url, timeout=30)
    
    # Enable Page domain for navigation events
    msg_id_counter = [0]
    msg_id_counter[0] += 1
    send_cdp(ws, "Page.enable", {}, msg_id_counter[0])
    
    results = {}
    
    for scene in SCENES:
        print(f"\n--- {scene} ---")
        results[scene] = {}
        for vp_name, width, height in VIEWPORTS:
            ok = capture_scene(ws, scene, vp_name, width, height, msg_id_counter)
            results[scene][vp_name] = "PASS" if ok else "FAIL"
    
    ws.close()
    
    # Print summary
    print("\n\n=== QA Screenshot Summary ===")
    total = 0
    passed = 0
    for scene, vps in results.items():
        for vp, status in vps.items():
            total += 1
            if status == "PASS":
                passed += 1
    print(f"Total: {total}, Passed: {passed}, Failed: {total - passed}")
    
    # Save results as JSON
    results_path = os.path.join(OUTPUT_DIR, "screenshot-results.json")
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nResults saved to: {results_path}")

if __name__ == "__main__":
    main()
