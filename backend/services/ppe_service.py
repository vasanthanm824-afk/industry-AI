"""
PPE Verification Record Service
Stores individual worker PPE checks, computes real-time compliance metrics,
and provides historical compliance reports.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models.ppe_record import PPERecord
from backend.db.session import SessionLocal, init_db


class PPEService:
    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def record_ppe_check(
        self,
        track_id: int,
        worker_id: Optional[str],
        worker_name: str,
        helmet_status: str,
        vest_status: str,
        gloves_status: str,
        overall_ppe_status: str,
        confidence: float,
        timestamp: Optional[datetime] = None,
    ) -> PPERecord:
        session = self._get_session()
        try:
            record = PPERecord(
                worker_id=worker_id,
                worker_name=worker_name or "UNKNOWN",
                track_id=track_id,
                helmet_status=helmet_status,
                vest_status=vest_status,
                gloves_status=gloves_status,
                overall_ppe_status=overall_ppe_status,
                confidence=confidence,
                timestamp=timestamp or datetime.utcnow(),
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return record
        finally:
            if self._external_session is None:
                session.close()

    def get_recent_records(self, limit: int = 50) -> List[PPERecord]:
        session = self._get_session()
        try:
            return session.query(PPERecord).order_by(PPERecord.timestamp.desc()).limit(limit).all()
        finally:
            if self._external_session is None:
                session.close()

    def get_compliance_summary(self, target_date: Optional[str] = None) -> Dict[str, any]:
        """
        Calculates empirical PPE compliance statistics.
        Does NOT fake percentages; uses real recorded counts.
        """
        session = self._get_session()
        try:
            query = session.query(PPERecord)
            if target_date:
                # filter by date string prefix
                query = query.filter(func.strftime("%Y-%m-%d", PPERecord.timestamp) == target_date)
            else:
                # Last 24 hours
                cutoff = datetime.utcnow() - timedelta(hours=24)
                query = query.filter(PPERecord.timestamp >= cutoff)

            total = query.count()
            if total == 0:
                return {
                    "total_inspections": 0,
                    "compliant_count": 0,
                    "violation_count": 0,
                    "unknown_count": 0,
                    "compliance_rate": 0.0,
                    "helmet_compliance_rate": 0.0,
                    "vest_compliance_rate": 0.0,
                    "gloves_compliance_rate": 0.0,
                }

            compliant = query.filter(PPERecord.overall_ppe_status == "COMPLIANT").count()
            violation = query.filter(PPERecord.overall_ppe_status == "VIOLATION").count()
            unknown = query.filter(PPERecord.overall_ppe_status == "UNKNOWN").count()

            helmet_comp = query.filter(PPERecord.helmet_status == "COMPLIANT").count()
            vest_comp = query.filter(PPERecord.vest_status == "COMPLIANT").count()
            gloves_comp = query.filter(PPERecord.gloves_status == "COMPLIANT").count()

            return {
                "total_inspections": total,
                "compliant_count": compliant,
                "violation_count": violation,
                "unknown_count": unknown,
                "compliance_rate": round((compliant / total) * 100, 1),
                "helmet_compliance_rate": round((helmet_comp / total) * 100, 1),
                "vest_compliance_rate": round((vest_comp / total) * 100, 1),
                "gloves_compliance_rate": round((gloves_comp / total) * 100, 1),
            }
        finally:
            if self._external_session is None:
                session.close()
