"""
Detection Event Data Model
Stores live worker telemetry snapshots, track IDs, spatial coordinates, and safety statuses.
"""

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String
from backend.db.session import Base


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    track_id = Column(Integer, index=True, nullable=False)
    worker_id = Column(String(64), index=True, nullable=True)
    worker_name = Column(String(128), default="UNKNOWN")
    bbox_str = Column(String(64), nullable=True)  # "x1,y1,x2,y2"
    confidence = Column(Float, default=0.0)
    zone_name = Column(String(128), default="Safe Zone")
    safety_status = Column(String(64), default="SAFE")
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "track_id": self.track_id,
            "worker_id": self.worker_id,
            "worker_name": self.worker_name,
            "bbox": [int(v) for v in self.bbox_str.split(",")] if self.bbox_str else [],
            "confidence": round(self.confidence, 4),
            "zone_name": self.zone_name,
            "safety_status": self.safety_status,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }
