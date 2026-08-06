# 项目进度

## 已完成

- 增加根目录 AGENTS.md，定义通用开发与文档维护规范。
- 已确认 AGENTS.md 合规重构设计，设计文档已提交。
- 创建 PROJECT_AGENTS.md、CLAUDE.md、MEMORY.md、LEARNING.md、WIKI.md。
- 创建 app、前端、测试与脚本模块 AGENTS.md。
- 将前端 825 行脚本拆分为 ES Modules，并移除未使用的 httpx2 依赖。
- 新增「分享」功能：文件/文件夹可生成带时效（1天/7天/永久）的下载链接，支持链接访问密码
  （分享页输入密码后下载，文件夹下载为 zip）；记录持久化到 `data/shares.json`，重启后仍有效。
  新增 `app/passwords.py`、`app/share.py`、`js/share.js`、`share.css`。
- 单元测试 65 项通过，所有 Python/JavaScript 文件均不超过 500 行。

## 进行中

- 无。

## 后续计划

- 后续新增或调整模块时，同步维护模块 AGENTS.md 与项目知识文件。
- 分享过期记录暂不主动清理（访问时拒绝即可），可作可选优化。

## 阻塞问题

- 无。
