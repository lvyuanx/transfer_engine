import zipfile

import pytest

from app.file_tree import build_zip, list_entries, safe_resolve


def make_tree(tmp_path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "readme.txt").write_text("hello", encoding="utf-8")
    (tmp_path / "a.txt").write_text("aaa", encoding="utf-8")
    (tmp_path / ".hidden").write_text("secret", encoding="utf-8")
    (tmp_path / ".DS_Store").write_text("x", encoding="utf-8")
    return tmp_path


def test_safe_resolve_rejects_traversal(tmp_path):
    with pytest.raises(ValueError):
        safe_resolve(tmp_path, "../outside")


def test_safe_resolve_rejects_absolute_path(tmp_path):
    with pytest.raises(ValueError):
        safe_resolve(tmp_path, "/etc/passwd")


def test_safe_resolve_allows_nested_path(tmp_path):
    assert safe_resolve(tmp_path, "docs/readme.txt") == tmp_path / "docs" / "readme.txt"


def test_safe_resolve_rejects_symlink_escape(tmp_path):
    outside = tmp_path.parent / "outside.txt"
    outside.write_text("out", encoding="utf-8")
    (tmp_path / "link").symlink_to(outside)
    with pytest.raises(ValueError):
        safe_resolve(tmp_path, "link")


def test_list_entries_sorts_dirs_first_and_skips_hidden(tmp_path):
    make_tree(tmp_path)
    entries = list_entries(tmp_path)
    assert [e["name"] for e in entries] == ["docs", "a.txt"]
    assert entries[0]["type"] == "dir"
    assert entries[1]["type"] == "file"
    assert entries[1]["size"] == 3
    assert entries[0]["path"] == "docs"


def test_list_entries_returns_children_of_subdir(tmp_path):
    make_tree(tmp_path)
    entries = list_entries(tmp_path, "docs")
    assert [e["name"] for e in entries] == ["readme.txt"]


def test_list_entries_raises_for_missing_dir(tmp_path):
    with pytest.raises(FileNotFoundError):
        list_entries(tmp_path, "nope")


def test_build_zip_contains_all_shared_files(tmp_path):
    make_tree(tmp_path)
    zip_path = build_zip(tmp_path, "", tmp_path / "out.zip")
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert "docs/readme.txt" in names
    assert "a.txt" in names
    assert not any(name.startswith(".") for name in names)
