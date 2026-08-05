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
