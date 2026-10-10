"""
Incident Management API Router
Handles safety breach investigations, evidence inspection, and manager lifecycle actions.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.incident_service import IncidentService

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])


class AcknowledgeRequest(BaseModel):
    manager_note: Optional[str] = "Acknowledged by operations manager."


class ResolveRequest(BaseModel):
    action_taken: str


@router.get("")
def list_incidents(
    status: Optional[str] = Query(None, description="Filter: OPEN, ACKNOWLEDGED, RESOLVED"),
    severity: Optional[str] = Query(None, description="Filter: LOW, MEDIUM, HIGH, CRITICAL"),
    incident_type: Optional[str] = Query(None, description="Filter: PPE_VIOLATION, RESTRICTED_ZONE, etc."),
    worker_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = IncidentService(db_session=db)
    incidents = service.list_incidents(
        status=status,
        severity=severity,
        incident_type=incident_type,
        worker_id=worker_id,
        date_str=date,
        limit=limit,
    )
    summary = service.get_incident_summary(target_date=date)
    return {
        "summary": summary,
        "total": len(incidents),
        "incidents": [i.to_dict() for i in incidents],
    }


@router.get("/{incident_id}")
def get_incident(
    incident_id: str,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = IncidentService(db_session=db)
    incident = service.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    return incident.to_dict()


@router.post("/{incident_id}/acknowledge")
def acknowledge_incident(
    incident_id: str,
    req: AcknowledgeRequest,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = IncidentService(db_session=db)
    incident = service.acknowledge_incident(incident_id, manager_name=manager.full_name)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    return {
        "message": f"Incident {incident_id} acknowledged.",
        "incident": incident.to_dict(),
    }


@router.post("/{incident_id}/resolve")
def resolve_incident(
    incident_id: str,
    req: ResolveRequest,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = IncidentService(db_session=db)
    incident = service.resolve_incident(
        incident_id=incident_id,
        action_taken=req.action_taken,
        manager_name=manager.full_name,
    )
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    return {
        "message": f"Incident {incident_id} marked as RESOLVED.",
        "incident": incident.to_dict(),
    }
