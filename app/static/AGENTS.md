# static 模块

## 模块简介

无构建依赖的单页前端，提供文件树、上传进度和公共聊天界面。

## 目录说明

- `index.html`：页面结构。
- `styles.css`：全部视觉样式。
- `share.css`：独立分享下载页样式。
- `app.js`：模块入口，只负责启动。
- `js/icons.js`：图标（含 `folder-upload` 上传文件夹图标；`share` 为实心参考 SVG 独立分支）。
- `js/utils.js`：通用格式化工具。
- `js/tree.js`：文件树和文件操作。
- `js/upload.js`：XHR 上传和进度。工具栏「上传」传文件、「上传文件夹」按钮（`webkitdirectory`）
  按 `webkitRelativePath` 保留子目录结构上传；目录行有独立「上传子文件夹」按钮
  （`folder-upload-request` 事件），文件/文件夹均可上传到任意目录。
- `js/chat.js`：WebSocket 聊天、历史分页、用户名 localStorage 缓存，以及基于用户名 hash 的随机头像分配（`avatarIndex()`）。
- `js/modal.js`：统一样式弹窗（提示 / 确认 / 输入 / 分享配置），替代浏览器原生弹窗。支持 `inputType: "password"` 密码输入框、加密开关（`switch`）与分段控件（`radios`）；`onSubmit` 接收收集到的状态对象。
- `js/share.js`：分享弹窗与链接复制（POST `/api/shares` 后复制完整 URL）。
- `icons/avatars/`：10 个 48×48 动物头像 SVG（橘猫、柴犬、狐狸、熊猫、兔子、青蛙、企鹅、仓鼠、猫头鹰、小恐龙），由用户名 hash 映射，同用户头像固定。

## 加密文件夹

加密文件夹通过密码访问控制：创建时设置密码（PBKDF2-SHA256 哈希存储于 `.vault_meta`），
解锁后获得访问令牌，后续对该文件夹内文件的操作需携带令牌。

后端：`app/vault.py` 提供 VaultStore 管理密码验证和令牌签发；API 端点 `POST /api/vaults`、
`POST /api/vaults/unlock`；现有端点均增加 `token` 参数校验。

前端：加密文件夹在文件树中显示锁图标（warn 色），点击弹出密码输入框解锁。

## 分享

- 文件树中普通文件/文件夹、已解锁加密文件夹行均有分享按钮（`tree.js` 传入 `getVaultToken(path)`）。
- 分享弹窗（`js/share.js` + `modal.js` 的 `radios` 分段控件）：加密开关 + 密码输入 + 时效
  1天/7天/永久（默认永久）；点击「复制链接」创建分享并复制完整 URL 后关闭。
- 分享链接 `/s/{id}` 直接返回文件流下载（文件或目录 zip），不做 `fetch+blob` 以免大文件撑爆内存；
  加密分享由后端返回 401 + `WWW-Authenticate: Basic`，浏览器弹原生认证框输入访问密码。
- 分享链接不存在/失效时返回标准 404（空响应体，浏览器原生 404），不渲染提示页。
- `share.css` 仅服务分享需密码（认证取消后）的提示页样式。

## 数据流

文件树和上传通过 REST `/api/*` 通信；聊天通过 `/ws/chat`。目录上传请求以
`upload-request` 自定义事件从树模块传给上传模块，避免循环依赖。

## 注意事项

用户内容使用 `textContent` 渲染。上传必须保留 XMLHttpRequest，以获得上传进度。聊天用户名通过 localStorage（键 `lan_chat_name`）缓存，连接时自动恢复。
