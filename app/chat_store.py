from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ChatStore:
    def __init__(self, path: str | Path, retention_days: int = 30, prune_every: int = 100):
        self._path = Path(path).expanduser()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._retention_days = retention_days
        self._prune_every = prune_every
        self._writes_since_prune = 0
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.execute("PRAGMA busy_timeout=5000")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user TEXT NOT NULL,
                    text TEXT NOT NULL,
                    ts TEXT NOT NULL
                )
                """
            )
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)")
            self._conn.commit()
        self.prune(datetime.now(timezone.utc) - timedelta(days=retention_days))

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def append(self, user: str, text: str) -> dict:
        ts = utc_now_iso()
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO messages (user, text, ts) VALUES (?, ?, ?)",
                (user, text, ts),
            )
            self._conn.commit()
            msg_id = cur.lastrowid
        self._writes_since_prune += 1
        if self._writes_since_prune >= self._prune_every:
            self._writes_since_prune = 0
            self.prune(datetime.now(timezone.utc) - timedelta(days=self._retention_days))
        return {"id": msg_id, "user": user, "text": text, "ts": ts}

    def recent(self, limit: int) -> list[dict]:
        limit = max(1, min(int(limit), 500))
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, user, text, ts FROM messages ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        messages = [dict(row) for row in rows]
        messages.reverse()
        return messages

    def page(self, before_id: int | None, limit: int) -> tuple[list[dict], bool]:
        limit = max(1, min(int(limit), 500))
        with self._lock:
            if before_id is not None:
                rows = self._conn.execute(
                    "SELECT id, user, text, ts FROM messages"
                    " WHERE id < ? ORDER BY id DESC LIMIT ?",
                    (before_id, limit + 1),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT id, user, text, ts FROM messages ORDER BY id DESC LIMIT ?",
                    (limit + 1,),
                ).fetchall()
        has_more = len(rows) > limit
        messages = [dict(row) for row in rows[:limit]]
        messages.reverse()
        return messages, has_more

    def prune(self, cutoff: datetime) -> int:
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM messages WHERE ts < ?",
                (cutoff.isoformat(timespec="seconds"),),
            )
            self._conn.commit()
            return cur.rowcount
