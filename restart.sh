#!/usr/bin/env bash
#
# 重启 LAN Transfer 服务
#
# 用法: ./restart.sh [--port 9000] [--shared-dir /path/to/share] [--chat-db /path/to/chat.db]
# 不指定参数时，复用 start.sh 缓存的启动参数
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "正在停止现有服务..."
"$ROOT/stop.sh"

echo "正在重新启动服务..."
"$ROOT/start.sh" "$@"
