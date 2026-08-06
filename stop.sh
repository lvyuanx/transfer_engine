#!/usr/bin/env bash
#
# 停止 LAN Transfer 服务
#
# 用法: ./stop.sh
# 自动读取 start.sh 生成的 PID 文件 (logs/server-*.pid) 并停止对应服务
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"

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
  local port="$2"
  local pid_file="$3"
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

  echo "正在停止 LAN Transfer (PID $pid, 端口 $port)..."
  kill_tree "$pid"
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      echo "已停止"
      return 0
    fi
    sleep 0.5
  done

  echo "进程未正常退出，强制结束..."
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$pid_file"
  echo "已强制停止"
  return 0
}

found=0
for pid_file in "$LOG_DIR"/server-*.pid; do
  [[ -e "$pid_file" ]] || continue
  found=1
  port="$(basename "$pid_file" | sed 's/^server-//; s/\.pid$//')"
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && stop_pid "$pid" "$port" "$pid_file"; then
    continue
  fi
  rm -f "$pid_file"
  echo "PID 文件已过期或进程不存在，已清理: $pid_file"
done

if [[ $found -eq 0 ]]; then
  echo "未找到运行中的服务"
fi
exit 0
