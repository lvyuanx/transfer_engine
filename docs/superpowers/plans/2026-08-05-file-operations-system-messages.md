# 文件操作系统消息实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为上传、下载、删除、创建目录补齐后端接口与前端操作，并让每次操作由「系统」用户在聊天中发送成功/失败消息（持久化+实时广播）。

**Architecture:** 在 `app/file_ops.py` 中新增纯文件操作函数（上传/创建目录/删除/校验），在 `app/main.py` 路由中调用并统一写系统消息；`ChatRoom` 提供 `system_message()` 统一入口，复用现有 `ChatStore`/广播。前端在文件树根工具栏和目录/文件行增加操作按钮，调用新 API 并局部刷新。

**Tech Stack:** FastAPI / Starlette / Python 标准库 / 原生前端 JS。

---

## 任务 1：ChatRoom 增加 system_message 与 is_persistence_on

**Files:**
- Modify: `app/chat.py`
- Test: `tests/test_chat.py`

- [ ] **Step 1: 写失败测试**

```python
def test_system_message_persisted_and_broadcast(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    room = app.state.room
    meta = room.system_message("上传了文件「a.txt」")
    assert meta["user"] == "系统"
    assert meta["text"] == "上传了文件「a.txt」"
    assert "id" in meta and "ts" in meta
    assert room.is_persistence_on() is True

    app2 = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    history = app2.state.room.history()
    assert history and history[-1]["user"] == "系统"
    assert history[-1]["text"] == "上传了文件「a.txt」"


def test_system_message_memory_mode_no_persist(tmp_path):
    app = create_app(tmp_path / "shared")
    room = app.state.room
    meta = room.system_message("测试")
    assert room.is_persistence_on() is False
    assert meta["user"] == "系统"
    assert meta["text"] == "测试"
    assert room.history() == []
```

- [ ] **Step 2: 运行确认失败**

Run: `uv run pytest tests/test_chat.py -q`
Expected: FAIL（`system_message` / `is_persistence_on` 不存在）

- [ ] **Step 3: 最小实现**

在 `ChatRoom` 中加入：

```python
def is_persistence_on(self) -> bool:
    return self._store is not None

def system_message(self, text: str) -> dict:
    return self.record_message("系统", text)
```

- [ ] **Step 4: 运行确认通过**

Run: `uv run pytest tests/test_chat.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/chat.py tests/test_chat.py
git commit -m "feat: ChatRoom 支持系统消息"
```

## 任务 2：新增 app/file_ops.py 文件操作函数

**Files:**
- Create: `app/file_ops.py`
- Test: `tests/test_file_ops.py`

- [ ] **Step 1: 写失败测试**

```python
import pytest

from app.file_ops import create_dir, delete_path, validate_upload, save_upload


def test_create_dir_success_and_duplicate(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    path = create_dir(root, "docs")
    assert (root / "docs").is_dir()
    assert path == "docs"
    with pytest.raises(ValueError):
        create_dir(root, "docs")


def test_create_dir_rejects_bad_names(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    for bad in ("", ".", "..", "a/b", "a\\b", ".hidden"):
        with pytest.raises(ValueError):
            create_dir(root, bad)


def test_validate_upload_rejects_bad_name_and_empty(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    with pytest.raises(ValueError):
        validate_upload(root, "docs/../evil.txt", "", 1000)
    with pytest.raises(ValueError):
        validate_upload(root, "evil.txt", "", 10)


def test_save_upload_writes_file(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    saved = save_upload(root, "docs", "a.txt", b"hello", 1024)
    assert saved == "docs/a.txt"
    assert (root / "docs" / "a.txt").read_bytes() == b"hello"


def test_delete_path_file_and_dir(tmp_path):
    root = tmp_path / "shared"
    (root / "a.txt").write_text("x")
    (root / "docs").mkdir()
    (root / "docs" / "b.txt").write_text("y")
    assert delete_path(root, "a.txt") == "a.txt"
    assert not (root / "a.txt").exists()
    assert delete_path(root, "docs") == "docs"
    assert not (root / "docs").exists()


def test_delete_path_rejects_root_and_missing(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    with pytest.raises(ValueError):
        delete_path(root, "")
    with pytest.raises(FileNotFoundError):
        delete_path(root, "missing.txt")
```

- [ ] **Step 2: 运行确认失败**

Run: `uv run pytest tests/test_file_ops.py -q`
Expected: FAIL（模块/函数不存在）

- [ ] **Step 3: 最小实现**

```python
from __future__ import annotations

from pathlib import Path

from .file_tree import safe_resolve


def _valid_name(name: str) -> str:
    name = (name or "").strip().replace("\\", "/")
    if not name or name in {".", ".."} or "/" in name or name.startswith("."):
        raise ValueError("无效的文件名")
    return name


def create_dir(root: Path, name: str) -> str:
    name = _valid_name(name)
    target = safe_resolve(root, "") / name
    if target.exists():
        raise ValueError("同名文件或目录已存在")
    target.mkdir()
    return name


def validate_upload(root: Path, name: str, dir_rel: str, size: int) -> Path:
    name = _valid_name(name)
    folder = safe_resolve(root, dir_rel)
    if not folder.is_dir():
        raise FileNotFoundError("目标目录不存在")
    if size > MAX_UPLOAD_SIZE:
        raise ValueError("文件超过大小限制")
    return folder / name


def save_upload(root: Path, dir_rel: str, name: str, data: bytes, max_size: int) -> str:
    target = validate_upload(root, name, dir_rel, len(data))
    if target.exists():
        raise ValueError("同名文件已存在")
    target.write_bytes(data)
    rel = target.relative_to(safe_resolve(root, "")).as_posix()
    return rel


def delete_path(root: Path, rel: str) -> str:
    target = safe_resolve(root, rel)
    if target == safe_resolve(root, ""):
        raise ValueError("不能删除根目录")
    if not target.exists():
        raise FileNotFoundError("文件或目录不存在")
    if target.is_dir():
        import shutil

        shutil.rmtree(target)
    else:
        target.unlink()
    return (target.relative_to(safe_resolve(root, "")).as_posix() or target.name)


MAX_UPLOAD_SIZE = 500 * 1024 * 1024
```

- [ ] **Step 4: 运行确认通过**

Run: `uv run pytest tests/test_file_ops.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/file_ops.py tests/test_file_ops.py
git commit -m "feat: 文件上传/创建目录/删除操作函数"
```

## 任务 3：API 路由 + 系统消息

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: 写失败测试**

```python
def test_upload_creates_file_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app) as client:
        resp = client.post("/api/upload?dir=docs", files={"files": ("hello.txt", b"hello", "text/plain")})
        assert resp.status_code == 200
        data = resp.json()
        assert data["uploaded"] == ["docs/hello.txt"]
        assert (tmp_path / "shared" / "docs" / "hello.txt").read_bytes() == b"hello"
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and msgs[-1]["user"] == "系统"
        assert "上传了文件" in msgs[-1]["text"] and "docs" in msgs[-1]["text"]


def test_upload_failure_returns_400_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app) as client:
        resp = client.post("/api/upload?dir=missing", files={"files": ("a.txt", b"x", "text/plain")})
        assert resp.status_code == 400
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and msgs[-1]["text"].startswith("上传失败")


def test_create_dir_api_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app) as client:
        resp = client.post("/api/dirs", json={"name": "docs"})
        assert resp.status_code == 200
        assert resp.json()["path"] == "docs"
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and "创建了目录「docs」" in msgs[-1]["text"]


def test_delete_api_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    (tmp_path / "shared").mkdir(exist_ok=True)
    (tmp_path / "shared" / "a.txt").write_text("x")
    with TestClient(app) as client:
        resp = client.delete("/api/files", params={"path": "a.txt"})
        assert resp.status_code == 200
        assert not (tmp_path / "shared" / "a.txt").exists()
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and "删除了文件「a.txt」" in msgs[-1]["text"]


def test_download_success_and_failure_system_messages(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    (tmp_path / "shared").mkdir(exist_ok=True)
    (tmp_path / "shared" / "a.txt").write_text("hello")
    with TestClient(app) as client:
        resp = client.get("/api/download", params={"path": "a.txt"})
        assert resp.status_code == 200
        assert resp.content == b"hello"
        resp2 = client.get("/api/download", params={"path": "missing.txt"})
        assert resp2.status_code == 404
        msgs = client.get("/api/messages").json()["messages"]
        texts = [m["text"] for m in msgs]
        assert any("下载了文件" in t for t in texts)
        assert any("下载失败" in t for t in texts)
```

- [ ] **Step 2: 运行确认失败**

Run: `uv run pytest tests/test_api.py -q`
Expected: FAIL（上传/目录/删除接口 404，下载无系统消息）

- [ ] **Step 3: 最小实现**

在 `app/main.py` 中新增/修改：

```python
import shutil
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from .chat import ChatRoom, now
from .chat_store import ChatStore
from .file_ops import MAX_UPLOAD_SIZE, create_dir, delete_path, save_upload
from .file_tree import build_zip, list_entries, safe_resolve


def _sys(room: ChatRoom, text: str) -> None:
    room.system_message(text)


@app.post("/api/upload")
async def upload(
    request: Request,
    dir: str = Query("", max_length=4096),
    files: list[UploadFile] = File(...),
) -> dict:
    try:
        folder = safe_resolve(shared, dir)
        if not folder.is_dir():
            raise FileNotFoundError("目标目录不存在")
        uploaded: list[str] = []
        for f in files:
            data = await f.read()
            rel = save_upload(shared, dir, f.filename or "file", data, MAX_UPLOAD_SIZE)
            uploaded.append(rel)
        _sys(room, "上传了文件「" + "」「".join(f.filename or "file" for f in files) + "」到「" + (dir or "根目录") + "」")
        return {"uploaded": uploaded}
    except Exception as exc:
        _sys(room, "上传失败：" + str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/dirs")
async def create_directory(payload: dict) -> dict:
    try:
        name = payload.get("name", "")
        path = create_dir(shared, name)
        _sys(room, "创建了目录「" + name + "」")
        return {"path": path}
    except Exception as exc:
        _sys(room, "创建目录失败：" + str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/files")
async def delete_file(path: str = Query(..., max_length=4096)) -> dict:
    try:
        deleted = delete_path(shared, path)
        kind = "目录" if (safe_resolve(shared, path).is_dir()) else "文件"
        _sys(room, "删除了" + kind + "「" + path + "」")
        return {"deleted": deleted}
    except Exception as exc:
        _sys(room, "删除失败：" + str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/download")
async def download(path: str = Query("", max_length=4096)):
    try:
        target = safe_resolve(shared, path)
        if not target.exists():
            raise FileNotFoundError("文件不存在")
        _sys(room, "下载了" + ("目录「" + path + "」" if target.is_dir() else "文件「" + path + "」"))
        if target.is_dir():
            fd, tmp_name = tempfile.mkstemp(suffix=".zip")
            os.close(fd)
            build_zip(shared, path, Path(tmp_name))
            return Response(
                content=Path(tmp_name).read_bytes(),
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="{target.name}.zip"'},
                background=BackgroundTask(os.unlink, tmp_name),
            )
        return FileResponse(target, filename=target.name)
    except Exception as exc:
        _sys(room, "下载失败：" + str(exc))
        raise HTTPException(status_code=404 if isinstance(exc, FileNotFoundError) else 400, detail=str(exc)) from exc
```

并在 `create_app` 中注入 `room` 供上述函数使用（`room` 已在闭包内可用）。

- [ ] **Step 4: 运行确认通过**

Run: `uv run pytest tests/test_api.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/main.py tests/test_api.py
git commit -m "feat: 文件操作 API 与系统消息"
```

## 任务 4：CLI 参数 --max-upload-size

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: 加 CLI 参数与传递**

在 `main()` 中：

```python
parser.add_argument("--max-upload-size", type=int, default=500, help="单个上传文件大小上限（MB，默认 500）")
...
uvicorn.run(
    create_app(args.shared_dir, chat_db=args.chat_db, max_upload_size_mb=args.max_upload_size),
    ...
)
```

`create_app` 签名改为：

```python
def create_app(shared_dir=Path("./shared"), chat_db=None, max_upload_size_mb: int = 500):
```

内部计算 `max_upload_size = max_upload_size_mb * 1024 * 1024` 并用于 `upload` 路由。

- [ ] **Step 2: 运行测试**

Run: `uv run pytest -q`
Expected: PASS（全部）

- [ ] **Step 3: 提交**

```bash
git add app/main.py
git commit -m "feat: 上传大小限制可配置"
```

## 任务 5：前端上传/创建目录/删除按钮

**Files:**
- Modify: `app/static/app.js`
- Modify: `app/static/index.html`
- Modify: `app/static/styles.css`

- [ ] **Step 1: 在 index.html 工具栏增加按钮**

```html
<div class="tree-toolbar">
  <span id="tree-title">共享目录</span>
  <div class="tree-actions">
    <button id="upload-root" class="ghost-btn" title="上传到根目录">上传</button>
    <button id="new-dir" class="ghost-btn" title="新建文件夹">新建文件夹</button>
    <button id="refresh" class="icon-btn" title="刷新文件列表">⟳</button>
  </div>
</div>
```

- [ ] **Step 2: app.js 增加操作函数与事件绑定**

在 boot 前加入：

```javascript
async function uploadFiles(dir, fileList) {
  if (!fileList || !fileList.length) return;
  const fd = new FormData();
  for (const f of fileList) fd.append("files", f);
  const url = "/api/upload" + (dir ? "?dir=" + encodeURIComponent(dir) : "");
  const resp = await fetch(url, { method: "POST", body: fd });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  await loadRoot();
}

function pickAndUpload(dir) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.onchange = () => uploadFiles(dir, input.files);
  input.click();
}

async function createDir() {
  const name = prompt("新文件夹名称");
  if (!name) return;
  const resp = await fetch("/api/dirs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    alert(detail.detail || "创建失败");
    return;
  }
  await loadRoot();
}

async function removeEntry(path, type) {
  if (!confirm("确定删除" + type + "「" + path + "」？")) return;
  const resp = await fetch("/api/files?path=" + encodeURIComponent(path), { method: "DELETE" });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    alert(detail.detail || "删除失败");
    return;
  }
  await loadRoot();
}

function addRowButtons(row, entry) {
  if (entry.type === "dir") {
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "download-btn row-btn";
    upBtn.title = "上传到此目录";
    upBtn.textContent = "+";
    upBtn.addEventListener("click", (ev) => { ev.stopPropagation(); pickAndUpload(entry.path); });
    row.appendChild(upBtn);
  }
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "download-btn row-btn danger";
  delBtn.title = "删除";
  delBtn.textContent = "×";
  delBtn.addEventListener("click", (ev) => { ev.stopPropagation(); removeEntry(entry.path, entry.type === "dir" ? "目录" : "文件"); });
  row.appendChild(delBtn);
}

document.getElementById("upload-root").addEventListener("click", () => pickAndUpload(""));
document.getElementById("new-dir").addEventListener("click", createDir);
```

在 `buildNode` 中 `row.append(twisty, icon, name, size, downloadBtn);` 改为 `row.append(twisty, icon, name, size, downloadBtn); addRowButtons(row, entry);`。

- [ ] **Step 3: styles.css 增加按钮样式**

```css
.tree-actions { display: flex; gap: 6px; align-items: center; }
.tree-actions .ghost-btn { padding: 5px 8px; font-size: 12px; }
.row-btn.danger { color: var(--danger); }
.row-btn.danger:hover { border-color: var(--danger); background: rgba(242, 139, 130, 0.08); }
```

- [ ] **Step 4: 运行 JS 语法检查**

Run: `node --check app/static/app.js`
Expected: 无输出，退出码 0

- [ ] **Step 5: 提交**

```bash
git add app/static/app.js app/static/index.html app/static/styles.css
git commit -m "feat: 文件树支持上传/新建/删除"
```

## 任务 6：e2e 冒烟与 README

**Files:**
- Modify: `scripts/e2e_smoke.py`
- Modify: `README.md`

- [ ] **Step 1: e2e 增加上传与系统消息验证**

在 `main()` 中 `/api/messages` 检查后加：

```python
import io

boundary = "----testboundary"
upload_body = (
    f"--{boundary}\r\n"
    'Content-Disposition: form-data; name="files"; filename="smoke.txt"\r\n'
    "Content-Type: text/plain\r\n\r\n"
    "hello smoke\r\n"
    f"--{boundary}--\r\n"
).encode()
conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
conn.request("POST", "/api/upload?dir=", body=upload_body, headers={
    "Content-Type": f"multipart/form-data; boundary={boundary}",
})
resp = conn.getresponse()
body = resp.read()
conn.close()
print("POST /api/upload ->", resp.status, body.decode())
assert resp.status == 200

status, _, body = http_get(port, "/api/messages")
assert status == 200
msgs = json.loads(body)["messages"]
assert any("上传了文件" in m["text"] for m in msgs)
```

- [ ] **Step 2: README 补充功能与参数**

在功能列表加：支持上传、新建文件夹、删除（前端按钮），操作后由「系统」在聊天中提示；`--max-upload-size` 参数说明。

- [ ] **Step 3: 全量验证**

Run: `uv run pytest -q`
Expected: PASS

Run: `uv run python scripts/e2e_smoke.py`
Expected: ALL SMOKE CHECKS PASSED

- [ ] **Step 4: 提交**

```bash
git add scripts/e2e_smoke.py README.md
git commit -m "test: e2e 上传冒烟; docs: README"
```
