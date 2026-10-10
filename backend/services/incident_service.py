"""
Incident Management Service
Handles workplace safety violation lifecycle, evidence linkages, and automated alert triggers.
"""

from datetime import datetime
import secrets
from typing import Dict, List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models.incident import Incident
from backend.db.session import SessionLocal, init_db
from backend.services.alert_service import AlertService


class IncidentService:
    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session
        self.alert_service = AlertService(db_session=self._external_session)

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def create_incident(
        self,
        incident_type: str,
        severity: str,
        safety_status: str,
        description: str,
        track_id: Optional[int] = None,
        worker_id: Optional[str] = None,
        worker_name: Optional[str] = "UNKNOWN",
        zone: Optional[str] = "General Area",
        evidence_image: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ) -> Incident:
        now = timestamp or datetime.utcnow()
        inc_id = f"INC-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(2).upper()}"

        session = self._get_session()
        try:
            incident = Incident(
                incident_id=inc_id,
                incident_type=incident_type,
                worker_id=worker_id,
                worker_name=worker_name or "UNKNOWN",
                track_id=track_id,
                timestamp=now,
                zone=zone or "Unknown Zone",
                severity=severity.upper(),
                safety_status=safety_status,
                description=description,
                evidence_image=evidence_image,
                status="OPEN",
                created_at=now,
            )
            session.add(incident)
            session.commit()
            session.refresh(incident)

            # Automatically generate Manager Alert for critical/high or severe safety infractions
            if severity.upper() in ("HIGH", "CRITICAL") or incident_type in ("RESTRICTED_ZONE", "MULTIPLE_SAFETY_VIOLATION"):
                alert_msg = f"[{severity.upper()}] {incident_type} detected for {worker_name or 'Worker'} in {zone}. {description}"
                self.alert_service.create_alert(
                    incident_id=inc_id,
                    severity=severity.upper(),
                    message=alert_msg,
                    timestamp=now,
                )

            return incident
        finally:
            if self._external_session is None:
                session.close()

    def list_incidents(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        incident_type: Optional[str] = None,
        worker_id: Optional[str] = None,
        date_str: Optional[str] = None,
        limit: int = 100,
    ) -> List[Incident]:
        session = self._get_session()
        try:
            query = session.query(Incident)
            if status:
                query = query.filter(Incident.status == status.upper())
            if severity:
                query = query.filter(Incident.severity == severity.upper())
            if incident_type:
                query = query.filter(Incident.incident_type == incident_type)
            if worker_id:
                query = query.filter(Incident.worker_id == worker_id)
            if date_str:
                query = query.filter(func.strftime("%Y-%m-%d", Incident.timestamp) == date_str)

            return query.order_by(Incident.timestamp.desc()).limit(limit).all()
        finally:
            if self._external_session is None:
                session.close()

    def get_incident(self, incident_id: str) -> Optional[Incident]:
        session = self._get_session()
        try:
            return session.query(Incident).filter(Incident.incident_id == incident_id).first()
        finally:
            if self._external_session is None:
                session.close()

    def acknowledge_incident(self, incident_id: str, manager_name: str = "Manager") -> Optional[Incident]:
        session = self._get_session()
        try:
            incident = session.query(Incident).filter(Incident.incident_id == incident_id).first()
            if incident:
                incident.status = "ACKNOWLEDGED"
                action_text = f"Acknowledged by {manager_name} at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}."
                incident.manager_action = f"{incident.manager_action}\n{action_text}".strip() if incident.manager_action else action_text
                session.commit()
                session.refresh(incident)
            return incident
        finally:
            if self._external_session is None:
                session.close()

    def resolve_incident(self, incident_id: str, action_taken: str, manager_name: str = "Manager") -> Optional[Incident]:
        session = self._get_session()
        try:
            incident = session.query(Incident).filter(Incident.incident_id == incident_id).first()
            if incident:
                now = datetime.utcnow()
                incident.status = "RESOLVED"
                incident.resolved_at = now
                resolve_text = f"Resolved by {manager_name} ({now.strftime('%Y-%m-%d %H:%M:%S UTC')}): {action_taken}"
                incident.manager_action = f"{incident.manager_action}\n{resolve_text}".strip() if incident.manager_action else resolve_text
                session.commit()
                session.refresh(incident)
            return incident
        finally:
            if self._external_session is None:
                session.close()

    def get_incident_summary(self, target_date: Optional[str] = None) -> Dict[str, any]:
        session = self._get_session()
        try:
            query = session.query(Incident)
            if target_date:
                query = query.filter(func.strftime("%Y-%m-%d", Incident.timestamp) == target_date)

            total = query.count()
            open_count = query.filter(Incident.status == "OPEN").count()
            ack_count = query.filter(Incident.status == "ACKNOWLEDGED").count()
            res_count = query.filter(Incident.status == "RESOLVED").count()
            crit_count = query.filter(Incident.severity == "CRITICAL").count()
            high_count = query.filter(Incident.severity == "HIGH").count()

            return {
                "total_incidents": total,
                "open_incidents": open_count,
                "acknowledged_incidents": ack_count,
                "resolved_incidents": res_count,
                "critical_count": crit_count,
                "high_count": high_count,
            }
        finally:
            if self._external_session is None:
                session.close()
