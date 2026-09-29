#!/bin/sh
# verify 一次性服务入口：
# 1) 等待 web 站点健康检查通过（WEB_URL 指向站点 /healthz）
# 2) 依次执行代码测试、生产构建、归因模块冒烟
# 3) 以退出码整体报告（任一失败即非零）
set -e

WEB_URL="${WEB_URL:-http://web:8080/healthz}"
MAX_WAIT="${HEALTH_WAIT_SECONDS:-120}"

echo "verify: 等待站点健康检查通过 ($WEB_URL)"
i=0
until wget -q -O - "$WEB_URL" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge "$MAX_WAIT" ]; then
    echo "verify: 等待站点健康超时（${MAX_WAIT}s）" >&2
    exit 1
  fi
  sleep 1
done
echo "verify: 站点已健康，开始校验"

echo "── 1/3 单元测试 ────────────────────────────"
npm test

echo "── 2/3 生产构建 ────────────────────────────"
npm run build

echo "── 3/3 归因模块冒烟 ────────────────────────"
npm run smoke

echo "verify: 全部通过（测试 / 构建 / 冒烟）"
