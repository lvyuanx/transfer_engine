import pytest

from app.file_ops import create_dir, delete_path, save_upload, validate_upload


def test_create_dir_success_and_duplicate(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    path = create_dir(root, "docs")
    assert (root / "docs").is_dir()
    assert path == "docs"
    with pytest.raises(ValueError):
        create_dir(root, "docs")


def test_create_dir_rejects_bad_names(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    for bad in ("", ".", "..", "a/b", "a\\b", ".hidden"):
        with pytest.raises(ValueError):
            create_dir(root, bad)


def test_validate_upload_rejects_bad_name(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    with pytest.raises(ValueError):
        validate_upload(root, "docs/../evil.txt", "", 0)


def test_validate_upload_rejects_oversize(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    with pytest.raises(ValueError):
        validate_upload(root, "evil.txt", "", 10, max_size=5)


def test_validate_upload_rejects_missing_dir(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    with pytest.raises(FileNotFoundError):
        validate_upload(root, "a.txt", "missing", 10, max_size=100)


def test_save_upload_writes_file(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    (root / "docs").mkdir()
    saved = save_upload(root, "docs", "a.txt", b"hello", max_size=1024)
    assert saved == "docs/a.txt"
    assert (root / "docs" / "a.txt").read_bytes() == b"hello"


def test_save_upload_rejects_duplicate(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    (root / "a.txt").write_text("x")
    with pytest.raises(ValueError):
        save_upload(root, "", "a.txt", b"y", max_size=1024)


def test_delete_path_file_and_dir(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    (root / "a.txt").write_text("x")
    (root / "docs").mkdir()
    (root / "docs" / "b.txt").write_text("y")
    assert delete_path(root, "a.txt") == "a.txt"
    assert not (root / "a.txt").exists()
    assert delete_path(root, "docs") == "docs"
    assert not (root / "docs").exists()


def test_delete_path_rejects_root_and_missing(tmp_path):
    root = tmp_path / "shared"
    root.mkdir()
    with pytest.raises(ValueError):
        delete_path(root, "")
    with pytest.raises(FileNotFoundError):
        delete_path(root, "missing.txt")
