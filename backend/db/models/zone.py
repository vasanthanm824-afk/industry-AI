"""
Zone Data Model
Represents spatial areas (Safe, Warning, Restricted) for geofencing and worker localization.
"""

from datetime import datetime
import json
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from backend.db.session import Base


class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    zone_id = Column(String(64), unique=True, index=True, nullable=False)
    zone_name = Column(String(128), nullable=False)
    zone_type = Column(String(32), nullable=False)  # "SAFE", "WARNING", "RESTRICTED"
    polygon_json = Column(Text, nullable=False, default="[]")  # List of [x, y] coordinates
    color_hex = Column(String(16), default="#ef4444")
    is_active = Column(Boolean, default=True)
    description = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def polygon(self):
        try:
            return json.loads(self.polygon_json) if self.polygon_json else []
        except Exception:
            return []

    @polygon.setter
    def polygon(self, points):
        self.polygon_json = json.dumps(points)

    def to_dict(self):
        return {
            "id": self.id,
            "zone_id": self.zone_id,
            "zone_name": self.zone_name,
            "zone_type": self.zone_type,
            "polygon": self.polygon,
            "color_hex": self.color_hex,
            "is_active": self.is_active,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
