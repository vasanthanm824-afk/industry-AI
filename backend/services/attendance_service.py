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


from sqlalchemy.exc import IntegrityError


class BaseAttendanceService(ABC):
    """Abstract interface defining the attendance business domain."""

    @abstractmethod
    def register_worker(
        self,
        worker_id: str,
        worker_name: str,
        allocated_manager: str = "Unassigned",
        department: str = "Operations",
        role: str = "Worker",
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
        allocated_manager: str = "Unassigned",
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
                existing.allocated_manager = allocated_manager
                existing.department = department
                existing.role = role
                existing.is_active = True
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
                allocated_manager=allocated_manager,
                department=department,
                role=role,
                photo_path=photo_path,
                embedding_path=embedding_path,
                is_active=True,
            )
            session.add(worker)
            session.commit()
            session.refresh(worker)
            return worker
        finally:
            if self._external_session is None:
                session.close()

    def update_worker(
        self,
        worker_id: str,
        worker_name: Optional[str] = None,
        allocated_manager: Optional[str] = None,
        department: Optional[str] = None,
        role: Optional[str] = None,
        photo_path: Optional[str] = None,
        embedding_path: Optional[str] = None,
    ) -> Optional[Worker]:
        session = self._get_session()
        try:
            worker = session.query(Worker).filter(Worker.worker_id == worker_id).first()
            if not worker:
                return None

            if worker_name is not None:
                worker.worker_name = worker_name
            if allocated_manager is not None:
                worker.allocated_manager = allocated_manager
            if department is not None:
                worker.department = department
            if role is not None:
                worker.role = role
            if photo_path is not None:
                worker.photo_path = photo_path
            if embedding_path is not None:
                worker.embedding_path = embedding_path

            session.commit()
            session.refresh(worker)
            return worker
        finally:
            if self._external_session is None:
                session.close()

    def delete_worker(self, worker_id: str) -> bool:
        session = self._get_session()
        try:
            worker = session.query(Worker).filter(Worker.worker_id == worker_id).first()
            if not worker:
                return False

            session.delete(worker)
            session.commit()
            return True
        finally:
            if self._external_session is None:
                session.close()

    def get_next_worker_id(self) -> str:
        """Finds highest numeric worker ID to auto-generate the next unique ID (e.g. W001, W002)."""
        session = self._get_session()
        try:
            workers = session.query(Worker.worker_id).all()
            existing_ids = [w[0] for w in workers]
            # Try W-series first
            w_nums = []
            for wid in existing_ids:
                if wid.upper().startswith("W") and wid[1:].isdigit():
                    w_nums.append(int(wid[1:]))
            if w_nums:
                return f"W{max(w_nums) + 1:03d}"

            # If EMP-series exists
            emp_nums = []
            for wid in existing_ids:
                if wid.upper().startswith("EMP-") and wid[4:].isdigit():
                    emp_nums.append(int(wid[4:]))
            if emp_nums:
                return f"W{max(emp_nums) + 1:03d}"

            return "W001"
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

    def list_workers(self, active_only: bool = True) -> List[Worker]:
        session = self._get_session()
        try:
            query = session.query(Worker)
            if active_only:
                query = query.filter(Worker.is_active == True)
            return query.order_by(Worker.worker_id.asc()).all()
        finally:
            if self._external_session is None:
                session.close()

    def mark_or_update_attendance(
        self,
        worker_id: str,
        worker_name: str,
        track_id: int = 1,
        confidence: float = 1.0,
        timestamp: Optional[datetime] = None,
        **kwargs,
    ) -> Tuple[Attendance, bool]:
        """
        Record attendance. If the worker was already identified today:
        - Update last_seen_time.
        - Do NOT create a duplicate row.
        - Return (record, False).
        If first time seen today:
        - Insert new record with first_seen_time.
        - Enforce database constraint & handle concurrent simultaneous requests safely.
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
            try:
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
            except IntegrityError:
                # Concurrent request already inserted this record! Rollback and return existing
                session.rollback()
                record = (
                    session.query(Attendance)
                    .filter(Attendance.worker_id == worker_id, Attendance.date == date_str)
                    .first()
                )
                if record is not None:
                    record.last_seen_time = time_str
                    record.track_id = track_id
                    session.commit()
                    session.refresh(record)
                    return record, False
                raise
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
