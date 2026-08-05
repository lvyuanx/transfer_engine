from __future__ import annotations

import argparse
import os
import socket
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

from .chat import ChatRoom, now
from .chat_store import ChatStore
from .file_tree import build_zip, list_entries, safe_resolve

STATIC_DIR = Path(__file__).parent / "static"


def create_app(
    shared_dir: Path | str = Path("./shared"),
    chat_db: Path | str | None = None,
) -> FastAPI:
    shared = Path(shared_dir).expanduser().resolve()
    shared.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="LAN Transfer", version="0.1.0")
    store = None if chat_db is None else ChatStore(chat_db)
    room = ChatRoom(store)
    app.state.shared_dir = shared
    app.state.room = room
    app.state.chat_db = chat_db

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/api/tree")
    async def tree(path: str = Query("", max_length=4096)) -> dict:
        try:
            entries = list_entries(shared, path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {"path": path, "entries": entries}

    @app.get("/api/messages")
    async def messages(
        before_id: str | None = Query(None),
        limit: str | None = Query(None),
    ) -> dict:
        try:
            page_limit = 50 if limit is None else int(limit)
            before = None if before_id is None else int(before_id)
            if not 1 <= page_limit <= 200 or (before is not None and before < 1):
                raise ValueError
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="limit must be an integer in 1..200; before_id must be a positive integer",
            ) from None
        msgs, has_more = room.page(before, page_limit)
        return {"messages": msgs, "has_more": has_more}

    @app.get("/api/download")
    async def download(path: str = Query("", max_length=4096)):
        try:
            target = safe_resolve(shared, path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not target.exists():
            raise HTTPException(status_code=404, detail="not found")

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

    @app.websocket("/ws/chat")
    async def chat(ws: WebSocket) -> None:
        user = ws.client.host if ws.client else "unknown"
        await room.connect(ws, user)
        await ws.send_json(
            {
                "type": "init",
                "user": user,
                "online": room.online,
                "users": room.users(),
                "history": room.history(),
            }
        )
        await room.broadcast_presence(exclude=ws)
        try:
            while True:
                data = await ws.receive_json()
                if not isinstance(data, dict):
                    continue
                kind = data.get("type")
                if kind == "chat":
                    text = str(data.get("text", "")).strip()
                    if text:
                        meta = room.record_message(room.username(ws), text)
                        await room.broadcast(
                            {
                                "type": "message",
                                "id": meta["id"],
                                "user": meta["user"],
                                "text": meta["text"],
                                "ts": meta["ts"],
                                "time": now(),
                            }
                        )
                elif kind == "set_name":
                    name = str(data.get("name", "")).strip()[:32]
                    if name:
                        room.set_name(ws, name)
                        await room.broadcast_presence()
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            room.disconnect(ws)
            await room.broadcast_presence()

    if STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
    return app


def get_lan_ip() -> str:
    """Best-effort detection of this machine's primary LAN IPv4 address."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        pass
    finally:
        sock.close()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                return ip
    except OSError:
        pass
    return "127.0.0.1"


def main() -> None:
    parser = argparse.ArgumentParser(description="LAN transfer & public chat tool")
    parser.add_argument("--host", default="0.0.0.0", help="bind address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="bind port (default: 8000)")
    parser.add_argument("--shared-dir", default="./shared", help="directory to share")
    parser.add_argument(
        "--chat-db",
        default="./data/chat.db",
        help="SQLite database for chat history (default: ./data/chat.db)",
    )
    args = parser.parse_args()

    import uvicorn

    print("=" * 56)
    print("  LAN Transfer 已启动")
    print(f"  本机访问:  http://127.0.0.1:{args.port}/")
    print(f"  局域网访问: http://{get_lan_ip()}:{args.port}/")
    print(f"  共享目录:  {Path(args.shared_dir).resolve()}")
    print(f"  聊天记录:  {Path(args.chat_db).resolve()}")
    print("=" * 56)
    uvicorn.run(
        create_app(args.shared_dir, chat_db=args.chat_db),
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
