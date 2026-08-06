# static 模块

## 模块简介

无构建依赖的单页前端，提供文件树、上传进度和公共聊天界面。

## 目录说明

- `index.html`：页面结构。
- `styles.css`：全部视觉样式。
- `app.js`：模块入口，只负责启动。
- `js/icons.js`：图标。
- `js/utils.js`：通用格式化工具。
- `js/tree.js`：文件树和文件操作。
- `js/upload.js`：XHR 上传和进度。
- `js/chat.js`：WebSocket 聊天、历史分页、用户名 localStorage 缓存，以及基于用户名 hash 的随机头像分配（`avatarIndex()`）。
- `js/modal.js`：统一样式弹窗（提示 / 确认 / 输入），替代浏览器原生弹窗。
- `icons/avatars/`：10 个 48×48 动物头像 SVG（橘猫、柴犬、狐狸、熊猫、兔子、青蛙、企鹅、仓鼠、猫头鹰、小恐龙），由用户名 hash 映射，同用户头像固定。

## 数据流

文件树和上传通过 REST `/api/*` 通信；聊天通过 `/ws/chat`。目录上传请求以
`upload-request` 自定义事件从树模块传给上传模块，避免循环依赖。

## 注意事项

用户内容使用 `textContent` 渲染。上传必须保留 XMLHttpRequest，以获得上传进度。聊天用户名通过 localStorage（键 `lan_chat_name`）缓存，连接时自动恢复。
