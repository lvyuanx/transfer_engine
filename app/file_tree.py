from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path


def _within_root(root: Path, target: Path) -> bool:
    root_resolved = root.resolve()
    try:
        target.resolve().relative_to(root_resolved)
        return True
    except ValueError:
        return False


def safe_resolve(root: Path, rel: str = "") -> Path:
    """Resolve *rel* inside *root*; raise ValueError if it escapes."""
    rel = (rel or "").strip()
    if not rel:
        return root.resolve()
    path = Path(rel)
    if path.is_absolute():
        raise ValueError("absolute paths are not allowed")
    target = (root / path).resolve()
    if not _within_root(root, target):
        raise ValueError("path escapes shared directory")
    return target


def list_entries(root: Path, rel: str = "") -> list[dict]:
    """List visible entries of a directory as plain dicts, dirs first."""
    target = safe_resolve(root, rel)
    if not target.is_dir():
        raise FileNotFoundError(f"not a directory: {rel or '/'}")

    root_resolved = root.resolve()
    rel_base = target.relative_to(root_resolved)
    entries: list[dict] = []

    for child in target.iterdir():
        name = child.name
        if name.startswith("."):
            continue
        if child.is_symlink() and not _within_root(root, child):
            continue
        is_dir = child.is_dir()
        stat = child.stat()
        rel_path = (rel_base / name).as_posix() if str(rel_base) != "." else name
        entries.append(
            {
                "name": name,
                "path": rel_path,
                "type": "dir" if is_dir else "file",
                "size": None if is_dir else stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
            }
        )

    entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
    return entries


def build_zip(root: Path, rel: str, dest: Path) -> Path:
    """Zip *rel* (file or folder) into *dest*; hidden entries are skipped."""
    target = safe_resolve(root, rel)
    if not target.exists():
        raise FileNotFoundError(f"not found: {rel or '/'}")

    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        if target.is_dir():
            root_resolved = root.resolve()
            for child in target.rglob("*"):
                try:
                    child.relative_to(root_resolved)
                except ValueError:
                    continue
                parts = child.relative_to(target).parts
                if any(part.startswith(".") for part in parts):
                    continue
                if child.is_symlink() and not _within_root(root, child):
                    continue
                if child.is_dir():
                    continue
                zf.write(child, arcname=child.relative_to(target).as_posix())
        else:
            zf.write(target, arcname=target.name)
    return dest
