import io
import zipfile

from fastapi.testclient import TestClient

from app.main import create_app


def seed_shared(root):
    root.mkdir(parents=True, exist_ok=True)
    (root / "docs").mkdir()
    (root / "docs" / "readme.txt").write_text("hello", encoding="utf-8")
    (root / "a.txt").write_text("aaa", encoding="utf-8")


def test_tree_endpoint_lists_shared_dir(tmp_path):
    seed_shared(tmp_path / "shared")
    with TestClient(create_app(tmp_path / "shared")) as client:
        resp = client.get("/api/tree")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        assert [e["name"] for e in entries] == ["docs", "a.txt"]


def test_tree_endpoint_rejects_traversal(tmp_path):
    seed_shared(tmp_path / "shared")
    with TestClient(create_app(tmp_path / "shared")) as client:
        resp = client.get("/api/tree", params={"path": "../outside"})
        assert resp.status_code == 400


def test_download_file(tmp_path):
    seed_shared(tmp_path / "shared")
    with TestClient(create_app(tmp_path / "shared")) as client:
        resp = client.get("/api/download", params={"path": "a.txt"})
        assert resp.status_code == 200
        assert resp.content == b"aaa"


def test_download_folder_returns_zip(tmp_path):
    seed_shared(tmp_path / "shared")
    with TestClient(create_app(tmp_path / "shared")) as client:
        resp = client.get("/api/download", params={"path": "docs"})
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "readme.txt" in zf.namelist()


def test_download_rejects_traversal(tmp_path):
    seed_shared(tmp_path / "shared")
    with TestClient(create_app(tmp_path / "shared")) as client:
        resp = client.get("/api/download", params={"path": "../outside"})
        assert resp.status_code == 400


def test_messages_endpoint_returns_latest_page(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    room = app.state.room
    for i in range(25):
        room.record_message("u", f"msg-{i}")
    with TestClient(app) as client:
        resp = client.get("/api/messages")
        assert resp.status_code == 200
        data = resp.json()
        assert [m["text"] for m in data["messages"]] == [f"msg-{i}" for i in range(25)]
        assert data["has_more"] is False


def test_messages_endpoint_paginates_with_before_id(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    room = app.state.room
    for i in range(25):
        room.record_message("u", f"msg-{i}")
    with TestClient(app) as client:
        resp = client.get("/api/messages", params={"limit": 10})
        data = resp.json()
        assert [m["text"] for m in data["messages"]] == [f"msg-{i}" for i in range(15, 25)]
        assert data["has_more"] is True

        resp = client.get(
            "/api/messages",
            params={"limit": 10, "before_id": data["messages"][0]["id"]},
        )
        data = resp.json()
        assert [m["text"] for m in data["messages"]] == [f"msg-{i}" for i in range(5, 15)]
        assert data["has_more"] is True

        resp = client.get(
            "/api/messages",
            params={"limit": 10, "before_id": data["messages"][0]["id"]},
        )
        data = resp.json()
        assert [m["text"] for m in data["messages"]] == [f"msg-{i}" for i in range(0, 5)]
        assert data["has_more"] is False


def test_messages_endpoint_rejects_invalid_params(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app) as client:
        for params in (
            {"limit": "0"},
            {"limit": "201"},
            {"limit": "abc"},
            {"before_id": "0"},
            {"before_id": "-3"},
            {"before_id": "abc"},
        ):
            resp = client.get("/api/messages", params=params)
            assert resp.status_code == 400, params


def test_messages_endpoint_memory_mode_is_empty(tmp_path):
    app = create_app(tmp_path / "shared")
    with TestClient(app) as client:
        resp = client.get("/api/messages")
        assert resp.status_code == 200
        assert resp.json() == {"messages": [], "has_more": False}


def test_upload_creates_file_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    (tmp_path / "shared" / "docs").mkdir(parents=True, exist_ok=True)
    with TestClient(app) as client:
        resp = client.post(
            "/api/upload?dir=docs",
            files={"files": ("hello.txt", b"hello", "text/plain")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["uploaded"] == ["docs/hello.txt"]
        assert (tmp_path / "shared" / "docs" / "hello.txt").read_bytes() == b"hello"
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and msgs[-1]["user"] == "系统"
        assert "上传了文件" in msgs[-1]["text"]
        assert "docs" in msgs[-1]["text"]


def test_upload_failure_returns_400_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app) as client:
        resp = client.post(
            "/api/upload?dir=missing",
            files={"files": ("a.txt", b"x", "text/plain")},
        )
        assert resp.status_code == 400
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and msgs[-1]["text"].startswith("上传失败")


def test_upload_size_limit_applies(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db", max_upload_size_mb=1)
    with TestClient(app) as client:
        resp = client.post(
            "/api/upload?dir=",
            files={"files": ("big.bin", b"x" * (1024 * 1024 + 1), "application/octet-stream")},
        )
        assert resp.status_code == 400
        assert "大小" in resp.json()["detail"]
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and "上传失败" in msgs[-1]["text"]


def test_create_dir_api_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app) as client:
        resp = client.post("/api/dirs", json={"name": "docs"})
        assert resp.status_code == 200
        assert resp.json()["path"] == "docs"
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and "创建了目录「docs」" in msgs[-1]["text"]


def test_create_subdir_api_with_parent_and_system_message(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    (tmp_path / "shared" / "docs").mkdir(parents=True, exist_ok=True)
    with TestClient(app) as client:
        resp = client.post("/api/dirs", json={"name": "sub", "parent": "docs"})
        assert resp.status_code == 200
        assert resp.json()["path"] == "docs/sub"
        assert (tmp_path / "shared" / "docs" / "sub").is_dir()
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and "创建了目录「docs/sub」" in msgs[-1]["text"]


def test_create_subdir_api_rejects_missing_parent(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app) as client:
        resp = client.post("/api/dirs", json={"name": "sub", "parent": "missing"})
        assert resp.status_code == 400
        assert "父目录" in resp.json()["detail"]
        msgs = client.get("/api/messages").json()["messages"]
        assert msgs and "创建目录失败" in msgs[-1]["text"]


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
