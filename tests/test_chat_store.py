import sqlite3
from datetime import datetime, timedelta, timezone

from app.chat_store import ChatStore


def test_append_returns_message_with_incrementing_ids(tmp_path):
    store = ChatStore(tmp_path / "chat.db")
    m1 = store.append("alice", "hello")
    m2 = store.append("bob", "hi")
    assert m1 == {"id": 1, "user": "alice", "text": "hello", "ts": m1["ts"], "recalled": False}
    assert m2["id"] == 2
    assert m2["user"] == "bob"
    assert m2["text"] == "hi"
    assert set(m2) == {"id", "user", "text", "ts", "recalled"}
    store.close()


def test_recall_marks_only_own_message(tmp_path):
    store = ChatStore(tmp_path / "chat.db")
    m = store.append("alice", "secret")
    assert store.recall(m["id"], "bob") is False
    assert store.recent(10)[0]["recalled"] == 0
    assert store.recall(m["id"], "alice") is True
    assert store.recent(10)[0]["recalled"] == 1
    store.close()


def test_recent_returns_latest_in_ascending_order(tmp_path):
    store = ChatStore(tmp_path / "chat.db")
    for i in range(5):
        store.append("u", f"msg-{i}")
    msgs = store.recent(3)
    assert [m["text"] for m in msgs] == ["msg-2", "msg-3", "msg-4"]
    store.close()


def test_page_before_id_and_has_more(tmp_path):
    store = ChatStore(tmp_path / "chat.db")
    for i in range(10):
        store.append("u", f"msg-{i}")

    msgs, has_more = store.page(None, 4)
    assert [m["text"] for m in msgs] == ["msg-6", "msg-7", "msg-8", "msg-9"]
    assert has_more is True

    msgs, has_more = store.page(msgs[0]["id"], 4)
    assert [m["text"] for m in msgs] == ["msg-2", "msg-3", "msg-4", "msg-5"]
    assert has_more is True

    msgs, has_more = store.page(msgs[0]["id"], 10)
    assert [m["text"] for m in msgs] == ["msg-0", "msg-1"]
    assert has_more is False
    store.close()


def test_prune_removes_only_expired_messages(tmp_path):
    db = tmp_path / "chat.db"
    store = ChatStore(db)
    store.append("u", "fresh")
    old_ts = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat(timespec="seconds")
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO messages (user, text, ts) VALUES (?, ?, ?)",
        ("old", "expired", old_ts),
    )
    conn.commit()
    conn.close()

    deleted = store.prune(datetime.now(timezone.utc) - timedelta(days=30))
    assert deleted == 1
    msgs = store.recent(100)
    assert [m["text"] for m in msgs] == ["fresh"]
    store.close()


def test_reopening_same_path_keeps_data(tmp_path):
    db = tmp_path / "chat.db"
    store = ChatStore(db)
    store.append("alice", "persisted")
    store.close()

    reopened = ChatStore(db)
    assert [m["text"] for m in reopened.recent(100)] == ["persisted"]
    reopened.close()
