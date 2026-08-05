#!/usr/bin/env bash
#
# 后台启动 LAN Transfer 服务
#
# 用法: ./start.sh [--port 9000] [--shared-dir /path/to/share] [--chat-db /path/to/chat.db]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT=8000
APP_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      [[ $# -ge 2 ]] || { echo "错误: --port 需要一个参数" >&2; exit 1; }
      PORT="$2"
      APP_ARGS+=("$1" "$2")
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      APP_ARGS+=("$1")
      shift
      ;;
    *)
      APP_ARGS+=("$1")
      shift
      ;;
  esac
done

# 找到 uv 的完整路径。sudo 下 PATH 通常不含用户的 ~/.local/bin，
# 所以需要探测常见安装位置。
find_uv() {
  if command -v uv >/dev/null 2>&1; then
    command -v uv
    return 0
  fi

  local candidates=()
  # sudo 时优先找发起 sudo 的用户安装的 uv
  if [[ -n "${SUDO_USER:-}" ]]; then
    local user_home
    user_home="$(getent passwd "$SUDO_USER" 2>/dev/null | cut -d: -f6 || true)"
    if [[ -n "$user_home" ]]; then
      candidates+=("$user_home/.local/bin/uv" "$user_home/.cargo/bin/uv")
    fi
  fi

  candidates+=(
    "$HOME/.local/bin/uv"
    "$HOME/.cargo/bin/uv"
    /usr/local/bin/uv
    /opt/homebrew/bin/uv
    /usr/bin/uv
  )

  local c
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

UV="$(find_uv || true)"
if [[ -z "$UV" ]]; then
  echo "错误: 未找到 uv，请先安装 https://docs.astral.sh/uv/" >&2
  echo "如果正在使用 sudo，也可以先执行：sudo ln -s "$(command -v uv)" /usr/local/bin/uv" >&2
  exit 1
fi

LOG_DIR="$ROOT/logs"
PID_FILE="$LOG_DIR/server-${PORT}.pid"
LOG_FILE="$LOG_DIR/server-${PORT}.log"
mkdir -p "$LOG_DIR"

# 已运行则直接退出，避免重复启动
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "服务已在运行 (PID $OLD_PID, 端口 $PORT)"
    echo "如需重启，请先执行 ./stop.sh --port $PORT"
    exit 0
  fi
  echo "发现过期的 PID 文件，已清理"
  rm -f "$PID_FILE"
fi

# 端口已被其他进程占用时不再重复拉起
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "端口 $PORT 已有服务在运行（非本脚本管理），请先停止该服务或改用其他端口" >&2
  exit 1
fi

echo "正在后台启动 LAN Transfer (端口 $PORT)..."
nohup "$UV" run python -m app.main "${APP_ARGS[@]}" >>"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

# 等待健康检查通过（最多约 30 秒）
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "启动成功 (PID $PID)"
    echo "日志: $LOG_FILE"
    echo "本机访问: http://127.0.0.1:${PORT}/"
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "启动失败，请查看日志: $LOG_FILE" >&2
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 0.5
done

echo "启动超时，请查看日志: $LOG_FILE" >&2
rm -f "$PID_FILE"
kill -TERM "$PID" 2>/dev/null || true
exit 1
