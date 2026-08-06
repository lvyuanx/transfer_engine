from __future__ import annotations

import logging
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger("chat_store")


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
        self._readonly = False
        self._conn = None
        try:
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
                        ts TEXT NOT NULL,
                        recalled INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
                self._conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)")
                self._migrate_recalled_column()
                self._conn.commit()
            self.prune(datetime.now(timezone.utc) - timedelta(days=retention_days))
        except sqlite3.OperationalError as e:
            logger.warning("数据库不可写 (%s)，聊天仅在线广播，重启后历史不保留", e)
            self._readonly = True

    def _migrate_recalled_column(self) -> None:
        """为旧库补充 recalled 列（CREATE TABLE IF NOT EXISTS 不会改既有表）。"""
        cols = {row[1] for row in self._conn.execute("PRAGMA table_info(messages)")}
        if "recalled" not in cols:
            self._conn.execute("ALTER TABLE messages ADD COLUMN recalled INTEGER NOT NULL DEFAULT 0")

    def close(self) -> None:
        if self._conn is not None:
            with self._lock:
                self._conn.close()

    def append(self, user: str, text: str) -> dict:
        ts = utc_now_iso()
        if self._readonly or self._conn is None:
            self._counter = getattr(self, "_counter", 0) + 1
            return {"id": self._counter, "user": user, "text": text, "ts": ts, "recalled": False}
        try:
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
                try:
                    self.prune(datetime.now(timezone.utc) - timedelta(days=self._retention_days))
                except sqlite3.OperationalError:
                    logger.warning("数据库只读，跳过过期清理")
        except sqlite3.OperationalError:
            logger.warning("数据库只读，消息未持久化，仅在线广播")
            self._readonly = True
            self._counter = getattr(self, "_counter", 0) + 1
            return {"id": self._counter, "user": user, "text": text, "ts": ts, "recalled": False}
        return {"id": msg_id, "user": user, "text": text, "ts": ts, "recalled": False}

    def recall(self, msg_id: int, user: str) -> bool:
        """将属于 *user* 的消息标记为已撤回；返回是否成功（归属不匹配返回 False）。"""
        if self._readonly or self._conn is None:
            return False
        with self._lock:
            row = self._conn.execute(
                "SELECT user FROM messages WHERE id = ?", (msg_id,)
            ).fetchone()
            if row is None or row["user"] != user:
                return False
            self._conn.execute(
                "UPDATE messages SET recalled = 1 WHERE id = ?", (msg_id,)
            )
            self._conn.commit()
            return True

    def recent(self, limit: int) -> list[dict]:
        if self._readonly or self._conn is None:
            return []
        limit = max(1, min(int(limit), 500))
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, user, text, ts, recalled FROM messages ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        messages = [dict(row) for row in rows]
        messages.reverse()
        return messages

    def page(self, before_id: int | None, limit: int) -> tuple[list[dict], bool]:
        if self._readonly or self._conn is None:
            return [], False
        limit = max(1, min(int(limit), 500))
        with self._lock:
            if before_id is not None:
                rows = self._conn.execute(
                    "SELECT id, user, text, ts, recalled FROM messages"
                    " WHERE id < ? ORDER BY id DESC LIMIT ?",
                    (before_id, limit + 1),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT id, user, text, ts, recalled FROM messages ORDER BY id DESC LIMIT ?",
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
