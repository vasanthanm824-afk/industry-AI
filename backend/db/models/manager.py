"""
Manager Data Model
Stores platform manager credentials, roles, and profile information.
Uses salted PBKDF2 hash for password security.
"""

from datetime import datetime
import hashlib
import os
import secrets
from sqlalchemy import Column, DateTime, Integer, String
from backend.db.session import Base


def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Generates a secure salted PBKDF2-HMAC-SHA256 password hash."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return key.hex(), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verifies a plaintext password against the stored hash and salt."""
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return secrets.compare_digest(key.hex(), password_hash)


class Manager(Base):
    __tablename__ = "managers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    salt = Column(String(64), nullable=False)
    full_name = Column(String(128), nullable=False)
    email = Column(String(128), nullable=True)
    role = Column(String(64), default="SAFETY_MANAGER")
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_password(self, password: str):
        self.password_hash, self.salt = hash_password(password)

    def check_password(self, password: str) -> bool:
        return verify_password(password, self.password_hash, self.salt)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
