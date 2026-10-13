"""
Multi-Object Tracking Module
Wraps ByteTrack with an extensible base interface.
Maintains persistent track IDs, motion trajectories, and worker counts.
"""

from abc import ABC, abstractmethod
from collections import defaultdict, deque
from dataclasses import dataclass, field
import os
from types import SimpleNamespace
from typing import Dict, List, Optional, Tuple
import numpy as np
import torch
import yaml
from ultralytics.engine.results import Boxes
from ultralytics.trackers.byte_tracker import BYTETracker

from .detector import DetectionResult


@dataclass
class TrackedObject:
    """Represents a consistently tracked worker across video frames."""
    track_id: int
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    confidence: float
    class_id: int
    class_name: str
    centroid: Tuple[int, int]
    bottom_center: Tuple[int, int]
    history: List[Tuple[int, int]] = field(default_factory=list)
    worker_id: Optional[str] = None
    worker_name: str = "UNKNOWN"
    allocated_manager: str = "Unassigned"
    id_confidence: float = 0.0
    is_verified: bool = False
    attendance_marked: bool = False
    attendance_display_status: str = "Unknown Worker — Attendance Not Marked"
    quality_warning: Optional[str] = None
    helmet_status: str = "UNKNOWN"
    vest_status: str = "UNKNOWN"
    gloves_status: str = "UNKNOWN"
    goggles_status: str = "UNKNOWN"
    mask_status: str = "UNKNOWN"
    boots_status: str = "UNKNOWN"
    overall_ppe_status: str = "UNKNOWN"
    ppe_confidence: float = 0.0
    zone_name: str = "General Industrial Area"
    zone_type: str = "SAFE"
    dwell_seconds: float = 0.0
    safety_status: str = "SAFE"
    severity: str = "LOW"

    @property
    def width(self) -> int:
        return self.bbox[2] - self.bbox[0]

    @property
    def height(self) -> int:
        return self.bbox[3] - self.bbox[1]


class BaseTracker(ABC):
    """Abstract Base Class for multi-object trackers."""

    @abstractmethod
    def update(
        self,
        detections: List[DetectionResult],
        frame: Optional[np.ndarray] = None,
    ) -> List[TrackedObject]:
        """
        Update tracker with current frame detections.
        Returns:
            List of active TrackedObject instances.
        """
        pass

    @abstractmethod
    def reset(self) -> None:
        """Reset internal tracker states and tracklet memories."""
        pass


class ByteTrackTracker(BaseTracker):
    """
    ByteTrack implementation for industrial worker tracking.
    Retains persistent track IDs and motion trajectory history.
    """

    def __init__(
        self,
        config_path: str = "ml/configs/bytetrack.yaml",
        max_history_length: int = 30,
    ):
        """
        Args:
            config_path: Path to YAML configuration for ByteTrack hyperparameters.
            max_history_length: Number of past centroid locations to retain for visual trails.
        """
        self.config_path = config_path
        self.max_history_length = max_history_length
        self.args = self._load_config(config_path)

        self.tracker = BYTETracker(self.args)
        # Dictionary mapping track_id -> deque of (cx, cy)
        self.trails: Dict[int, deque] = defaultdict(lambda: deque(maxlen=self.max_history_length))
        # Set of unique track IDs seen throughout the session
        self.total_unique_track_ids: set = set()

    def _load_config(self, config_path: str) -> SimpleNamespace:
        """Load YAML configuration or fallback to standard ByteTrack defaults."""
        defaults = {
            "tracker_type": "bytetrack",
            "track_high_thresh": 0.5,
            "track_low_thresh": 0.1,
            "new_track_thresh": 0.6,
            "track_buffer": 30,
            "match_thresh": 0.8,
            "fuse_score": True,
        }

        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f)
                if isinstance(loaded, dict):
                    defaults.update(loaded)

        return SimpleNamespace(**defaults)

    def update(
        self,
        detections: List[DetectionResult],
        frame: Optional[np.ndarray] = None,
    ) -> List[TrackedObject]:
        """
        Update tracks using ByteTrack algorithm.
        """
        if frame is not None:
            orig_shape = frame.shape[:2]
        else:
            orig_shape = (720, 1280)

        # Build tensor matrix for ByteTracker: [x1, y1, x2, y2, conf, cls]
        if len(detections) > 0:
            box_rows = []
            cls_name_map = {}
            for d in detections:
                box_rows.append([
                    float(d.bbox[0]),
                    float(d.bbox[1]),
                    float(d.bbox[2]),
                    float(d.bbox[3]),
                    float(d.confidence),
                    float(d.class_id),
                ])
                cls_name_map[d.class_id] = d.class_name

            box_tensor = torch.tensor(box_rows, dtype=torch.float32)
            boxes = Boxes(box_tensor, orig_shape=orig_shape)
        else:
            # Empty detection tensor
            empty_tensor = torch.empty((0, 6), dtype=torch.float32)
            boxes = Boxes(empty_tensor, orig_shape=orig_shape)
            cls_name_map = {}

        # Run ByteTrack update step
        raw_tracks = self.tracker.update(boxes)

        tracked_objects: List[TrackedObject] = []
        active_ids = set()

        if raw_tracks is not None and len(raw_tracks) > 0:
            for item in raw_tracks:
                # Format: [x1, y1, x2, y2, track_id, conf, cls, idx]
                x1, y1, x2, y2 = int(item[0]), int(item[1]), int(item[2]), int(item[3])
                track_id = int(item[4])
                conf = float(item[5])
                cls_id = int(item[6])
                cls_name = cls_name_map.get(cls_id, "worker")

                centroid = (int((x1 + x2) / 2), int((y1 + y2) / 2))
                bottom_center = (int((x1 + x2) / 2), y2)

                # Update trajectory trail
                self.trails[track_id].append(centroid)
                self.total_unique_track_ids.add(track_id)
                active_ids.add(track_id)

                tracked_objects.append(
                    TrackedObject(
                        track_id=track_id,
                        bbox=(x1, y1, x2, y2),
                        confidence=conf,
                        class_id=cls_id,
                        class_name=cls_name,
                        centroid=centroid,
                        bottom_center=bottom_center,
                        history=list(self.trails[track_id]),
                    )
                )

        # Prune dead track trails if no longer needed
        # (retain active trails and limit dictionary growth)
        if len(self.trails) > 500:
            inactive = [tid for tid in self.trails.keys() if tid not in active_ids]
            for tid in inactive[:250]:
                del self.trails[tid]

        return tracked_objects

    @property
    def total_unique_tracks(self) -> int:
        """Total distinct workers tracked since initialization."""
        return len(self.total_unique_track_ids)

    def reset(self) -> None:
        """Reset tracker state."""
        self.tracker = BYTETracker(self.args)
        self.trails.clear()
        self.total_unique_track_ids.clear()
