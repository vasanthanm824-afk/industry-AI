"""
Zone Monitoring & Geofencing Service
Manages spatial zones (Safe, Warning, Restricted) and tracks worker entry, dwell, and exit transitions.
"""

from datetime import datetime
import json
import time
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np
from sqlalchemy.orm import Session

from backend.db.models.zone import Zone
from backend.db.session import SessionLocal, init_db


class ZoneService:
    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session
        self.ensure_default_zones()
        # In-memory track state for transitions: track_id -> {"zone_id": str, "zone_name": str, "zone_type": str, "entry_time": float}
        self.track_states: Dict[int, dict] = {}

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def ensure_default_zones(self):
        """Seed industrial safety zones if none exist."""
        session = self._get_session()
        try:
            count = session.query(Zone).count()
            if count == 0:
                default_zones = [
                    {
                        "zone_id": "ZONE-SAFE-01",
                        "zone_name": "Main Pedestrian Walkway",
                        "zone_type": "SAFE",
                        "polygon": [[0.0, 0.5], [0.45, 0.5], [0.45, 1.0], [0.0, 1.0]],
                        "color_hex": "#10b981",  # Emerald Green
                        "description": "Authorized pedestrian thoroughfare and staging area.",
                    },
                    {
                        "zone_id": "ZONE-WARN-01",
                        "zone_name": "Forklift Transit Buffer",
                        "zone_type": "WARNING",
                        "polygon": [[0.45, 0.4], [0.70, 0.4], [0.70, 1.0], [0.45, 1.0]],
                        "color_hex": "#f59e0b",  # Amber / Warning
                        "description": "Forklift transit corridor; high-visibility gear mandatory.",
                    },
                    {
                        "zone_id": "ZONE-REST-01",
                        "zone_name": "Heavy Machinery & High Voltage Cell",
                        "zone_type": "RESTRICTED",
                        "polygon": [[0.70, 0.3], [1.0, 0.3], [1.0, 1.0], [0.70, 1.0]],
                        "color_hex": "#ef4444",  # Crimson / Restricted
                        "description": "Active robotic assembly and high-voltage perimeter. Strictly prohibited without permit.",
                    },
                ]
                for zd in default_zones:
                    z = Zone(
                        zone_id=zd["zone_id"],
                        zone_name=zd["zone_name"],
                        zone_type=zd["zone_type"],
                        color_hex=zd["color_hex"],
                        description=zd["description"],
                    )
                    z.polygon = zd["polygon"]
                    session.add(z)
                session.commit()
                print("[ZoneService] Initialized default industrial monitoring zones.")
        finally:
            if self._external_session is None:
                session.close()

    def list_zones(self, active_only: bool = True) -> List[Zone]:
        session = self._get_session()
        try:
            query = session.query(Zone)
            if active_only:
                query = query.filter(Zone.is_active == True)
            return query.all()
        finally:
            if self._external_session is None:
                session.close()

    def get_zone(self, zone_id: str) -> Optional[Zone]:
        session = self._get_session()
        try:
            return session.query(Zone).filter(Zone.zone_id == zone_id).first()
        finally:
            if self._external_session is None:
                session.close()

    def create_zone(self, zone_id: str, zone_name: str, zone_type: str, polygon: list, color_hex: str = "#ef4444", description: str = "") -> Zone:
        session = self._get_session()
        try:
            zone = Zone(
                zone_id=zone_id,
                zone_name=zone_name,
                zone_type=zone_type.upper(),
                color_hex=color_hex,
                description=description,
            )
            zone.polygon = polygon
            session.add(zone)
            session.commit()
            session.refresh(zone)
            return zone
        finally:
            if self._external_session is None:
                session.close()

    def update_zone(self, zone_id: str, zone_name: Optional[str] = None, zone_type: Optional[str] = None, polygon: Optional[list] = None, color_hex: Optional[str] = None, is_active: Optional[bool] = None, description: Optional[str] = None) -> Optional[Zone]:
        session = self._get_session()
        try:
            zone = session.query(Zone).filter(Zone.zone_id == zone_id).first()
            if not zone:
                return None
            if zone_name is not None:
                zone.zone_name = zone_name
            if zone_type is not None:
                zone.zone_type = zone_type.upper()
            if polygon is not None:
                zone.polygon = polygon
            if color_hex is not None:
                zone.color_hex = color_hex
            if is_active is not None:
                zone.is_active = is_active
            if description is not None:
                zone.description = description
            session.commit()
            session.refresh(zone)
            return zone
        finally:
            if self._external_session is None:
                session.close()

    def delete_zone(self, zone_id: str) -> bool:
        session = self._get_session()
        try:
            zone = session.query(Zone).filter(Zone.zone_id == zone_id).first()
            if not zone:
                return False
            session.delete(zone)
            session.commit()
            return True
        finally:
            if self._external_session is None:
                session.close()

    def get_zone_at_point(self, point: Tuple[int, int], frame_width: int, frame_height: int) -> Tuple[Optional[Zone], str, str]:
        """
        Determines which active zone contains the given pixel coordinate.
        Returns:
            Tuple of (Zone or None, zone_name, zone_type)
        """
        px, py = point
        norm_x = px / max(1, frame_width)
        norm_y = py / max(1, frame_height)

        active_zones = self.list_zones(active_only=True)
        # Check restricted zones first, then warning, then safe
        priority_order = {"RESTRICTED": 0, "WARNING": 1, "SAFE": 2}
        sorted_zones = sorted(active_zones, key=lambda z: priority_order.get(z.zone_type, 99))

        for zone in sorted_zones:
            poly = zone.polygon
            if len(poly) < 3:
                continue

            # Convert poly to pixel polygon if coords are normalized (<= 1.0)
            pts = []
            for p in poly:
                x, y = p[0], p[1]
                if x <= 1.0 and y <= 1.0:
                    pts.append([int(x * frame_width), int(y * frame_height)])
                else:
                    pts.append([int(x), int(y)])
            pts = np.array(pts, dtype=np.int32)

            # cv2.pointPolygonTest returns positive if inside, 0 on edge, negative if outside
            dist = cv2.pointPolygonTest(pts, (float(px), float(py)), measureDist=False)
            if dist >= 0:
                return zone, zone.zone_name, zone.zone_type

        return None, "General Industrial Floor", "SAFE"

    def evaluate_worker_movement(
        self,
        track_id: int,
        bottom_center: Tuple[int, int],
        frame_width: int,
        frame_height: int,
    ) -> Dict[str, any]:
        """
        Tracks worker position, transitions, and generates zone events.
        Events:
            'ENTERED_RESTRICTED', 'INSIDE_RESTRICTED', 'EXITED_RESTRICTED',
            'ENTERED_WARNING', 'NORMAL'
        """
        zone_obj, zone_name, zone_type = self.get_zone_at_point(bottom_center, frame_width, frame_height)
        zone_id = zone_obj.zone_id if zone_obj else "ZONE-GEN-01"
        now = time.time()

        prev_state = self.track_states.get(track_id)
        event = "NORMAL"
        dwell_seconds = 0.0

        if prev_state is None:
            # First time track is seen
            self.track_states[track_id] = {
                "zone_id": zone_id,
                "zone_name": zone_name,
                "zone_type": zone_type,
                "entry_time": now,
            }
            if zone_type == "RESTRICTED":
                event = "ENTERED_RESTRICTED"
            elif zone_type == "WARNING":
                event = "ENTERED_WARNING"
        else:
            prev_zone_type = prev_state["zone_type"]
            prev_zone_id = prev_state["zone_id"]

            if prev_zone_id == zone_id:
                # Still in same zone
                dwell_seconds = now - prev_state["entry_time"]
                if zone_type == "RESTRICTED":
                    event = "INSIDE_RESTRICTED"
            else:
                # Transitioned to a different zone
                self.track_states[track_id] = {
                    "zone_id": zone_id,
                    "zone_name": zone_name,
                    "zone_type": zone_type,
                    "entry_time": now,
                }
                dwell_seconds = 0.0
                if zone_type == "RESTRICTED":
                    event = "ENTERED_RESTRICTED"
                elif prev_zone_type == "RESTRICTED" and zone_type != "RESTRICTED":
                    event = "EXITED_RESTRICTED"
                elif zone_type == "WARNING":
                    event = "ENTERED_WARNING"

        return {
            "track_id": track_id,
            "zone_id": zone_id,
            "zone_name": zone_name,
            "zone_type": zone_type,
            "event": event,
            "dwell_seconds": round(dwell_seconds, 1),
            "is_restricted_violation": zone_type == "RESTRICTED",
        }
