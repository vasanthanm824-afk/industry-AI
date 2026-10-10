"""
Attendance Data Model
Tracks first-seen entry time, last-seen timestamp, confidence, and associated tracking ID.
Enforces daily uniqueness per worker to prevent duplicate attendance logs.
"""

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String, UniqueConstraint
from backend.db.session import Base


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    worker_id = Column(String(64), index=True, nullable=False)
    worker_name = Column(String(128), nullable=False)
    date = Column(String(10), index=True, nullable=False)  # Format: YYYY-MM-DD
    first_seen_time = Column(String(8), nullable=False)    # Format: HH:MM:SS
    last_seen_time = Column(String(8), nullable=False)     # Format: HH:MM:SS
    attendance_status = Column(String(32), default="PRESENT")
    confidence = Column(Float, default=0.0)
    track_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Prevent duplicate attendance for the same worker on the same date
    __table_args__ = (
        UniqueConstraint("worker_id", "date", name="uq_worker_date"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "worker_id": self.worker_id,
            "worker_name": self.worker_name,
            "date": self.date,
            "first_seen_time": self.first_seen_time,
            "last_seen_time": self.last_seen_time,
            "attendance_status": self.attendance_status,
            "confidence": round(self.confidence, 4),
            "track_id": self.track_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
