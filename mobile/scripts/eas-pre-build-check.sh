#!/usr/bin/env bash
# EAS 构建前检查
#
# 用法：
#   ./scripts/eas-pre-build-check.sh
#
# 检测内容：
#   1. eas.json 中不得包含 PLACEHOLDER（API 地址和演示令牌必须已配置）
#   2. EXPO_PUBLIC_API_BASE_URL 必须以 https:// 开头
#   3. EXPO_PUBLIC_DEMO_ACCESS_TOKEN 不得为空

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EAS_JSON="${SCRIPT_DIR}/../eas.json"

if [ ! -f "$EAS_JSON" ]; then
  echo "ERROR: eas.json not found at $EAS_JSON" >&2
  exit 1
fi

ERRORS=0

# 1. 检测 PLACEHOLDER
if grep -q "PLACEHOLDER" "$EAS_JSON"; then
  echo "========================================" >&2
  echo "ERROR: eas.json contains PLACEHOLDER values." >&2
  echo "" >&2
  echo "EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_DEMO_ACCESS_TOKEN" >&2
  echo "must be set to real values before building the APK." >&2
  echo "" >&2
  echo "Found:" >&2
  grep -n "PLACEHOLDER" "$EAS_JSON" >&2
  echo "========================================" >&2
  ERRORS=$((ERRORS + 1))
fi

# 2. 检测 HTTPS
if grep -o '"EXPO_PUBLIC_API_BASE_URL"[[:space:]]*:[[:space:]]*"[^"]*"' "$EAS_JSON" | grep -qv 'https://'; then
  echo "ERROR: EXPO_PUBLIC_API_BASE_URL must start with https://" >&2
  grep -n "EXPO_PUBLIC_API_BASE_URL" "$EAS_JSON" >&2
  ERRORS=$((ERRORS + 1))
fi

# 3. 检测演示令牌非空（排除 PLACEHOLDER 后检查）
if ! grep -q "PLACEHOLDER" "$EAS_JSON"; then
  TOKEN=$(grep -o '"EXPO_PUBLIC_DEMO_ACCESS_TOKEN"[[:space:]]*:[[:space:]]*"[^"]*"' "$EAS_JSON" | sed 's/.*: *"\(.*\)"/\1/')
  if [ -z "$TOKEN" ]; then
    echo "ERROR: EXPO_PUBLIC_DEMO_ACCESS_TOKEN is empty" >&2
    ERRORS=$((ERRORS + 1))
  fi
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "" >&2
  echo "Total errors: $ERRORS. Fix before building." >&2
  exit 1
fi

echo "OK: eas.json is ready for EAS Build."
echo "  API URL: https (verified)"
echo "  Demo token: configured"
exit 0
