#!/usr/bin/env bash
# EAS 构建前占位符检测
#
# 用法：
#   ./scripts/eas-pre-build-check.sh
#
# 检测 eas.json 中的 PLACEHOLDER，发现则立即失败。
# 建议在 eas build 前始终运行。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EAS_JSON="${SCRIPT_DIR}/../eas.json"

if [ ! -f "$EAS_JSON" ]; then
  echo "ERROR: eas.json not found at $EAS_JSON" >&2
  exit 1
fi

if grep -q "PLACEHOLDER" "$EAS_JSON"; then
  echo "========================================" >&2
  echo "ERROR: eas.json contains PLACEHOLDER values." >&2
  echo "" >&2
  echo "EXPO_PUBLIC_API_BASE_URL must be set to a real HTTPS URL" >&2
  echo "before building the APK." >&2
  echo "" >&2
  echo "Found:" >&2
  grep -n "PLACEHOLDER" "$EAS_JSON" >&2
  echo "========================================" >&2
  exit 1
fi

echo "OK: No PLACEHOLDER found in eas.json. Safe to build."
exit 0
