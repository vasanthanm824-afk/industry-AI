"""
Attendance Router
Retrieves daily and historical shift attendance logs with date filtering.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.models.worker import Worker
from backend.db.session import get_db
from backend.services.attendance_service import AttendanceService

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


@router.get("")
def get_attendance(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to today)"),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")
    service = AttendanceService(db_session=db)
    records = service.get_today_attendance(date_str=target_date)

    total_registered = db.query(Worker).filter(Worker.is_active == True).count()

    enriched_records = []
    for r in records:
        w = db.query(Worker).filter(Worker.worker_id == r.worker_id).first()
        item = r.to_dict()
        item["department"] = w.department if w else "Operations"
        item["role"] = w.role if w else "Worker"
        item["photo_path"] = w.photo_path if w else None
        enriched_records.append(item)

    return {
        "date": target_date,
        "total_present": len(records),
        "total_registered": total_registered,
        "attendance_rate": round((len(records) / max(1, total_registered)) * 100, 1),
        "records": enriched_records,
    }
