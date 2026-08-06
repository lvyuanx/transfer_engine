# 项目知识库

## 架构

`create_app()` 创建 FastAPI 服务并保存共享目录和 ChatRoom 到 `app.state`。文件接口调用
`file_tree`/`file_ops`，聊天接口调用 `ChatRoom`，后者可选用 `ChatStore` 持久化消息。

## 文件安全

客户端路径必须通过 `safe_resolve`；隐藏条目不进入文件列表或 zip 包。上传文件名禁止路径
分隔符、`.`、`..` 和点开头名称。

## 聊天协议

WebSocket 初始化消息为 `init`，实时消息为 `message`，在线列表为 `presence`；客户端可发送
`chat` 和 `set_name`。
