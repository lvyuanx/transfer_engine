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

## 启动/停止脚本

`start.sh` 记录到 PID 文件的是 **uv 父进程**，而真正绑定端口的是其 **python 子进程**
（`uv run` 不会 exec 替换自身）。因此 `stop.sh` 不能仅以主进程退出作为停止成功的标志，
必须等待端口真正释放，并按端口特征（`app.main`）清理残留子进程；`cleanup_residue`
兜底扫描系统中所有本服务残留进程，避免端口被占时 start 拒绝启动且无 PID 文件可清的死锁。
