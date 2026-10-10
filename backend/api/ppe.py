"""
PPE Verification API Router
Returns individual PPE inspection records and real-time compliance metrics.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.ppe_service import PPEService

router = APIRouter(prefix="/api/ppe", tags=["PPE Verification"])


@router.get("/records")
def get_recent_ppe_records(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = PPEService(db_session=db)
    records = service.get_recent_records(limit=limit)
    return {"total": len(records), "records": [r.to_dict() for r in records]}


@router.get("/summary")
def get_ppe_summary(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format (defaults to last 24h)"),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = PPEService(db_session=db)
    summary = service.get_compliance_summary(target_date=date)
    return summary
