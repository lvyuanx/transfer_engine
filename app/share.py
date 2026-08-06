from __future__ import annotations

import html
import json
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .passwords import hash_password, verify_password

_FOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"'
    ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
    ' stroke-linejoin="round" aria-hidden="true">'
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
    "</svg>"
)
_FILE_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"'
    ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
    ' stroke-linejoin="round" aria-hidden="true">'
    '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>'
    '<polyline points="13 2 13 9 20 9"/>'
    "</svg>"
)


def _fmt_size(num: int) -> str:
    """简单人类可读文件大小，与前端 fmtSize 风格一致。"""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if num < 1024:
            return f"{num:.0f} {unit}" if unit == "B" else f"{num:.1f} {unit}"
        num /= 1024
    return f"{num:.1f} TB"


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


def render_share_page(rec: dict, target: Path) -> str:
    """分享页：展示名称/类型/大小，加密时需输入密码才能下载。"""
    name = html.escape(target.name)
    is_dir = target.is_dir()
    meta = "文件夹" if is_dir else f"文件 · {_fmt_size(target.stat().st_size)}"
    icon = _FOLDER_SVG if is_dir else _FILE_SVG
    if rec.get("encrypted"):
        download = (
            '<form class="share-form" method="get" action="download">'
            '<input class="share-input" type="password" name="password" '
            'placeholder="访问密码" required autocomplete="off" />'
            '<button class="share-btn" type="submit">下载</button>'
            "</form>"
        )
    else:
        download = '<a class="share-btn" href="download">下载</a>'
    return _page(
        name,
        f'<div class="share-icon">{icon}</div>\n'
        f'<h1 class="share-name">{name}</h1>\n'
        f'<p class="share-meta">{meta}</p>\n'
        f"{download}",
    )


def render_share_404() -> str:
    """链接不存在、已过期或文件已被删除时的友好 404 页。"""
    return _page(
        "链接已失效",
        '<h1 class="share-name">链接不存在或已失效</h1>\n'
        '<p class="share-meta">该分享不存在、已过期或文件已被删除。</p>\n'
        '<a class="share-btn" href="/">返回首页</a>',
    )


def render_share_403(share_id: str) -> str:
    """分享页提交密码错误时的 403 页。"""
    back = html.escape(f"/s/{share_id}")
    return _page(
        "访问密码错误",
        '<h1 class="share-name">访问密码错误</h1>\n'
        '<p class="share-meta">密码不正确，无法下载该分享内容。</p>\n'
        f'<a class="share-btn" href="{back}">返回重新输入</a>',
    )
