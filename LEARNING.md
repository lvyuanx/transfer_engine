# 开发复盘

## 已验证结论

- FastAPI `StaticFiles` 可直接提供 ES module 脚本，页面入口需使用
  `<script type="module">` 以支持模块导入。
- `app.main.create_app` 已被测试和启动流程使用；重构时应保持该导入入口稳定。
- 前端模块之间以 `CustomEvent("upload-request")` 通知目录上传目标，可避免文件树和上传
  模块形成循环依赖。
