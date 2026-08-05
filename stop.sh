#!/usr/bin/env bash
#
# 停止 LAN Transfer 服务
#
# 用法: ./stop.sh [--port 9000]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT=8000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      [[ $# -ge 2 ]] || { echo "错误: --port 需要一个参数" >&2; exit 1; }
      PORT="$2"
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      shift
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 1
      ;;
  esac
done

LOG_DIR="$ROOT/logs"
PID_FILE="$LOG_DIR/server-${PORT}.pid"

# 先终止子进程，再终止主进程
kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

stop_pid() {
  local pid="$1"
  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ -z "$cmd" ]]; then
    echo "PID $pid 不存在"
    return 1
  fi
  # 确认是本服务，避免误杀其他进程
  if [[ "$cmd" != *"app.main"* ]]; then
    echo "警告: PID $pid ($cmd) 不是 LAN Transfer 服务，跳过" >&2
    return 1
  fi

  echo "正在停止 LAN Transfer (PID $pid, 端口 $PORT)..."
  kill_tree "$pid"
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "已停止"
      return 0
    fi
    sleep 0.5
  done

  echo "进程未正常退出，强制结束..."
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "已强制停止"
  return 0
}

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$PID" ]] && stop_pid "$PID"; then
    exit 0
  fi
  rm -f "$PID_FILE"
  echo "PID 文件已过期或进程不存在，已清理: $PID_FILE"
fi

echo "未找到运行中的服务 (端口 $PORT)"
exit 0
