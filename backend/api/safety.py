"""
Safety Engine API Router
Provides real-time safety status aggregation across workers, zones, and environmental factors.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.cctv import stream_manager
from backend.api.deps import get_current_manager
from backend.db.models.incident import Incident
from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.weather_service import WeatherService

router = APIRouter(prefix="/api/safety", tags=["Safety Engine"])


@router.get("/status")
def get_current_safety_overview(db: Session = Depends(get_db)):
    """
    Returns live aggregated safety status across all active tracks and facility sensors.
    """
    tracks = stream_manager.latest_tracks
    weather_service = WeatherService(db_session=db)
    weather = weather_service.get_current_weather()

    open_incidents_count = db.query(Incident).filter(Incident.status == "OPEN").count()
    critical_incidents_count = db.query(Incident).filter(Incident.severity == "CRITICAL", Incident.status == "OPEN").count()

    safe_count = sum(1 for t in tracks if t.get("safety_status") == "SAFE")
    ppe_viol_count = sum(1 for t in tracks if t.get("safety_status") == "PPE_VIOLATION")
    zone_viol_count = sum(1 for t in tracks if t.get("safety_status") == "RESTRICTED_ZONE_VIOLATION")
    multi_viol_count = sum(1 for t in tracks if t.get("safety_status") == "MULTIPLE_VIOLATIONS")
    unknown_count = sum(1 for t in tracks if t.get("safety_status") == "UNKNOWN")

    overall_condition = "SAFE"
    if critical_incidents_count > 0 or multi_viol_count > 0 or zone_viol_count > 0:
        overall_condition = "CRITICAL_HAZARD"
    elif ppe_viol_count > 0 or weather.get("risk_level") == "HIGH_RISK":
        overall_condition = "SAFETY_WARNING"

    return {
        "facility_status": overall_condition,
        "active_workers_count": len(tracks),
        "status_breakdown": {
            "SAFE": safe_count,
            "PPE_VIOLATION": ppe_viol_count,
            "RESTRICTED_ZONE_VIOLATION": zone_viol_count,
            "MULTIPLE_VIOLATIONS": multi_viol_count,
            "UNKNOWN": unknown_count,
        },
        "open_incidents_count": open_incidents_count,
        "critical_incidents_count": critical_incidents_count,
        "weather": weather,
        "tracked_workers": tracks,
    }
