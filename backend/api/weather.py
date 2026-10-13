"""
Weather Monitoring API Router
Returns live atmospheric conditions, location-based weather telemetry, search endpoints, and risk indices.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.services.weather_service import WeatherService

router = APIRouter(prefix="/api/weather", tags=["Weather"])


@router.get("")
def get_current_weather(
    lat: Optional[float] = Query(None, description="User latitude"),
    lon: Optional[float] = Query(None, description="User longitude"),
    location_name: Optional[str] = Query(None, description="Resolved city or site name"),
    refresh: bool = Query(False, description="Bypass cache and query live API"),
    db: Session = Depends(get_db),
):
    service = WeatherService(db_session=db)
    weather = service.get_current_weather(
        lat=lat,
        lon=lon,
        location_name=location_name,
        force_refresh=refresh,
    )
    return weather


@router.get("/search")
def search_cities(
    q: str = Query(..., description="City or location query string"),
    db: Session = Depends(get_db),
):
    service = WeatherService(db_session=db)
    results = service.search_cities(query=q)
    return {"results": results}


@router.post("/refresh")
def force_refresh_weather(
    payload: Optional[dict] = Body(default=None),
    db: Session = Depends(get_db),
):
    lat = payload.get("latitude") if payload else None
    lon = payload.get("longitude") if payload else None
    location_name = payload.get("location_name") if payload else None

    service = WeatherService(db_session=db)
    weather = service.get_current_weather(
        lat=lat,
        lon=lon,
        location_name=location_name,
        force_refresh=True,
    )
    return {"message": "Weather telemetry refreshed successfully.", "weather": weather}


# In-memory physical on-site sensor state (factory floor calibrated probe)
_physical_sensor_state = {
    "sensor_id": "SENSOR-INDOOR-01",
    "sensor_name": "Shop Floor Zone A Calibrated Thermocouple",
    "temperature_c": 23.4,
    "humidity_pct": 48.0,
    "calibration_offset": 0.0,
    "is_connected": True,
    "last_calibrated": "2026-10-01T08:00:00Z",
    "last_updated": "2026-10-12T12:00:00Z",
    "source_type": "PHYSICAL_ON_SITE_SENSOR",
}


@router.get("/sensor")
def get_physical_sensor_telemetry():
    """Returns factory-floor calibrated on-site temperature sensor telemetry."""
    return _physical_sensor_state


@router.post("/sensor")
def update_physical_sensor_telemetry(payload: dict):
    """Updates factory-floor physical sensor reading or calibration."""
    if "temperature_c" in payload:
        _physical_sensor_state["temperature_c"] = float(payload["temperature_c"])
    if "humidity_pct" in payload:
        _physical_sensor_state["humidity_pct"] = float(payload["humidity_pct"])
    if "calibration_offset" in payload:
        _physical_sensor_state["calibration_offset"] = float(payload["calibration_offset"])
    if "is_connected" in payload:
        _physical_sensor_state["is_connected"] = bool(payload["is_connected"])
    _physical_sensor_state["last_updated"] = datetime.utcnow().isoformat()
    return {"message": "Physical sensor state updated successfully.", "sensor": _physical_sensor_state}
