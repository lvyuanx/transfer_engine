# PROJECT_AGENTS.md

## 项目定位

LAN Transfer 是一个 FastAPI 局域网文件共享与公共聊天工具。前端是无构建依赖的原生
HTML、CSS 与 ES Modules；后端使用 FastAPI、SQLite 和 WebSocket。

## 架构约定

- `app/main.py`：应用工厂、HTTP/WebSocket 路由和 CLI 启动入口。
- `app/file_tree.py`、`app/file_ops.py`：共享目录路径安全与文件操作。
- `app/chat.py`、`app/chat_store.py`：实时聊天与 SQLite 持久化。
- `app/static/`：前端静态资源，`js/` 按职责拆分。

## 对外接口

- REST 接口均以 `/api/` 开头；错误使用 `{"detail": "..."}`。
- 聊天 WebSocket 端点为 `/ws/chat`。
- 所有客户端路径必须使用 `safe_resolve` 验证，禁止绝对路径、路径穿越和符号链接逃逸。
- 上传、下载、建目录、删除的结果均作为「系统」消息广播。

## 运行与测试

- 依赖由 uv 管理；运行 `uv run python -m app.main`。
- 单元测试：`uv run pytest`；端到端冒烟：`uv run python scripts/e2e_smoke.py`。
- 默认共享目录 `shared/`，聊天数据库 `data/chat.db`；均为运行期文件，不提交。
