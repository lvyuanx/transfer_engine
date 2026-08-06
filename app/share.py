from __future__ import annotations

import html
import json
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .passwords import hash_password, verify_password


class ShareStore:
    """分享记录：创建、读取、过期/密码判断与 JSON 持久化。"""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self._path = None if db_path is None else Path(db_path).expanduser()
        self._shares: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._load()

    def create(
        self,
        path: str,
        encrypted: bool = False,
        password: str = "",
        expires_days: int | None = None,
    ) -> dict:
        """创建分享；expires_days 为 None 表示永久。"""
        rec = {
            "id": secrets.token_urlsafe(12),
            "path": path,
            "encrypted": bool(encrypted),
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "expires_days": expires_days,
        }
        if rec["encrypted"]:
            rec["password_hash"], rec["salt"] = hash_password(password)
        with self._lock:
            self._shares[rec["id"]] = rec
            self._save()
        return rec

    def get(self, share_id: str) -> dict | None:
        with self._lock:
            return self._shares.get(share_id)

    def is_expired(self, rec: dict, now: datetime | None = None) -> bool:
        """按 created_at + expires_days 判断是否过期；永久分享恒 False。"""
        days = rec.get("expires_days")
        if not days:
            return False
        if now is None:
            now = datetime.now(timezone.utc)
        return datetime.fromisoformat(rec["created_at"]) + timedelta(days=days) < now

    def check_password(self, rec: dict, password: str) -> bool:
        """非加密分享恒可通过；加密分享校验密码。"""
        if not rec.get("encrypted"):
            return True
        return verify_password(password, rec.get("salt", ""), rec.get("password_hash", ""))

    def _load(self) -> None:
        if self._path is None or not self._path.is_file():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            self._shares = {s["id"]: s for s in data.get("shares", [])}
        except (OSError, ValueError):
            self._shares = {}

    def _save(self) -> None:
        if self._path is None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(self._path.suffix + ".tmp")
        tmp.write_text(
            json.dumps({"shares": list(self._shares.values())}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(self._path)


def _page(title: str, body: str) -> str:
    """独立分享页外壳，引用 /share.css（由 StaticFiles 提供）。"""
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{html.escape(title)} · LAN Transfer</title>
<link rel="stylesheet" href="/share.css" />
</head>
<body>
<main class="share-card">
{body}
</main>
</body>
</html>
"""


def render_share_401() -> str:
    """加密分享需要访问密码时返回的 401 提示页（Basic Auth 取消/失败后展示）。"""
    return _page(
        "需要访问密码",
        '<h1 class="share-name">需要访问密码</h1>\n'
        '<p class="share-meta">此分享已加密，请输入访问密码后下载。</p>\n'
        '<a class="share-btn" href="/">返回首页</a>',
    )
