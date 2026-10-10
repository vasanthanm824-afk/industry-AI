"""
Weather Monitoring API Router
Returns live atmospheric conditions, location-based weather telemetry, search endpoints, and risk indices.
"""

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
