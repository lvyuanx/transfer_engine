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
- `js/chat.js`：WebSocket 聊天和历史分页。
- `js/modal.js`：统一样式弹窗（提示 / 确认 / 输入），替代浏览器原生弹窗。

## 数据流

文件树和上传通过 REST `/api/*` 通信；聊天通过 `/ws/chat`。目录上传请求以
`upload-request` 自定义事件从树模块传给上传模块，避免循环依赖。

## 注意事项

用户内容使用 `textContent` 渲染。上传必须保留 XMLHttpRequest，以获得上传进度。
