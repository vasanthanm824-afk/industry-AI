"""
Manager Alerts API Router
Provides real-time alert notifications, unread counters, and acknowledgment actions.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.alert_service import AlertService

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("")
def list_alerts(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = AlertService(db_session=db)
    alerts = service.list_alerts(unread_only=unread_only, limit=limit)
    unread_count = service.get_unread_count()
    return {
        "unread_count": unread_count,
        "total": len(alerts),
        "alerts": [a.to_dict() for a in alerts],
    }


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = AlertService(db_session=db)
    return {"unread_count": service.get_unread_count()}


@router.post("/{alert_id}/read")
def mark_alert_read(
    alert_id: str,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = AlertService(db_session=db)
    alert = service.mark_as_read(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found.")
    return {"message": "Alert marked as read.", "alert": alert.to_dict()}


@router.post("/read-all")
def mark_all_alerts_read(
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = AlertService(db_session=db)
    count = service.mark_all_as_read()
    return {"message": f"Marked {count} alerts as read.", "updated_count": count}
