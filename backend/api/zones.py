"""
Zones Geofencing API Router
Provides CRUD endpoints to manage industrial spatial zones (Safe, Warning, Restricted).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.zone_service import ZoneService

router = APIRouter(prefix="/api/zones", tags=["Zones Geofencing"])


class ZoneCreateRequest(BaseModel):
    zone_id: str
    zone_name: str
    zone_type: str  # SAFE, WARNING, RESTRICTED
    polygon: List[List[float]]
    color_hex: Optional[str] = "#ef4444"
    description: Optional[str] = ""


class ZoneUpdateRequest(BaseModel):
    zone_name: Optional[str] = None
    zone_type: Optional[str] = None
    polygon: Optional[List[List[float]]] = None
    color_hex: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


@router.get("")
def list_zones(
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    service = ZoneService(db_session=db)
    zones = service.list_zones(active_only=active_only)
    return {"total": len(zones), "zones": [z.to_dict() for z in zones]}


@router.get("/{zone_id}")
def get_zone(zone_id: str, db: Session = Depends(get_db)):
    service = ZoneService(db_session=db)
    zone = service.get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return zone.to_dict()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_zone(
    req: ZoneCreateRequest,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = ZoneService(db_session=db)
    existing = service.get_zone(req.zone_id)
    if existing:
        raise HTTPException(status_code=400, detail=f"Zone ID '{req.zone_id}' already exists.")

    zone = service.create_zone(
        zone_id=req.zone_id,
        zone_name=req.zone_name,
        zone_type=req.zone_type,
        polygon=req.polygon,
        color_hex=req.color_hex or "#ef4444",
        description=req.description or "",
    )
    return {"message": "Zone created successfully.", "zone": zone.to_dict()}


@router.put("/{zone_id}")
def update_zone(
    zone_id: str,
    req: ZoneUpdateRequest,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = ZoneService(db_session=db)
    zone = service.update_zone(
        zone_id=zone_id,
        zone_name=req.zone_name,
        zone_type=req.zone_type,
        polygon=req.polygon,
        color_hex=req.color_hex,
        is_active=req.is_active,
        description=req.description,
    )
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return {"message": "Zone updated successfully.", "zone": zone.to_dict()}


@router.delete("/{zone_id}")
def delete_zone(
    zone_id: str,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    service = ZoneService(db_session=db)
    success = service.delete_zone(zone_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return {"message": f"Zone '{zone_id}' deleted successfully."}
