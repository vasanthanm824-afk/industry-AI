"""
Manager Authentication & Token Security Service
Handles manager login, salted password verification, and JWT session tokens.
"""

from datetime import datetime, timedelta
import os
from typing import Optional
import jwt
from sqlalchemy.orm import Session

from backend.db.models.manager import Manager
from backend.db.session import SessionLocal, init_db

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "industrial-safety-ai-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24


class AuthService:
    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session
        self.ensure_default_manager()

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def ensure_default_manager(self):
        """Ensures Administrator and Project Manager accounts exist."""
        session = self._get_session()
        try:
            admin_user = os.environ.get("ADMIN_USERNAME", "admin")
            admin_pass = os.environ.get("ADMIN_PASSWORD", "admin123")
            admin = session.query(Manager).filter(Manager.username == admin_user).first()
            if not admin:
                admin = Manager(
                    username=admin_user,
                    full_name="System Administrator",
                    email="admin@sentinel-x.local",
                    role="ADMIN",
                )
                admin.set_password(admin_pass)
                session.add(admin)
                session.commit()
            elif admin.role != "ADMIN":
                admin.role = "ADMIN"
                session.commit()

            # Seed Kumar (Project Manager)
            kumar = session.query(Manager).filter(Manager.username == "kumar").first()
            if not kumar:
                kumar = Manager(
                    username="kumar",
                    full_name="Kumar (Operations Manager)",
                    email="kumar@sentinel-x.local",
                    role="PROJECT_MANAGER",
                )
                kumar.set_password("kumar123")
                session.add(kumar)
                session.commit()

            # Seed Prakash (Project Manager)
            prakash = session.query(Manager).filter(Manager.username == "prakash").first()
            if not prakash:
                prakash = Manager(
                    username="prakash",
                    full_name="Prakash (Site Manager)",
                    email="prakash@sentinel-x.local",
                    role="PROJECT_MANAGER",
                )
                prakash.set_password("prakash123")
                session.add(prakash)
                session.commit()
        finally:
            if self._external_session is None:
                session.close()

    def authenticate_manager(self, username: str, password: str) -> Optional[Manager]:
        session = self._get_session()
        try:
            manager = session.query(Manager).filter(Manager.username == username).first()
            if manager and manager.check_password(password):
                return manager
            return None
        finally:
            if self._external_session is None:
                session.close()

    def create_access_token(self, manager: Manager) -> str:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        payload = {
            "sub": manager.username,
            "manager_id": manager.id,
            "role": manager.role,
            "exp": expire,
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        return token

    def verify_token(self, token: str) -> Optional[dict]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except Exception:
            return None

    def get_manager_by_username(self, username: str) -> Optional[Manager]:
        session = self._get_session()
        try:
            return session.query(Manager).filter(Manager.username == username).first()
        finally:
            if self._external_session is None:
                session.close()
