"""
Worker Data Model
Stores enrolled worker biometric references, department, role, and metadata.
"""

from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from backend.db.session import Base


class Worker(Base):
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    worker_id = Column(String(64), unique=True, index=True, nullable=False)
    worker_name = Column(String(128), nullable=False)
    department = Column(String(64), nullable=True, default="Operations")
    role = Column(String(64), nullable=True, default="Worker")
    photo_path = Column(String(256), nullable=True)
    embedding_path = Column(String(256), nullable=True)
    allocated_manager = Column(String(128), nullable=True, default="Unassigned")
    registered_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "worker_id": self.worker_id,
            "worker_name": self.worker_name,
            "allocated_manager": self.allocated_manager or "Unassigned",
            "department": self.department or "Operations",
            "role": self.role or "Worker",
            "photo_path": self.photo_path,
            "embedding_path": self.embedding_path,
            "registered_at": self.registered_at.isoformat() if self.registered_at else None,
            "is_active": self.is_active,
        }
