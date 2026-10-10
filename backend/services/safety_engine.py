"""
Worker Safety Status Engine
Synthesizes Worker Identity, Tracking, PPE Compliance, Spatial Zone, and Weather Hazards
into real-time safety statuses and triggers automated evidence capture & incidents.
"""

from datetime import datetime
from typing import Any, Dict, Optional, Tuple
import numpy as np

from backend.services.evidence_service import EvidenceService
from backend.services.incident_service import IncidentService
from backend.services.ppe_service import PPEService
from backend.services.weather_service import WeatherService
from backend.services.zone_service import ZoneService


class SafetyStatusEngine:
    def __init__(
        self,
        incident_service: Optional[IncidentService] = None,
        ppe_service: Optional[PPEService] = None,
        evidence_service: Optional[EvidenceService] = None,
        weather_service: Optional[WeatherService] = None,
        zone_service: Optional[ZoneService] = None,
    ):
        self.incident_service = incident_service or IncidentService()
        self.ppe_service = ppe_service or PPEService()
        self.evidence_service = evidence_service or EvidenceService()
        self.weather_service = weather_service or WeatherService()
        self.zone_service = zone_service or ZoneService()

    def evaluate_worker(
        self,
        track_id: int,
        worker_id: Optional[str],
        worker_name: str,
        bbox: Tuple[int, int, int, int],
        ppe_result: Any,
        zone_eval: Dict[str, any],
        frame: Optional[np.ndarray] = None,
    ) -> Dict[str, any]:
        """
        Calculates unified safety status for a tracked worker.
        Returns:
            Dict containing:
                - safety_status: "SAFE", "PPE_VIOLATION", "RESTRICTED_ZONE_VIOLATION", "MULTIPLE_VIOLATIONS", "UNKNOWN"
                - severity: "LOW", "MEDIUM", "HIGH", "CRITICAL"
                - description: str
                - evidence_image: Optional[str]
                - incident_id: Optional[str]
        """
        zone_type = zone_eval.get("zone_type", "SAFE")
        zone_name = zone_eval.get("zone_name", "General Area")
        dwell_seconds = zone_eval.get("dwell_seconds", 0.0)
        is_restricted = zone_type == "RESTRICTED"

        has_ppe_violation = ppe_result.overall_ppe_status == "VIOLATION"
        is_ppe_unknown = ppe_result.overall_ppe_status == "UNKNOWN"

        # Check current weather risk
        weather_reading = self.weather_service.get_current_weather()
        weather_risk = weather_reading.get("risk_level", "SAFE")

        # 1. Determine Safety Status
        if is_restricted and has_ppe_violation:
            safety_status = "MULTIPLE_VIOLATIONS"
            severity = "CRITICAL"
            desc = (
                f"Severe double safety breach: Worker inside restricted area ({zone_name}) "
                f"without required PPE (Helmet: {ppe_result.helmet_status}, Vest: {ppe_result.vest_status})."
            )
            incident_type = "MULTIPLE_SAFETY_VIOLATION"

        elif is_restricted:
            safety_status = "RESTRICTED_ZONE_VIOLATION"
            severity = "CRITICAL" if dwell_seconds > 10.0 else "HIGH"
            desc = f"Unauthorized personnel detected inside restricted geofence: {zone_name} (Dwell: {dwell_seconds:.1f}s)."
            incident_type = "RESTRICTED_ZONE"

        elif has_ppe_violation:
            safety_status = "PPE_VIOLATION"
            violations = []
            if ppe_result.helmet_status == "VIOLATION":
                violations.append("Safety Helmet missing")
            if ppe_result.vest_status == "VIOLATION":
                violations.append("High-Visibility Vest missing")
            if ppe_result.gloves_status == "VIOLATION":
                violations.append("Protective Gloves missing")

            viol_str = ", ".join(violations) if violations else "Protective gear non-compliant"
            desc = f"PPE Safety Non-Compliance in {zone_name}: {viol_str}."
            severity = "HIGH" if len(violations) >= 2 or weather_risk == "HIGH_RISK" else "MEDIUM"
            incident_type = "PPE_VIOLATION"

        elif is_ppe_unknown:
            safety_status = "UNKNOWN"
            severity = "LOW"
            desc = f"Worker detected in {zone_name}; PPE status awaiting clearer visual resolution."
            incident_type = "OTHER"

        else:
            safety_status = "SAFE"
            severity = "LOW"
            desc = f"Worker compliant in {zone_name} with all required PPE."
            incident_type = "OTHER"

        evidence_image = None
        created_incident = None

        # 2. Trigger Evidence Capture & Incident Creation for Violations
        if safety_status in ("PPE_VIOLATION", "RESTRICTED_ZONE_VIOLATION", "MULTIPLE_VIOLATIONS"):
            if frame is not None and self.evidence_service.should_capture(track_id, incident_type):
                evidence_image = self.evidence_service.capture_evidence(
                    frame=frame,
                    track_id=track_id,
                    worker_id=worker_id,
                    worker_name=worker_name,
                    violation_type=incident_type,
                    zone_name=zone_name,
                    bbox=bbox,
                )

                # Persist incident to database
                created_incident = self.incident_service.create_incident(
                    incident_type=incident_type,
                    severity=severity,
                    safety_status=safety_status,
                    description=desc,
                    track_id=track_id,
                    worker_id=worker_id,
                    worker_name=worker_name,
                    zone=zone_name,
                    evidence_image=evidence_image,
                )

        # 3. Record PPE check periodically (once every 3.0s per track or on status change) to eliminate SQLite I/O bottleneck
        now_ts = datetime.utcnow().timestamp()
        if not hasattr(self, '_last_ppe_record'):
            self._last_ppe_record = {}
        if not hasattr(self, '_last_ppe_status'):
            self._last_ppe_status = {}

        last_ts = self._last_ppe_record.get(track_id, 0.0)
        last_stat = self._last_ppe_status.get(track_id, None)

        if (now_ts - last_ts >= 3.0) or (last_stat != ppe_result.overall_ppe_status):
            self._last_ppe_record[track_id] = now_ts
            self._last_ppe_status[track_id] = ppe_result.overall_ppe_status
            self.ppe_service.record_ppe_check(
                track_id=track_id,
                worker_id=worker_id,
                worker_name=worker_name,
                helmet_status=ppe_result.helmet_status,
                vest_status=ppe_result.vest_status,
                gloves_status=ppe_result.gloves_status,
                overall_ppe_status=ppe_result.overall_ppe_status,
                confidence=ppe_result.confidence,
            )

        return {
            "track_id": track_id,
            "worker_id": worker_id,
            "worker_name": worker_name,
            "safety_status": safety_status,
            "severity": severity,
            "description": desc,
            "zone_name": zone_name,
            "zone_type": zone_type,
            "weather_risk": weather_risk,
            "evidence_image": evidence_image,
            "incident_id": created_incident.incident_id if created_incident else None,
            "timestamp": datetime.utcnow().isoformat(),
        }
