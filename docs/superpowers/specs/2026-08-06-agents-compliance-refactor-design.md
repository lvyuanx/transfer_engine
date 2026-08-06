# AGENTS.md 合规重构设计

## 目标

在不改变 LAN Transfer 对外功能和 API 行为的前提下，使项目满足新增
`AGENTS.md` 的模块文档、职责单一、单文件规模和依赖清理要求。

## 现状

- 根 `AGENTS.md` 是新增的未跟踪文件，仓库尚无 `PROJECT_AGENTS.md` 与模块级
  `AGENTS.md`。
- `app/main.py` 同时承担应用工厂、路由、聊天端点、系统消息、网络探测和 CLI。
- `app/static/app.js` 为 825 行，超过根规范的 500 行上限。
- `httpx2` 未被代码、测试或文档引用。

## 方案比较

1. 只补模块文档：变更最小，但无法解决文件职责集中和前端规模超限问题。
2. 按职责拆分后端与前端模块：保持 API 和页面行为不变，消除当前所有明确的结构问题。
3. 引入前端构建工具/框架：可获得更完整的工程能力，但会扩大依赖和部署范围，不符合当前
   无构建、无 CDN 的项目定位。

采用方案 2。

## 后端设计

- `app/web.py` 承担 `create_app()`、REST 路由、WebSocket 端点、静态资源挂载与系统消息
  广播。
- `app/network.py` 仅提供 `get_lan_ip()`。
- `app/main.py` 只保留 CLI 参数解析和 uvicorn 启动；重新导出 `create_app` 和
  `get_lan_ip`，维持既有 `from app.main import create_app` 测试/调用兼容。
- 已经边界清楚的 `chat.py`、`chat_store.py`、`file_ops.py`、`file_tree.py` 不改变
  公开函数和行为。

## 前端设计

- `static/index.html` 使用 module script 加载现有 `app.js`。
- `static/app.js` 缩减为启动模块，负责图标注入、文件树初始化和聊天连接。
- 新增 `static/js/`：
  - `utils.js`：DOM 查询、大小/速度/ETA 格式化。
  - `icons.js`：内联 SVG 与扩展名图标映射。
  - `tree.js`：文件树、下载、新建、删除、目录上传事件。
  - `upload.js`：上传队列与 XHR 进度；监听 `upload-request` DOM 自定义事件。
  - `chat.js`：WebSocket、消息、在线状态、历史分页与改名。
- `tree.js` 不直接依赖 `upload.js`，以 `upload-request` 事件解除循环依赖。

## 文档与依赖

- 新增 `PROJECT_AGENTS.md` 记录本项目技术栈、模块边界、API/数据库/运维约定。
- 为 `app/`、`app/static/`、`scripts/`、`tests/` 增加模块 AGENTS.md。
- README 同步新目录结构；从开发依赖移除未使用的 `httpx2`。

## 验收标准

- 所有现有 52 个单元测试继续通过。
- `scripts/e2e_smoke.py` 通过。
- 前端入口、模块脚本及 API 静态资源请求均返回成功。
- 生产代码文件不超过 500 行，且 Python/JavaScript 行宽不超过 120 字符。
- 现有 Python 导入 `from app.main import create_app` 可继续使用。
