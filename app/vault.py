from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
from pathlib import Path

from .file_ops import create_dir
from .file_tree import VAULT_META_FILE, safe_resolve


class VaultStore:
    """管理加密文件夹的创建、密码验证和访问令牌。"""

    def __init__(self) -> None:
        self._vaults: dict[str, dict] = {}
        self._sessions: dict[str, str] = {}  # token -> vault_path
        self._lock = threading.Lock()

    @staticmethod
    def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
        """PBKDF2-SHA256 密码哈希，返回 (hash_hex, salt_hex)。"""
        if salt is None:
            salt = os.urandom(16)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
        return dk.hex(), salt.hex()

    def create_vault(self, root: Path, name: str, parent: str, password: str) -> str:
        """创建加密文件夹并写入 .vault_meta 元数据文件。"""
        rel = create_dir(root, name, parent=parent)
        folder = safe_resolve(root, rel)
        hash_hex, salt_hex = self._hash_password(password)

        meta = {"hash": hash_hex, "salt": salt_hex}
        (folder / VAULT_META_FILE).write_text(json.dumps(meta))

        with self._lock:
            self._vaults[rel] = meta

        return rel

    def verify(self, root: Path, path: str, password: str) -> bool:
        """验证密码是否正确（不生成 token）。"""
        meta = self._ensure_loaded(root, path)
        if meta is None:
            return False
        computed_hash, _ = self._hash_password(password, bytes.fromhex(meta["salt"]))
        return computed_hash == meta["hash"]

    def issue_token(self, root: Path, path: str) -> str:
        """为已解锁的加密文件夹生成访问令牌。"""
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._sessions[token] = path
        return token

    def validate_token(self, token: str, target: str) -> bool:
        """验证 token 是否对目标路径有效（包含子路径）。"""
        with self._lock:
            vault_path = self._sessions.get(token)
        if vault_path is None:
            return False
        return target == vault_path or target.startswith(vault_path + "/")

    def is_vault(self, root: Path, path: str) -> bool:
        """判断路径是否为加密文件夹。"""
        if path in self._vaults:
            return True
        folder = safe_resolve(root, path)
        return (folder / VAULT_META_FILE).exists()

    def find_vault_root(self, root: Path, rel: str) -> str | None:
        """向上查找路径所属的加密文件夹根目录，返回 vault 相对路径或 None。"""
        parts = Path(rel).parts
        for i in range(len(parts) - 1, -1, -1):
            prefix = "/".join(parts[: i + 1])
            if self.is_vault(root, prefix):
                return prefix
        return None

    def remove_vault(self, path: str) -> None:
        """删除加密文件夹时清理注册信息和相关会话。"""
        with self._lock:
            self._vaults.pop(path, None)
            stale = [t for t, p in self._sessions.items() if p == path]
            for t in stale:
                del self._sessions[t]

    def _ensure_loaded(self, root: Path, path: str) -> dict | None:
        """从内存或磁盘加载 vault 元数据。"""
        if path in self._vaults:
            return self._vaults[path]
        folder = safe_resolve(root, path)
        meta_file = folder / VAULT_META_FILE
        if not meta_file.is_file():
            return None
        meta = json.loads(meta_file.read_text())
        with self._lock:
            self._vaults[path] = meta
        return meta
