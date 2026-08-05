# LAN Transfer · 局域网互传工具

基于 FastAPI 的局域网文件互传 + 公共聊天小工具。启动后在控制台打印局域网访问网址；打开页面左侧是共享文件的树形列表（可下载文件，文件夹自动打包为 zip），右侧上方显示在线人数，右侧下方是公共聊天区（默认用访客 IP 作为用户名，可自行改名）。

## 功能

- 启动时自动探测局域网 IP 并打印访问地址
- 左侧文件树：文件夹懒加载展开、文件/文件夹均可下载（文件夹下载为 zip）
- 右侧 header：实时在线人数
- 右侧聊天区：公共广播聊天，默认用户名取访客 IP，可改名
- 聊天消息 SQLite 持久化（默认保留 30 天），重启不丢，新连接自动加载最近 100 条，上滑可回看更早消息
- 文件操作：上传（根目录/指定目录）、下载（文件/文件夹 zip）、删除（二次确认）、新建文件夹；每次操作由「系统」在聊天中广播成功/失败消息
- 深色「终端/文件管理器」风格界面，纯静态资源，不依赖外网 CDN

## 快速开始

```bash
uv sync
uv run python -m app.main
```

默认共享目录为 `./shared`（不存在会自动创建），端口 8000。可用参数覆盖：

```bash
uv run python -m app.main --port 9000 --shared-dir /path/to/share --chat-db /path/to/chat.db
```

启动后控制台会打印类似：

```text
本机访问:   http://127.0.0.1:8000/
局域网访问: http://172.16.31.202:8000/
共享目录:   /Users/you/project/shared
```

同一局域网内的设备访问 `http://<本机IP>:<端口>/` 即可下载文件和聊天。

聊天记录默认保存在 `./data/chat.db`（SQLite），30 天前的消息会自动清理；传入
`--chat-db` 可自定义位置。数据库位于共享目录之外，不会被文件树下载。

单个上传文件默认上限 500 MB，可用 `--max-upload-size <MB>` 调整。

## 开发

```bash
uv run pytest          # 单元测试
uv run python scripts/e2e_smoke.py   # 端到端冒烟（真实启动服务器 + HTTP 验证）
```

## 项目结构

```text
app/
  main.py        # FastAPI 应用、路由、启动逻辑
  file_tree.py   # 文件树/路径安全/打包 zip
  chat.py        # 聊天房间与在线人数
  static/        # 前端页面（HTML/CSS/JS）
scripts/
  e2e_smoke.py   # 端到端冒烟脚本
tests/           # 单元测试
shared/          # 默认共享目录（可自行替换）
```
