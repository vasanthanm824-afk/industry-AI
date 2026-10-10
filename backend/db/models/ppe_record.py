"""
PPE Verification Record Model
Stores individual PPE compliance audits calculated per detected/tracked worker.
"""

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String
from backend.db.session import Base


class PPERecord(Base):
    __tablename__ = "ppe_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    worker_id = Column(String(64), index=True, nullable=True)
    worker_name = Column(String(128), default="UNKNOWN")
    track_id = Column(Integer, index=True, nullable=False)
    helmet_status = Column(String(32), nullable=False, default="UNKNOWN")  # COMPLIANT, VIOLATION, UNKNOWN
    vest_status = Column(String(32), nullable=False, default="UNKNOWN")    # COMPLIANT, VIOLATION, UNKNOWN
    gloves_status = Column(String(32), nullable=False, default="UNKNOWN")  # COMPLIANT, VIOLATION, UNKNOWN
    overall_ppe_status = Column(String(32), nullable=False, default="UNKNOWN")  # COMPLIANT, VIOLATION, UNKNOWN
    confidence = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "worker_id": self.worker_id,
            "worker_name": self.worker_name,
            "track_id": self.track_id,
            "helmet_status": self.helmet_status,
            "vest_status": self.vest_status,
            "gloves_status": self.gloves_status,
            "overall_ppe_status": self.overall_ppe_status,
            "confidence": round(self.confidence, 4),
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }
