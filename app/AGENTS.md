# app 模块

## 模块简介

提供 LAN Transfer 后端应用：文件共享 REST API、公共聊天 WebSocket、静态资源服务与独立分享下载页。

## 目录说明

- `main.py`：应用工厂、全部路由与 CLI 启动。
- `file_tree.py`：路径安全、目录列表与 zip 构建。
- `file_ops.py`：上传（含文件夹嵌套路径 `save_upload_path`）、建目录、删除。
- `vault.py`：加密文件夹的密码验证与访问令牌。
- `passwords.py`：PBKDF2-SHA256 密码哈希，vault 与 share 共用。
- `share.py`：分享记录（JSON 持久化）与独立分享页渲染。
- `chat.py`：WebSocket 连接、广播、在线状态与消息撤回（`recall_message`）。
- `chat_store.py`：聊天消息 SQLite 存储、分页与撤回标记（`recalled` 列）。
- `static/`：前端静态资源。

## 数据流

HTTP/WS 请求进入 `create_app()` 的路由；文件请求经 `safe_resolve` 后操作共享目录，聊天消息
经 `ChatRoom` 持久化并广播。文件操作结果同样经 ChatRoom 作为系统消息发送。

## 分享功能

- 创建分享 `POST /api/shares`：若路径位于加密文件夹内，**必须校验 vault token**，否则会成为绕过加密文件夹密码的通道。
- 分享链接 `GET /s/{share_id}`：直接返回文件流（文件或目录 zip，attachment 下载），**不校验 vault token**（分享即显式授权）。
- 加密分享使用 HTTP Basic Auth：无凭据或密码错误返回 401 + `WWW-Authenticate: Basic`，由浏览器弹原生认证框。
- 分享 id（`token_urlsafe(12)`）为 bearer 能力，创建分享**不广播系统消息**，避免链接泄露到公共聊天。
- 分享记录持久化到 `data/shares.json`（CLI `--shares-db` 指定），过期由 `created_at + expires_days` 推导。

## 注意事项

不得绕过 `safe_resolve`；聊天存储为可选项，`chat_db=None` 时历史接口返回空页；
分享密码经 Basic Auth 传输（base64，明文信道）、无速率限制，属局域网工具的已知限制。
上传文件夹时文件名携带相对路径（含 `/`），由 `save_upload_path` 逐级校验并创建目录，
禁止穿越与隐藏文件；上传结果作为系统消息广播。
