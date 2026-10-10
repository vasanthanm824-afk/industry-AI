"""
Evidence Capture & Deduplication Service
Captures visual snapshot evidence when safety violations occur.
Enforces deduplication cooldown to prevent flooding disk storage with repetitive frames.
"""

from datetime import datetime
import os
import time
from typing import Dict, Optional, Tuple
import cv2
import numpy as np


class EvidenceService:
    def __init__(
        self,
        output_dir: str = "output/incidents/images",
        cooldown_seconds: float = 20.0,
    ):
        self.output_dir = output_dir
        self.cooldown_seconds = cooldown_seconds
        os.makedirs(self.output_dir, exist_ok=True)
        # Deduplication cache: (track_id, violation_type) -> last_capture_timestamp
        self._last_capture_times: Dict[Tuple[int, str], float] = {}

    def should_capture(self, track_id: int, violation_type: str) -> bool:
        """Determines if the event exceeds cooldown window and should be captured."""
        key = (track_id, violation_type)
        now = time.time()
        last_time = self._last_capture_times.get(key, 0.0)
        return (now - last_time) >= self.cooldown_seconds

    def capture_evidence(
        self,
        frame: np.ndarray,
        track_id: int,
        worker_id: Optional[str],
        worker_name: str,
        violation_type: str,
        zone_name: str,
        bbox: Optional[Tuple[int, int, int, int]] = None,
    ) -> Optional[str]:
        """
        Captures and persists annotated incident frame.
        Returns:
            Relative file path to saved image, or None if throttled by cooldown.
        """
        if not self.should_capture(track_id, violation_type):
            return None

        now = time.time()
        self._last_capture_times[(track_id, violation_type)] = now

        timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        wid_clean = (worker_id or f"TRK-{track_id}").replace(" ", "_")
        filename = f"INC_{timestamp_str}_{wid_clean}_{violation_type.lower()}_{track_id}.jpg"
        filepath = os.path.join(self.output_dir, filename)

        # Clone frame for annotation
        annotated_snapshot = frame.copy()
        h, w = annotated_snapshot.shape[:2]

        # Draw highlight box around worker
        if bbox:
            x1, y1, x2, y2 = bbox
            cv2.rectangle(annotated_snapshot, (x1, y1), (x2, y2), (0, 0, 255), 3)

        # Draw evidence banner across top
        cv2.rectangle(annotated_snapshot, (0, 0), (w, 55), (20, 20, 20), -1)
        cv2.rectangle(annotated_snapshot, (0, 0), (8, 55), (0, 0, 230), -1)

        banner_text = f"EVIDENCE CAPTURE | {violation_type} | Track #{track_id} | {worker_name}"
        meta_text = f"Zone: {zone_name} | {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}"

        cv2.putText(
            annotated_snapshot,
            banner_text,
            (18, 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            annotated_snapshot,
            meta_text,
            (18, 44),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (180, 180, 180),
            1,
            cv2.LINE_AA,
        )

        try:
            cv2.imwrite(filepath, annotated_snapshot)
            # Return relative path for web serving and database storage
            relative_path = os.path.join("output", "incidents", "images", filename).replace("\\", "/")
            return relative_path
        except Exception as e:
            print(f"[EvidenceService] Failed to save evidence frame: {e}")
            return None
