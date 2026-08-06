from __future__ import annotations

import hashlib
import os


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    """PBKDF2-SHA256 密码哈希，返回 (hash_hex, salt_hex)。"""
    if salt is None:
        salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return dk.hex(), salt.hex()


def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    """校验密码是否与既有哈希匹配。"""
    try:
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 100000)
    except ValueError:
        return False
    return dk.hex() == hash_hex
