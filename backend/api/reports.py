"""
Reports & Compliance Export API Router
Generates downloadable and queryable reports for Attendance, PPE, Zones, Incidents, and Daily Summary.
Supports format=json and format=csv.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.report_service import ReportService

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/{report_type}")
def get_report(
    report_type: str,
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to today)"),
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")
    service = ReportService(db_session=db)

    report_type = report_type.lower()
    if report_type == "attendance":
        data = service.generate_attendance_report(target_date)
    elif report_type == "ppe":
        data = service.generate_ppe_compliance_report(target_date)
    elif report_type == "zones":
        data = service.generate_zone_violation_report(target_date)
    elif report_type == "incidents":
        data = service.generate_incident_report(target_date)
    elif report_type == "daily-summary":
        summary = service.generate_daily_safety_summary(target_date)
        if format == "csv":
            csv_content = service.to_csv_string([summary])
            return Response(
                content=csv_content,
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=safety_summary_{target_date}.csv"},
            )
        return summary
    else:
        raise HTTPException(
            status_code=400,
            detail="Unknown report type. Supported: 'attendance', 'ppe', 'zones', 'incidents', 'daily-summary'.",
        )

    if format == "csv":
        csv_content = service.to_csv_string(data)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={report_type}_report_{target_date}.csv"},
        )

    return {
        "report_type": report_type,
        "date": target_date,
        "total_rows": len(data),
        "data": data,
    }
