"""
AI Industrial Worker Safety & Monitoring System - FastAPI Backend
Core application entrypoint providing REST and Streaming APIs.
"""

from datetime import datetime
import os
import sys

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api.alerts import router as alerts_router
from backend.api.attendance import router as attendance_router
from backend.api.auth import router as auth_router
from backend.api.cctv import router as cctv_router
from backend.api.detections import router as detections_router
from backend.api.incidents import router as incidents_router
from backend.api.ppe import router as ppe_router
from backend.api.reports import router as reports_router
from backend.api.safety import router as safety_router
from backend.api.weather import router as weather_router
from backend.api.workers import router as workers_router
from backend.api.zones import router as zones_router
from backend.db.session import init_db

# Initialize database schema
init_db()

# Create structured storage directories
os.makedirs("output/incidents/images", exist_ok=True)
os.makedirs("data/worker_faces", exist_ok=True)
os.makedirs("data/embeddings", exist_ok=True)

app = FastAPI(
    title="AI Industrial Worker Safety and Monitoring System",
    description="Enterprise REST & Real-Time Computer Vision API for Industrial Worker Safety, PPE Compliance, Geofencing, and Incident Management.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS for Next.js frontend and local dev environments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static file endpoints for incident evidence and worker photos
app.mount("/output", StaticFiles(directory="output"), name="output")
app.mount("/worker_faces", StaticFiles(directory="data/worker_faces"), name="worker_faces")

# Register API Routers
app.include_router(auth_router)
app.include_router(workers_router)
app.include_router(attendance_router)
app.include_router(cctv_router)
app.include_router(detections_router)
app.include_router(ppe_router)
app.include_router(safety_router)
app.include_router(weather_router)
app.include_router(zones_router)
app.include_router(incidents_router)
app.include_router(alerts_router)
app.include_router(reports_router)


@app.get("/api/health", tags=["Health"])
def health_check():
    """System health check and operational status."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "modules": {
            "cctv_pipeline": "operational",
            "worker_identification": "operational",
            "attendance_service": "operational",
            "ppe_verification": "operational",
            "safety_status_engine": "operational",
            "weather_service": "operational",
            "zone_geofencing": "operational",
            "incident_management": "operational",
            "alert_dispatch": "operational",
            "reporting": "operational",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
