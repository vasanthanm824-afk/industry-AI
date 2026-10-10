"""
Person / Worker Detection Module
Provides an abstract base interface and a YOLO-based implementation.
Modular design allows swapping detection backends (e.g., custom trained weights, ONNX, TensorRT).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
import os
from typing import List, Optional, Tuple, Union
import numpy as np
import torch
from ultralytics import YOLO


@dataclass
class DetectionResult:
    """Standardized detection result for downstream tracker consumption."""
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2) in pixel coordinates
    confidence: float
    class_id: int
    class_name: str

    @property
    def width(self) -> int:
        return self.bbox[2] - self.bbox[0]

    @property
    def height(self) -> int:
        return self.bbox[3] - self.bbox[1]

    @property
    def centroid(self) -> Tuple[int, int]:
        return (
            int((self.bbox[0] + self.bbox[2]) / 2),
            int((self.bbox[1] + self.bbox[3]) / 2),
        )

    @property
    def bottom_center(self) -> Tuple[int, int]:
        """Centroid of the worker's feet; optimal for zone monitoring."""
        return (
            int((self.bbox[0] + self.bbox[2]) / 2),
            int(self.bbox[3]),
        )


class BaseDetector(ABC):
    """Abstract Base Class for all object / worker detectors."""

    @abstractmethod
    def detect(self, frame: np.ndarray) -> List[DetectionResult]:
        """
        Run inference on a single BGR image.
        Returns:
            List of standardized DetectionResult instances.
        """
        pass


class YOLODetector(BaseDetector):
    """
    YOLO-based worker detector.
    Filters by specified target classes (e.g., class 0 for person in COCO)
    and confidence threshold.
    """

    def __init__(
        self,
        model_path: str = "ml/weights/yolov8n.pt",
        confidence_threshold: float = 0.35,
        iou_threshold: float = 0.45,
        target_classes: Optional[List[int]] = None,
        device: str = "auto",
    ):
        """
        Initialize the YOLO detector.

        Args:
            model_path: Filepath to model weights (.pt or .onnx).
            confidence_threshold: Minimum detection confidence score.
            iou_threshold: IoU threshold for NMS.
            target_classes: List of class IDs to filter. Defaults to [0] (person).
            device: 'cpu', 'cuda', 'xpu', or 'auto'.
        """
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes if target_classes is not None else [0]
        self.device = self._resolve_device(device)

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Detector model weights not found at: {self.model_path}")

        # Load model
        self.model = YOLO(self.model_path)
        self.model.to(self.device)
        self.class_names = self.model.names

    def _resolve_device(self, device: str) -> str:
        if device == "auto":
            if torch.cuda.is_available():
                return "cuda"
            # Default to CPU for maximum stability across platforms
            return "cpu"
        return device

    def detect(self, frame: np.ndarray) -> List[DetectionResult]:
        """
        Run object detection on the provided video frame.
        """
        results = self.model.predict(
            source=frame,
            conf=self.confidence_threshold,
            iou=self.iou_threshold,
            classes=self.target_classes,
            device=self.device,
            imgsz=640,
            verbose=False,
        )

        detections: List[DetectionResult] = []
        if not results or len(results) == 0:
            return detections

        first_res = results[0]
        boxes = first_res.boxes
        if boxes is None or len(boxes) == 0:
            return detections

        for box in boxes:
            xyxy = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0].cpu().numpy())
            cls_id = int(box.cls[0].cpu().numpy())
            cls_name = self.class_names.get(cls_id, f"class_{cls_id}")

            detections.append(
                DetectionResult(
                    bbox=(int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])),
                    confidence=conf,
                    class_id=cls_id,
                    class_name=cls_name,
                )
            )

        return detections
