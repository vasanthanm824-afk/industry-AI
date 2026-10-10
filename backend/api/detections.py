"""
Live Detections Router
Returns active tracked workers, spatial coordinates, and real-time bounding box badges.
"""

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.cctv import stream_manager
from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.session import get_db

router = APIRouter(prefix="/api/detections", tags=["Detections"])


@router.get("")
def get_active_detections():
    """
    Returns real-time tracked workers in current video frame.
    No fake detections; directly sourced from active ByteTrack tracker state.
    """
    tracks = stream_manager.latest_tracks
    stats = stream_manager.latest_stats
    return {
        "active_count": len(tracks),
        "frame_index": stats.get("frame_index", 0),
        "fps": stats.get("fps", 0.0),
        "detections": tracks,
    }
