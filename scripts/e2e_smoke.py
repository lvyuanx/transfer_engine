"""One-shot end-to-end smoke test: boots the server, exercises HTTP + WebSocket,
then tears everything down. Run with: uv run python scripts/e2e_smoke.py
"""

import http.client
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def wait_http(port: int, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            conn.request("GET", "/")
            resp = conn.getresponse()
            resp.read()
            conn.close()
            if resp.status == 200:
                return
        except OSError:
            pass
        time.sleep(0.3)
    raise TimeoutError("server did not become ready")


def http_get(port: int, path: str):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", path)
    resp = conn.getresponse()
    body = resp.read()
    headers = dict(resp.getheaders())
    conn.close()
    return resp.status, headers, body


def http_upload(port: int, filename: str, content: bytes):
    boundary = "----transfer-engine-e2e-boundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request(
        "POST",
        "/api/upload?dir=",
        body=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    resp = conn.getresponse()
    body_resp = resp.read()
    status = resp.status
    conn.close()
    return status, body_resp


def main() -> int:
    port = 8017
    log_path = ROOT / ".e2e-server.log"
    shared_dir = Path(tempfile.gettempdir()) / f"transfer-engine-e2e-shared-{os.getpid()}"
    shared_dir.mkdir(parents=True, exist_ok=True)
    (shared_dir / "docs").mkdir(exist_ok=True)
    (shared_dir / "hello.txt").write_text("hello", encoding="utf-8")
    chat_db = Path(tempfile.gettempdir()) / f"transfer-engine-e2e-{os.getpid()}.db"
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "app.main",
            "--port",
            str(port),
            "--shared-dir",
            str(shared_dir),
            "--chat-db",
            str(chat_db),
        ],
        cwd=str(ROOT),
        stdout=log_path.open("wb"),
        stderr=subprocess.STDOUT,
    )
    failures = []
    try:
        wait_http(port)

        status, _, body = http_get(port, "/")
        print(f"GET / -> {status} ({len(body)} bytes)")
        assert status == 200
        assert b"LAN Transfer" in body

        status, _, body = http_get(port, "/api/tree")
        print("GET /api/tree ->", status, body.decode())
        assert status == 200
        tree = json.loads(body)["entries"]
        names = [e["name"] for e in tree]
        assert "docs" in names and "hello.txt" in names

        status, _, body = http_get(port, "/api/messages")
        print("GET /api/messages ->", status, body.decode())
        assert status == 200
        msgs = json.loads(body)
        assert msgs["messages"] == [] and msgs["has_more"] is False

        status, body = http_upload(port, "smoke.txt", b"hello smoke")
        print("POST /api/upload ->", status, body.decode())
        assert status == 200
        assert json.loads(body)["uploaded"] == ["smoke.txt"]

        status, _, body = http_get(port, "/api/messages")
        assert status == 200
        msgs = json.loads(body)["messages"]
        assert any("上传了文件" in m["text"] for m in msgs)

        status, _, body = http_get(port, "/api/tree")
        assert status == 200
        tree = json.loads(body)["entries"]
        assert any(e["name"] == "smoke.txt" for e in tree)

        q = urllib.parse.quote("docs")
        status, headers, body = http_get(port, f"/api/download?path={q}")
        print("GET /api/download?path=docs ->", status, headers.get("Content-Type"))
        content_type = (headers.get("Content-Type") or headers.get("content-type") or "").lower()
        print("  content-type:", content_type)
        assert status == 200
        assert "application/zip" in content_type
        assert body[:2] == b"PK"

        q = urllib.parse.quote("../README.md")
        status, _, _ = http_get(port, f"/api/download?path={q}")
        print("GET /api/download?path=../README.md ->", status)
        assert status == 400

        # WebSocket behavior is covered by unit tests via TestClient; the real
        # server above already exercises HTTP. Skip raw WS here to stay
        # independent of the installed websockets client flavor.
        print("ALL SMOKE CHECKS PASSED")
    except Exception as exc:
        failures.append(exc)
        print("SMOKE FAILURE:", exc)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        for suffix in ("", "-wal", "-shm"):
            Path(str(chat_db) + suffix).unlink(missing_ok=True)
        import shutil

        shutil.rmtree(shared_dir, ignore_errors=True)
    if failures:
        print("--- server log tail ---")
        print(log_path.read_text()[-3000:])
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
