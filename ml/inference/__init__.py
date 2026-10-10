"""
Inference engine package for the Industrial Worker Safety and Monitoring System.
Provides modular components for Video Ingestion, Detection, Tracking, and Annotation.
"""

from .video_reader import VideoReader
from .detector import BaseDetector, YOLODetector, DetectionResult
from .tracker import BaseTracker, ByteTrackTracker, TrackedObject
from .annotator import VideoAnnotator
from .pipeline import SafetyVisionPipeline

__all__ = [
    "VideoReader",
    "BaseDetector",
    "YOLODetector",
    "DetectionResult",
    "BaseTracker",
    "ByteTrackTracker",
    "TrackedObject",
    "VideoAnnotator",
    "SafetyVisionPipeline",
]
