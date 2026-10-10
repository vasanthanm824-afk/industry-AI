"""
Manager Alert Dispatch & Notification Service
Manages real-time safety alert broadcasts and notification acknowledgments.
"""

from datetime import datetime
import os
import secrets
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from backend.db.models.alert import Alert
from backend.db.session import SessionLocal, init_db


class AlertService:
    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def create_alert(
        self,
        incident_id: Optional[str],
        severity: str,
        message: str,
        timestamp: Optional[datetime] = None,
    ) -> Alert:
        now = timestamp or datetime.utcnow()
        alert_id = f"ALT-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(2).upper()}"

        session = self._get_session()
        try:
            alert = Alert(
                alert_id=alert_id,
                incident_id=incident_id,
                severity=severity.upper(),
                message=message,
                timestamp=now,
                is_read=False,
            )
            session.add(alert)
            session.commit()
            session.refresh(alert)
            return alert
        finally:
            if self._external_session is None:
                session.close()

    def list_alerts(self, unread_only: bool = False, limit: int = 50) -> List[Alert]:
        session = self._get_session()
        try:
            query = session.query(Alert)
            if unread_only:
                query = query.filter(Alert.is_read == False)
            return query.order_by(Alert.timestamp.desc()).limit(limit).all()
        finally:
            if self._external_session is None:
                session.close()

    def get_unread_count(self) -> int:
        session = self._get_session()
        try:
            return session.query(Alert).filter(Alert.is_read == False).count()
        finally:
            if self._external_session is None:
                session.close()

    def mark_as_read(self, alert_id: str) -> Optional[Alert]:
        session = self._get_session()
        try:
            alert = session.query(Alert).filter(Alert.alert_id == alert_id).first()
            if alert:
                alert.is_read = True
                session.commit()
                session.refresh(alert)
            return alert
        finally:
            if self._external_session is None:
                session.close()

    def mark_all_as_read(self) -> int:
        session = self._get_session()
        try:
            updated = session.query(Alert).filter(Alert.is_read == False).update({"is_read": True})
            session.commit()
            return updated
        finally:
            if self._external_session is None:
                session.close()
