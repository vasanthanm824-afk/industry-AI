"""
Incident Data Model
Tracks workplace safety breaches, evidence snapshots, severity, and manager resolution workflows.
"""

from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text
from backend.db.session import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    incident_id = Column(String(64), unique=True, index=True, nullable=False)
    incident_type = Column(String(64), nullable=False, index=True)  # PPE_VIOLATION, RESTRICTED_ZONE, MULTIPLE_SAFETY_VIOLATION, OTHER
    worker_id = Column(String(64), nullable=True, index=True)
    worker_name = Column(String(128), default="UNKNOWN")
    track_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    zone = Column(String(128), nullable=True, default="Unknown Zone")
    severity = Column(String(32), nullable=False, default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    safety_status = Column(String(64), nullable=False, default="PPE_VIOLATION")  # SAFE, PPE_VIOLATION, RESTRICTED_ZONE_VIOLATION, MULTIPLE_VIOLATIONS, UNKNOWN
    description = Column(Text, nullable=False)
    evidence_image = Column(String(256), nullable=True)
    status = Column(String(32), default="OPEN", index=True)  # OPEN, ACKNOWLEDGED, RESOLVED
    manager_action = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "incident_id": self.incident_id,
            "incident_type": self.incident_type,
            "worker_id": self.worker_id,
            "worker_name": self.worker_name,
            "track_id": self.track_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "zone": self.zone,
            "severity": self.severity,
            "safety_status": self.safety_status,
            "description": self.description,
            "evidence_image": self.evidence_image,
            "status": self.status,
            "manager_action": self.manager_action,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }
