import base64
import io
import zipfile

from fastapi.testclient import TestClient

from app.main import create_app


def seed(root):
    root.mkdir(parents=True, exist_ok=True)
    (root / "docs").mkdir()
    (root / "docs" / "readme.txt").write_text("hello", encoding="utf-8")
    (root / "a.txt").write_text("aaa", encoding="utf-8")


def make_app(tmp_path):
    return create_app(tmp_path / "shared", shares_db=tmp_path / "shares.json")


def create_share(client, path, **kw):
    payload = {"path": path, "encrypted": False, "expires": "forever"}
    payload.update(kw)
    resp = client.post("/api/shares", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def basic_auth(password, user="share"):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


def test_create_share_returns_id(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        assert create_share(client, "a.txt")


def test_share_download_file_direct_stream(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        sid = create_share(client, "a.txt")
        resp = client.get(f"/s/{sid}")
        assert resp.status_code == 200
        assert resp.content == b"aaa"
        # 直接文件流而非分享页
        assert resp.headers["content-type"] == "text/plain; charset=utf-8"
        assert "attachment" in resp.headers["content-disposition"]


def test_share_download_folder_returns_zip(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        sid = create_share(client, "docs")
        resp = client.get(f"/s/{sid}")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "readme.txt" in zf.namelist()


def test_share_encrypted_requires_basic_auth(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        sid = create_share(client, "a.txt", encrypted=True, password="pw")
        # 无凭据 → 401 + WWW-Authenticate
        resp = client.get(f"/s/{sid}")
        assert resp.status_code == 401
        assert "Basic" in resp.headers["www-authenticate"]
        # 错误密码 → 401
        resp = client.get(f"/s/{sid}", headers={"Authorization": basic_auth("bad")})
        assert resp.status_code == 401
        # 正确密码 → 文件流
        resp = client.get(f"/s/{sid}", headers={"Authorization": basic_auth("pw")})
        assert resp.status_code == 200
        assert resp.content == b"aaa"


def test_share_encrypted_create_requires_password(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        resp = client.post(
            "/api/shares", json={"path": "a.txt", "encrypted": True, "password": ""}
        )
        assert resp.status_code == 400


def test_share_expired_returns_404(tmp_path):
    seed(tmp_path / "shared")
    app = make_app(tmp_path)
    with TestClient(app) as client:
        sid = create_share(client, "a.txt", expires="1d")
        app.state.shares._shares[sid]["created_at"] = "2020-01-01T00:00:00+00:00"
        assert client.get(f"/s/{sid}").status_code == 404


def test_share_missing_returns_404(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        resp = client.get("/s/does-not-exist")
        assert resp.status_code == 404
        assert "已失效" in resp.text


def test_share_traversal_rejected(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        resp = client.post("/api/shares", json={"path": "../outside"})
        assert resp.status_code == 400


def test_share_missing_path_returns_404(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        resp = client.post("/api/shares", json={"path": "nope.txt"})
        assert resp.status_code == 404


def test_share_invalid_expires_rejected(tmp_path):
    seed(tmp_path / "shared")
    with TestClient(make_app(tmp_path)) as client:
        resp = client.post("/api/shares", json={"path": "a.txt", "expires": "10d"})
        assert resp.status_code == 400


def test_share_persists_across_restart(tmp_path):
    seed(tmp_path / "shared")
    db = tmp_path / "shares.json"
    with TestClient(create_app(tmp_path / "shared", shares_db=db)) as client:
        sid = create_share(client, "a.txt")
    # 第二个实例读取同一份 shares.json，链接仍有效
    with TestClient(create_app(tmp_path / "shared", shares_db=db)) as client:
        resp = client.get(f"/s/{sid}")
        assert resp.status_code == 200
        assert resp.content == b"aaa"


def test_share_vault_bypass_requires_token(tmp_path):
    seed(tmp_path / "shared")
    shared = tmp_path / "shared"
    with TestClient(make_app(tmp_path)) as client:
        resp = client.post("/api/vaults", json={"name": "secret", "parent": "", "password": "v"})
        assert resp.status_code == 200
        (shared / "secret" / "inner.txt").write_text("hi", encoding="utf-8")
        unlock = client.post("/api/vaults/unlock", json={"path": "secret", "password": "v"})
        assert unlock.status_code == 200
        token = unlock.json()["token"]
        # 无 token：分享加密文件夹内文件 → 403
        resp = client.post("/api/shares", json={"path": "secret/inner.txt"})
        assert resp.status_code == 403
        # 带解锁 token：可创建分享
        resp = client.post("/api/shares", json={"path": "secret/inner.txt", "token": token})
        assert resp.status_code == 200
        sid = resp.json()["id"]
        # 下载端不需要 vault token（分享即显式授权）
        assert client.get(f"/s/{sid}").status_code == 200
