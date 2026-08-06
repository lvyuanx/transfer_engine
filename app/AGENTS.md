# app 模块

## 模块简介

提供 LAN Transfer 后端应用：文件共享 REST API、公共聊天 WebSocket 和静态资源服务。

## 目录说明

- `main.py`：应用工厂、全部路由与 CLI 启动。
- `file_tree.py`：路径安全、目录列表与 zip 构建。
- `file_ops.py`：上传、建目录、删除。
- `chat.py`：WebSocket 连接、广播和在线状态。
- `chat_store.py`：聊天消息 SQLite 存储和分页。
- `static/`：前端静态资源。

## 数据流

HTTP/WS 请求进入 `create_app()` 的路由；文件请求经 `safe_resolve` 后操作共享目录，聊天消息
经 `ChatRoom` 持久化并广播。文件操作结果同样经 ChatRoom 作为系统消息发送。

## 注意事项

不得绕过 `safe_resolve`；聊天存储为可选项，`chat_db=None` 时历史接口返回空页。
