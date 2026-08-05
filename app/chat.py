from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import WebSocket

from .chat_store import ChatStore


def now() -> str:
    return time.strftime("%H:%M:%S")


class ChatRoom:
    """Tracks live WebSocket connections and broadcasts chat/presence updates."""

    def __init__(self, store: ChatStore | None = None) -> None:
        self._clients: dict[WebSocket, str] = {}
        self._store = store
        self._counter = 0

    @property
    def online(self) -> int:
        return len(self._clients)

    def users(self) -> list[str]:
        return list(self._clients.values())

    def username(self, ws: WebSocket) -> str:
        return self._clients.get(ws, "unknown")

    async def connect(self, ws: WebSocket, default_name: str) -> None:
        await ws.accept()
        self._clients[ws] = default_name

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.pop(ws, None)

    def set_name(self, ws: WebSocket, name: str) -> None:
        self._clients[ws] = name

    def is_persistence_on(self) -> bool:
        return self._store is not None

    def system_message(self, text: str) -> dict:
        return self.record_message("系统", text)

    def history(self, limit: int = 100) -> list[dict]:
        """Return recent persisted messages (empty when persistence is off)."""
        if self._store is None:
            return []
        return self._store.recent(limit)

    def page(self, before_id: int | None, limit: int) -> tuple[list[dict], bool]:
        """Return one page of persisted messages for the REST API."""
        if self._store is None:
            return [], False
        return self._store.page(before_id, limit)

    def record_message(self, user: str, text: str) -> dict:
        """Persist a chat message and return metadata used for broadcasting."""
        if self._store is not None:
            return self._store.append(user, text)
        self._counter += 1
        return {
            "id": self._counter,
            "user": user,
            "text": text,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

    async def broadcast(self, payload: dict, exclude: WebSocket | None = None) -> None:
        for ws in list(self._clients):
            if ws is exclude:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                pass

    async def broadcast_presence(self, exclude: WebSocket | None = None) -> None:
        await self.broadcast(
            {"type": "presence", "online": self.online, "users": self.users()},
            exclude=exclude,
        )
