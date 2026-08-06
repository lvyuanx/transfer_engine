# 项目进度

## 已完成

- 增加根目录 AGENTS.md，定义通用开发与文档维护规范。
- 已确认 AGENTS.md 合规重构设计，设计文档已提交。
- 创建 PROJECT_AGENTS.md、CLAUDE.md、MEMORY.md、LEARNING.md、WIKI.md。
- 创建 app、前端、测试与脚本模块 AGENTS.md。
- 将前端 825 行脚本拆分为 ES Modules，并移除未使用的 httpx2 依赖。
- 新增「分享」功能：文件/文件夹可生成带时效（1天/7天/永久）的下载链接，对方访问 `/s/{id}`
  直接返回文件流下载（文件夹为 zip）；加密分享使用 HTTP Basic Auth（浏览器弹原生认证框）。
  记录持久化到 `data/shares.json`，重启后仍有效。新增 `app/passwords.py`、`app/share.py`、
  `js/share.js`、`share.css`。
- 文件树中文件夹行暂不提供下载按钮（原 zip 下载已隐藏，待重做为递归下载方案）。
- 左右面板可拖动分隔条调整宽度（`js/splitter.js`），宽度持久化到 localStorage。
- 支持更换头像：右上角头像按钮弹出 10 个头像选择弹窗，选择后持久化到 localStorage 并更新所有自己消息头像。
- 新增「上传文件夹」功能：工具栏与目录行均有独立「上传文件夹」按钮（`webkitdirectory` 选整个
  文件夹），后端 `save_upload_path` 按相对路径创建子目录并校验，上传结果作为系统消息广播。
- 单元测试 71 项通过，所有 Python/JavaScript 文件均不超过 500 行。

## 进行中

- 无。

## 后续计划

- 后续新增或调整模块时，同步维护模块 AGENTS.md 与项目知识文件。
- 分享过期记录暂不主动清理（访问时拒绝即可），可作可选优化。

## 阻塞问题

- 无。
