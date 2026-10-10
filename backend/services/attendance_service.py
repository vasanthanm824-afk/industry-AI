"""
Attendance Business Logic Service
Provides abstract interface and SQLAlchemy implementation for worker registration
and automatic, deduplicated shift attendance tracking.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session

from backend.db.models.attendance import Attendance
from backend.db.models.worker import Worker
from backend.db.session import SessionLocal, init_db


class BaseAttendanceService(ABC):
    """Abstract interface defining the attendance business domain."""

    @abstractmethod
    def register_worker(
        self,
        worker_id: str,
        worker_name: str,
        department: str,
        role: str,
        photo_path: Optional[str] = None,
        embedding_path: Optional[str] = None,
    ) -> Worker:
        pass

    @abstractmethod
    def mark_or_update_attendance(
        self,
        worker_id: str,
        worker_name: str,
        track_id: int,
        confidence: float,
        timestamp: Optional[datetime] = None,
    ) -> Tuple[Attendance, bool]:
        """
        Record attendance or update last-seen timestamp.
        Returns:
            Tuple of (attendance_record, is_new_check_in).
        """
        pass

    @abstractmethod
    def get_today_attendance(self, date_str: Optional[str] = None) -> List[Attendance]:
        pass

    @abstractmethod
    def is_worker_present_today(self, worker_id: str, date_str: Optional[str] = None) -> bool:
        pass


class AttendanceService(BaseAttendanceService):
    """
    Production-ready SQLAlchemy attendance service implementation.
    Handles thread-safe transactions and prevents duplicate daily attendance.
    """

    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def register_worker(
        self,
        worker_id: str,
        worker_name: str,
        department: str = "Operations",
        role: str = "Worker",
        photo_path: Optional[str] = None,
        embedding_path: Optional[str] = None,
    ) -> Worker:
        session = self._get_session()
        try:
            existing = session.query(Worker).filter(Worker.worker_id == worker_id).first()
            if existing:
                existing.worker_name = worker_name
                existing.department = department
                existing.role = role
                if photo_path:
                    existing.photo_path = photo_path
                if embedding_path:
                    existing.embedding_path = embedding_path
                session.commit()
                session.refresh(existing)
                return existing

            worker = Worker(
                worker_id=worker_id,
                worker_name=worker_name,
                department=department,
                role=role,
                photo_path=photo_path,
                embedding_path=embedding_path,
            )
            session.add(worker)
            session.commit()
            session.refresh(worker)
            return worker
        finally:
            if self._external_session is None:
                session.close()

    def get_worker(self, worker_id: str) -> Optional[Worker]:
        session = self._get_session()
        try:
            return session.query(Worker).filter(Worker.worker_id == worker_id).first()
        finally:
            if self._external_session is None:
                session.close()

    def list_workers(self) -> List[Worker]:
        session = self._get_session()
        try:
            return session.query(Worker).filter(Worker.is_active == True).all()
        finally:
            if self._external_session is None:
                session.close()

    def mark_or_update_attendance(
        self,
        worker_id: str,
        worker_name: str,
        track_id: int,
        confidence: float,
        timestamp: Optional[datetime] = None,
    ) -> Tuple[Attendance, bool]:
        """
        Record attendance. If the worker was already identified today:
        - Update last_seen_time.
        - Do NOT create a duplicate row.
        - Return (record, False).
        If first time seen today:
        - Insert new record with first_seen_time.
        - Return (record, True).
        """
        now = timestamp if timestamp is not None else datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")

        session = self._get_session()
        try:
            record = (
                session.query(Attendance)
                .filter(Attendance.worker_id == worker_id, Attendance.date == date_str)
                .first()
            )

            if record is not None:
                # Worker already checked in today; update last-seen timestamp and track ID
                record.last_seen_time = time_str
                record.track_id = track_id
                if confidence > record.confidence:
                    record.confidence = confidence
                session.commit()
                session.refresh(record)
                return record, False

            # First time seen today -> mark new attendance entry
            new_record = Attendance(
                worker_id=worker_id,
                worker_name=worker_name,
                date=date_str,
                first_seen_time=time_str,
                last_seen_time=time_str,
                attendance_status="PRESENT",
                confidence=confidence,
                track_id=track_id,
            )
            session.add(new_record)
            session.commit()
            session.refresh(new_record)
            return new_record, True
        finally:
            if self._external_session is None:
                session.close()

    def get_today_attendance(self, date_str: Optional[str] = None) -> List[Attendance]:
        target_date = date_str or datetime.now().strftime("%Y-%m-%d")
        session = self._get_session()
        try:
            return session.query(Attendance).filter(Attendance.date == target_date).all()
        finally:
            if self._external_session is None:
                session.close()

    def is_worker_present_today(self, worker_id: str, date_str: Optional[str] = None) -> bool:
        target_date = date_str or datetime.now().strftime("%Y-%m-%d")
        session = self._get_session()
        try:
            count = (
                session.query(Attendance)
                .filter(Attendance.worker_id == worker_id, Attendance.date == target_date)
                .count()
            )
            return count > 0
        finally:
            if self._external_session is None:
                session.close()
