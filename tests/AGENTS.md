# tests 模块

## 模块简介

使用 pytest 和 FastAPI TestClient 覆盖 API、聊天、SQLite 存储、文件操作与路径安全。

## 注意事项

所有文件与数据库测试都使用 `tmp_path`，不得读取或修改仓库的 `shared/`、`data/`。
修改接口或模块边界时同步维护对应测试。
