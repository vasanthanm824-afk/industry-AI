"""
Industrial Safety & Compliance Report Generation Service
Generates auditable reports for Attendance, PPE Compliance, Zone Violations, Incidents,
and Daily Executive Safety Summaries with CSV and JSON export capabilities.
"""

import csv
from datetime import datetime
import io
import json
from typing import Any, Dict, List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models.attendance import Attendance
from backend.db.models.incident import Incident
from backend.db.models.ppe_record import PPERecord
from backend.db.models.worker import Worker
from backend.db.session import SessionLocal, init_db
from backend.services.weather_service import WeatherService


class ReportService:
    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session
        self.weather_service = WeatherService(db_session=self._external_session)

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def generate_attendance_report(self, date_str: Optional[str] = None) -> List[Dict[str, Any]]:
        target_date = date_str or datetime.utcnow().strftime("%Y-%m-%d")
        session = self._get_session()
        try:
            records = (
                session.query(Attendance)
                .filter(Attendance.date == target_date)
                .order_by(Attendance.first_seen_time.asc())
                .all()
            )
            report = []
            for r in records:
                # Join with Worker to get department & role
                w = session.query(Worker).filter(Worker.worker_id == r.worker_id).first()
                report.append({
                    "date": r.date,
                    "worker_id": r.worker_id,
                    "worker_name": r.worker_name,
                    "department": w.department if w else "Operations",
                    "role": w.role if w else "Worker",
                    "first_seen_time": r.first_seen_time,
                    "last_seen_time": r.last_seen_time,
                    "status": r.attendance_status,
                    "confidence": round(r.confidence, 4),
                    "track_id": r.track_id,
                })
            return report
        finally:
            if self._external_session is None:
                session.close()

    def generate_ppe_compliance_report(self, date_str: Optional[str] = None) -> List[Dict[str, Any]]:
        target_date = date_str or datetime.utcnow().strftime("%Y-%m-%d")
        session = self._get_session()
        try:
            # Query grouped by worker
            workers = session.query(Worker).all()
            report = []

            for w in workers:
                checks = (
                    session.query(PPERecord)
                    .filter(
                        PPERecord.worker_id == w.worker_id,
                        func.strftime("%Y-%m-%d", PPERecord.timestamp) == target_date,
                    )
                    .all()
                )
                total_checks = len(checks)
                if total_checks == 0:
                    continue

                compliant = sum(1 for c in checks if c.overall_ppe_status == "COMPLIANT")
                violations = sum(1 for c in checks if c.overall_ppe_status == "VIOLATION")
                unknowns = sum(1 for c in checks if c.overall_ppe_status == "UNKNOWN")
                helmet_ok = sum(1 for c in checks if c.helmet_status == "COMPLIANT")
                vest_ok = sum(1 for c in checks if c.vest_status == "COMPLIANT")
                gloves_ok = sum(1 for c in checks if c.gloves_status == "COMPLIANT")

                report.append({
                    "date": target_date,
                    "worker_id": w.worker_id,
                    "worker_name": w.worker_name,
                    "department": w.department,
                    "total_checks": total_checks,
                    "compliant_checks": compliant,
                    "violation_checks": violations,
                    "unknown_checks": unknowns,
                    "compliance_rate_pct": round((compliant / total_checks) * 100, 1),
                    "helmet_rate_pct": round((helmet_ok / total_checks) * 100, 1),
                    "vest_rate_pct": round((vest_ok / total_checks) * 100, 1),
                    "gloves_rate_pct": round((gloves_ok / total_checks) * 100, 1),
                })
            return report
        finally:
            if self._external_session is None:
                session.close()

    def generate_zone_violation_report(self, date_str: Optional[str] = None) -> List[Dict[str, Any]]:
        target_date = date_str or datetime.utcnow().strftime("%Y-%m-%d")
        session = self._get_session()
        try:
            incidents = (
                session.query(Incident)
                .filter(
                    Incident.incident_type.in_(["RESTRICTED_ZONE", "MULTIPLE_SAFETY_VIOLATION"]),
                    func.strftime("%Y-%m-%d", Incident.timestamp) == target_date,
                )
                .order_by(Incident.timestamp.desc())
                .all()
            )
            report = []
            for inc in incidents:
                report.append({
                    "incident_id": inc.incident_id,
                    "timestamp": inc.timestamp.strftime("%Y-%m-%d %H:%M:%S") if inc.timestamp else target_date,
                    "zone_name": inc.zone,
                    "worker_id": inc.worker_id or "UNREGISTERED",
                    "worker_name": inc.worker_name,
                    "track_id": inc.track_id,
                    "severity": inc.severity,
                    "description": inc.description,
                    "status": inc.status,
                    "resolution": inc.manager_action or "Pending Review",
                })
            return report
        finally:
            if self._external_session is None:
                session.close()

    def generate_incident_report(self, date_str: Optional[str] = None) -> List[Dict[str, Any]]:
        target_date = date_str or datetime.utcnow().strftime("%Y-%m-%d")
        session = self._get_session()
        try:
            incidents = (
                session.query(Incident)
                .filter(func.strftime("%Y-%m-%d", Incident.timestamp) == target_date)
                .order_by(Incident.timestamp.desc())
                .all()
            )
            report = [inc.to_dict() for inc in incidents]
            return report
        finally:
            if self._external_session is None:
                session.close()

    def generate_daily_safety_summary(self, date_str: Optional[str] = None) -> Dict[str, Any]:
        target_date = date_str or datetime.utcnow().strftime("%Y-%m-%d")
        session = self._get_session()
        try:
            total_registered = session.query(Worker).filter(Worker.is_active == True).count()
            attendance_count = session.query(Attendance).filter(Attendance.date == target_date).count()

            incidents_today = session.query(Incident).filter(func.strftime("%Y-%m-%d", Incident.timestamp) == target_date).all()
            total_incidents = len(incidents_today)
            open_incidents = sum(1 for i in incidents_today if i.status == "OPEN")
            critical_incidents = sum(1 for i in incidents_today if i.severity == "CRITICAL")
            high_incidents = sum(1 for i in incidents_today if i.severity == "HIGH")

            # PPE stats for date
            ppe_checks = session.query(PPERecord).filter(func.strftime("%Y-%m-%d", PPERecord.timestamp) == target_date).all()
            total_ppe_checks = len(ppe_checks)
            compliant_ppe = sum(1 for c in ppe_checks if c.overall_ppe_status == "COMPLIANT")
            overall_ppe_compliance = round((compliant_ppe / total_ppe_checks) * 100, 1) if total_ppe_checks > 0 else 100.0

            weather = self.weather_service.get_current_weather()

            return {
                "date": target_date,
                "total_registered_workers": total_registered,
                "workers_present_today": attendance_count,
                "attendance_rate_pct": round((attendance_count / max(1, total_registered)) * 100, 1),
                "total_incidents": total_incidents,
                "open_incidents": open_incidents,
                "critical_incidents": critical_incidents,
                "high_incidents": high_incidents,
                "ppe_inspections_total": total_ppe_checks,
                "overall_ppe_compliance_pct": overall_ppe_compliance,
                "weather_condition": weather.get("condition"),
                "weather_temperature_c": weather.get("temperature_c"),
                "weather_risk_level": weather.get("risk_level"),
                "facility_status": "CRITICAL_ACTION_REQUIRED" if (critical_incidents > 0 or open_incidents > 5) else "NORMAL_OPERATIONS",
            }
        finally:
            if self._external_session is None:
                session.close()

    @staticmethod
    def to_csv_string(data: List[Dict[str, Any]]) -> str:
        """Converts a list of dictionary rows into standard CSV string."""
        if not data:
            return ""
        output = io.StringIO()
        headers = list(data[0].keys())
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        for row in data:
            writer.writerow(row)
        return output.getvalue()
