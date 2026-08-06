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

# 返回监听指定端口的进程 PID（无则输出空）。
# PID 文件记录的是 uv 父进程，真正绑定端口的是其 python 子进程，
# 因此停止后必须按端口确认监听者是否已退出。
port_listener_pid() {
  local port="$1"
  local pid=""
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    if [[ -n "$pid" ]]; then
      echo "$pid"
      return 0
    fi
  fi
  if command -v ss >/dev/null 2>&1; then
    # 非 root 时 ss 无法显示其他用户进程的 PID，尽力而为
    pid="$(ss -ltnp 2>/dev/null | awk -v port=":$port" '$4 ~ port "$" { match($0, /pid=[0-9]+/); if (RSTART) { print substr($0, RSTART + 4, RLENGTH - 4); exit } }')"
    echo "$pid"
  fi
}

# 终止占用指定端口的本服务残留进程；返回 0 表示端口已释放（无残留或已清理）
stop_port_residue() {
  local port="$1"
  local listener
  listener="$(port_listener_pid "$port")"
  if [[ -z "$listener" ]]; then
    return 0
  fi
  local lcmd
  lcmd="$(ps -p "$listener" -o command= 2>/dev/null || true)"
  if [[ "$lcmd" == *"app.main"* ]]; then
    echo "端口 $port 仍被本服务残留进程 (PID $listener) 占用，强制终止..."
    kill_tree "$listener"
    sleep 1
    if [[ -z "$(port_listener_pid "$port")" ]]; then
      return 0
    fi
  else
    echo "警告: 端口 $port 被其他进程 (PID $listener: $lcmd) 占用，未自动处理" >&2
    return 1
  fi
  return 1
}

# 兜底清理未被 PID 文件覆盖的残留服务进程。
# start.sh 在端口被占时拒绝启动且不写 PID 文件，若此时残留进程仍在，
# 仅按 PID 文件清理会形成死锁，因此必须按进程特征扫描清理。
cleanup_residue() {
  local p
  local any=0
  for p in $(pgrep -f "app.main" 2>/dev/null || true); do
    if ! kill -0 "$p" 2>/dev/null; then
      continue
    fi
    any=1
    echo "发现未管理的残留服务进程 (PID $p)，正在终止..."
    kill_tree "$p"
  done
  if [[ $any -eq 1 ]]; then
    for _ in $(seq 1 20); do
      local alive=0
      for p in $(pgrep -f "app.main" 2>/dev/null || true); do
        if kill -0 "$p" 2>/dev/null; then
          alive=1
        fi
      done
      [[ $alive -eq 0 ]] && break
      sleep 0.5
    done
    echo "残留进程清理完成"
  fi
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
  # 主进程（uv）退出后，uvicorn 子进程可能仍在优雅关闭，
  # 必须等待端口真正释放，避免重启时误判端口被占用。
  for _ in $(seq 1 20); do
    if [[ -z "$(port_listener_pid "$port")" ]]; then
      rm -f "$pid_file"
      echo "已停止"
      return 0
    fi
    sleep 0.5
  done

  # 端口仍被占用：先强杀主进程，再按端口定位残留监听进程并清理
  if kill -0 "$pid" 2>/dev/null; then
    echo "进程未正常退出，强制结束..."
    kill -KILL "$pid" 2>/dev/null || true
  fi
  if stop_port_residue "$port"; then
    rm -f "$pid_file"
    echo "已停止"
    return 0
  fi
  rm -f "$pid_file"
  return 1
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
  # PID 文件指向的进程可能已死，但端口上可能仍有本服务残留进程
  stop_port_residue "$port"
  echo "PID 文件已过期或进程不存在，已清理: $pid_file"
done

# 兜底清理未被 PID 文件覆盖的残留服务进程
cleanup_residue

if [[ $found -eq 0 ]]; then
  echo "未找到运行中的服务"
fi
exit 0
