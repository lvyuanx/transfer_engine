from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import create_app


CLIENT = ("127.0.0.1", 50000)


def test_init_and_presence_broadcast(tmp_path):
    app = create_app(tmp_path / "shared")
    with TestClient(app, client=CLIENT) as client:
        with client.websocket_connect("/ws/chat") as ws1:
            init1 = ws1.receive_json()
            assert init1["type"] == "init"
            assert init1["online"] == 1
            assert init1["user"] == "127.0.0.1"
            assert init1["history"] == []

            with client.websocket_connect("/ws/chat") as ws2:
                init2 = ws2.receive_json()
                assert init2["online"] == 2
                presence = ws1.receive_json()
                assert presence["type"] == "presence"
                assert presence["online"] == 2
                assert "127.0.0.1" in presence["users"]


def test_chat_message_relayed_to_other_clients(tmp_path):
    app = create_app(tmp_path / "shared")
    with TestClient(app, client=CLIENT) as client:
        with client.websocket_connect("/ws/chat") as ws1, client.websocket_connect("/ws/chat") as ws2:
            ws1.receive_json()
            ws2.receive_json()
            ws1.receive_json()

            ws1.send_json({"type": "chat", "text": "hello everyone"})
            msg = ws2.receive_json()
            assert msg["type"] == "message"
            assert msg["user"] == "127.0.0.1"
            assert msg["text"] == "hello everyone"
            assert msg["time"]


def test_set_name_updates_username(tmp_path):
    app = create_app(tmp_path / "shared")
    with TestClient(app, client=CLIENT) as client:
        with client.websocket_connect("/ws/chat") as ws1, client.websocket_connect("/ws/chat") as ws2:
            ws1.receive_json()
            ws2.receive_json()
            ws1.receive_json()

            ws1.send_json({"type": "set_name", "name": "alice"})
            presence = ws2.receive_json()
            assert presence["type"] == "presence"
            assert "alice" in presence["users"]

            ws1.send_json({"type": "chat", "text": "hi"})
            msg = ws2.receive_json()
            assert msg["user"] == "alice"


def test_disconnect_decreases_online_count(tmp_path):
    app = create_app(tmp_path / "shared")
    with TestClient(app, client=("192.168.1.10", 50001)) as client1, TestClient(
        app, client=("192.168.1.11", 50002)
    ) as client2:
        with client1.websocket_connect("/ws/chat") as ws1:
            init1 = ws1.receive_json()
            assert init1["online"] == 1
            with client2.websocket_connect("/ws/chat") as ws2:
                init2 = ws2.receive_json()
                assert init2["online"] == 2
                presence = ws1.receive_json()
                assert presence["online"] == 2
                assert "192.168.1.11" in presence["users"]
            presence = ws1.receive_json()
            assert presence["type"] == "presence"
            assert presence["online"] == 1
            assert presence["users"] == ["192.168.1.10"]


def test_chat_message_has_incrementing_id_and_ts(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    with TestClient(app, client=CLIENT) as client:
        with client.websocket_connect("/ws/chat") as ws1, client.websocket_connect("/ws/chat") as ws2:
            ws1.receive_json()
            ws2.receive_json()
            ws1.receive_json()

            ws1.send_json({"type": "chat", "text": "hello"})
            msg = ws2.receive_json()
            assert msg["type"] == "message"
            assert msg["id"] == 1
            assert msg["user"] == "127.0.0.1"
            assert msg["text"] == "hello"
            assert "ts" in msg
            assert msg["time"]
            own_echo = ws1.receive_json()
            assert own_echo["id"] == 1

            ws2.send_json({"type": "chat", "text": "hi back"})
            echoed = ws1.receive_json()
            assert echoed["id"] == 2
            assert echoed["ts"] >= msg["ts"]


def test_file_operation_system_message_is_broadcast_immediately(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    room = app.state.room
    room.broadcast = AsyncMock()
    with TestClient(app, client=CLIENT) as client:
        response = client.post("/api/dirs", json={"name": "docs"})

    assert response.status_code == 200
    room.broadcast.assert_awaited_once()
    message = room.broadcast.await_args.args[0]
    assert message["type"] == "message"
    assert message["user"] == "系统"
    assert "创建了目录「docs」" in message["text"]
    assert message["id"] == 1
    assert message["time"]


def test_history_survives_app_restart(tmp_path):
    db = tmp_path / "chat.db"
    app1 = create_app(tmp_path / "shared", chat_db=db)
    with TestClient(app1, client=CLIENT) as client:
        with client.websocket_connect("/ws/chat") as ws:
            ws.receive_json()
            ws.send_json({"type": "chat", "text": "hello"})

    app2 = create_app(tmp_path / "shared", chat_db=db)
    with TestClient(app2, client=CLIENT) as client:
        with client.websocket_connect("/ws/chat") as ws:
            init = ws.receive_json()
            assert init["type"] == "init"
            assert len(init["history"]) == 1
            assert init["history"][0]["user"] == "127.0.0.1"
            assert init["history"][0]["text"] == "hello"
            assert "id" in init["history"][0] and "ts" in init["history"][0]


def test_init_history_is_limited_to_recent_100(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    room = app.state.room
    for i in range(120):
        room.record_message("u", f"msg-{i}")
    with TestClient(app, client=CLIENT) as client:
        with client.websocket_connect("/ws/chat") as ws:
            init = ws.receive_json()
            assert len(init["history"]) == 100
            assert init["history"][0]["text"] == "msg-20"
            assert init["history"][-1]["text"] == "msg-119"


def test_system_message_persisted_and_broadcast(tmp_path):
    app = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    room = app.state.room
    meta = room.system_message("上传了文件「a.txt」")
    assert meta["user"] == "系统"
    assert meta["text"] == "上传了文件「a.txt」"
    assert "id" in meta and "ts" in meta
    assert room.is_persistence_on() is True

    app2 = create_app(tmp_path / "shared", chat_db=tmp_path / "chat.db")
    history = app2.state.room.history()
    assert history and history[-1]["user"] == "系统"
    assert history[-1]["text"] == "上传了文件「a.txt」"


def test_system_message_memory_mode_no_persist(tmp_path):
    app = create_app(tmp_path / "shared")
    room = app.state.room
    meta = room.system_message("测试")
    assert room.is_persistence_on() is False
    assert meta["user"] == "系统"
    assert meta["text"] == "测试"
    assert room.history() == []
