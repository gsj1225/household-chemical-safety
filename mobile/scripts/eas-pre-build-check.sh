#!/usr/bin/env bash
# EAS 构建前检查（eas-build-pre-install 钩子）
#
# 用法：
#   ./scripts/eas-pre-build-check.sh
#
# 检测内容：
#   1. EXPO_PUBLIC_API_BASE_URL 环境变量已设置且以 https:// 开头
#   2. EXPO_PUBLIC_DEMO_ACCESS_TOKEN 环境变量已设置且非空
#
# 环境变量可通过以下方式注入：
#   - EAS Build 环境变量（Expo Dashboard → Build Profiles → Env）
#   - Shell 导出：export EXPO_PUBLIC_API_BASE_URL=https://...
#   - .env 文件（需 dotenv-cli 等工具加载）

set -euo pipefail

ERRORS=0

# 1. 检测 EXPO_PUBLIC_API_BASE_URL
API_URL="${EXPO_PUBLIC_API_BASE_URL:-}"
if [ -z "$API_URL" ]; then
  echo "ERROR: EXPO_PUBLIC_API_BASE_URL is not set." >&2
  echo "  Set it via EAS Build environment variables or:" >&2
  echo "  export EXPO_PUBLIC_API_BASE_URL=https://your-domain/api" >&2
  ERRORS=$((ERRORS + 1))
elif [[ ! "$API_URL" =~ ^https:// ]]; then
  echo "ERROR: EXPO_PUBLIC_API_BASE_URL must start with https://" >&2
  echo "  Current: $API_URL" >&2
  ERRORS=$((ERRORS + 1))
else
  echo "  API URL: $API_URL"
fi

# 2. 检测 EXPO_PUBLIC_DEMO_ACCESS_TOKEN
DEMO_TOKEN="${EXPO_PUBLIC_DEMO_ACCESS_TOKEN:-}"
if [ -z "$DEMO_TOKEN" ]; then
  echo "ERROR: EXPO_PUBLIC_DEMO_ACCESS_TOKEN is not set." >&2
  echo "  Set it via EAS Build environment variables or:" >&2
  echo "  export EXPO_PUBLIC_DEMO_ACCESS_TOKEN=your-token" >&2
  ERRORS=$((ERRORS + 1))
else
  echo "  Demo token: configured (length: ${#DEMO_TOKEN})"
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "" >&2
  echo "Total errors: $ERRORS. Fix before building." >&2
  exit 1
fi

echo "OK: EAS build environment is ready."
exit 0
