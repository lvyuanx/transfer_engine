from __future__ import annotations

import shutil
from pathlib import Path

from .file_tree import safe_resolve

MAX_UPLOAD_SIZE = 2048 * 1024 * 1024


def _valid_name(name: str) -> str:
    name = (name or "").strip().replace("\\", "/")
    if not name or name in {".", ".."} or "/" in name or name.startswith("."):
        raise ValueError("无效的文件名")
    return name


def create_dir(root: Path, name: str, parent: str = "") -> str:
    """Create a directory under *parent* (root when empty) and return its relative path."""
    name = _valid_name(name)
    base = safe_resolve(root, parent)
    if not base.exists():
        raise FileNotFoundError("父目录不存在")
    if not base.is_dir():
        raise NotADirectoryError("父路径不是目录")
    target = base / name
    if target.exists():
        raise ValueError("同名文件或目录已存在")
    target.mkdir()
    return target.relative_to(safe_resolve(root, "")).as_posix()


def validate_upload(
    root: Path,
    name: str,
    dir_rel: str,
    size: int,
    max_size: int = MAX_UPLOAD_SIZE,
) -> Path:
    """Validate an upload's name/destination/size; return the target path."""
    name = _valid_name(name)
    folder = safe_resolve(root, dir_rel)
    if not folder.is_dir():
        raise FileNotFoundError("目标目录不存在")
    if size > max_size:
        raise ValueError("文件超过大小限制")
    return folder / name


def save_upload(
    root: Path,
    dir_rel: str,
    name: str,
    data: bytes,
    max_size: int = MAX_UPLOAD_SIZE,
) -> str:
    """Persist one uploaded file and return its relative path."""
    target = validate_upload(root, name, dir_rel, len(data), max_size=max_size)
    if target.exists():
        raise ValueError("同名文件已存在")
    target.write_bytes(data)
    return target.relative_to(safe_resolve(root, "")).as_posix()


def delete_path(root: Path, rel: str) -> str:
    """Delete a file or directory (recursively) and return its relative path."""
    target = safe_resolve(root, rel)
    root_dir = safe_resolve(root, "")
    if target == root_dir:
        raise ValueError("不能删除根目录")
    if not target.exists():
        raise FileNotFoundError("文件或目录不存在")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return target.relative_to(root_dir).as_posix()
