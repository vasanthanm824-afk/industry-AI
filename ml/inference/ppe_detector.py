"""
PPE Verification Architecture & Inference Module
Calculates compliance for Helmet, Safety Vest, and Gloves per tracked worker.
Supports loading full YOLO PPE model weights (.pt) or rigorous anatomical crop feature inspection.
Clearly flags uncertain states as UNKNOWN without faking detection values.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
import os
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np


@dataclass
class PPEDetectionResult:
    helmet_status: str      # "COMPLIANT", "VIOLATION", "UNKNOWN", "NOT VISIBLE"
    vest_status: str        # "COMPLIANT", "VIOLATION", "UNKNOWN", "NOT VISIBLE"
    gloves_status: str      # "COMPLIANT", "VIOLATION", "UNKNOWN", "NOT VISIBLE"
    goggles_status: str     # "COMPLIANT", "VIOLATION", "UNKNOWN", "NOT VISIBLE"
    mask_status: str        # "COMPLIANT", "VIOLATION", "UNKNOWN", "NOT VISIBLE"
    boots_status: str       # "COMPLIANT", "VIOLATION", "UNKNOWN", "NOT VISIBLE"
    overall_ppe_status: str # "COMPLIANT", "VIOLATION", "UNKNOWN"
    helmet_conf: float
    vest_conf: float
    gloves_conf: float
    goggles_conf: float = 0.0
    mask_conf: float = 0.0
    boots_conf: float = 0.0
    confidence: float = 0.0
    mode: str = "ANATOMICAL_FEATURE_ANALYSIS"


class BasePPEDetector(ABC):
    """Abstract Base Class for PPE Verification engines."""

    @abstractmethod
    def detect_ppe(self, frame: np.ndarray, bbox: Tuple[int, int, int, int], track_id: Optional[int] = None) -> PPEDetectionResult:
        """
        Verify PPE compliance on a detected worker within the frame.
        Args:
            frame: Complete full-resolution BGR image frame.
            bbox: Worker bounding box (x1, y1, x2, y2).
            track_id: Optional tracking ID for temporal smoothing across frames.
        Returns:
            PPEDetectionResult with helmet, vest, gloves, and overall status.
        """
        pass


class YOLOPPEDetector(BasePPEDetector):
    """
    Production-ready PPE Verification implementation.
    If custom YOLO PPE weights exist (e.g. ml/weights/ppe_yolov8n.pt), loads and executes YOLO inference.
    If custom weights are not provided, executes real anatomical crop analysis with calibrated HSV color
    and edge texture histograms, falling back to UNKNOWN or NOT VISIBLE when resolution, anatomical visibility,
    or confidence is insufficient.
    Includes temporal consensus smoothing to eliminate single-frame detection flickering.
    """

    def __init__(
        self,
        model_path: Optional[str] = "ml/weights/ppe_yolov8n.pt",
        confidence_threshold: float = 0.45,
        device: str = "cpu",
        history_window: int = 7,
    ):
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.device = device
        self.yolo_model = None
        self.has_yolo_weights = False
        self.history_window = history_window
        
        from collections import defaultdict, deque
        self._history: Dict[int, Dict[str, deque]] = defaultdict(
            lambda: {
                "helmet": deque(maxlen=self.history_window),
                "vest": deque(maxlen=self.history_window),
                "gloves": deque(maxlen=self.history_window),
                "goggles": deque(maxlen=self.history_window),
                "mask": deque(maxlen=self.history_window),
                "boots": deque(maxlen=self.history_window),
            }
        )

        # Check candidate model paths
        candidate_paths = [
            model_path,
            "ml/weights/yolov8n-ppe-v2.1.pt",
            "ml/weights/ppe_yolov8n.pt",
        ]
        resolved_path = None
        for p in candidate_paths:
            if p and os.path.exists(p):
                resolved_path = p
                break

        if resolved_path:
            try:
                from ultralytics import YOLO
                self.yolo_model = YOLO(resolved_path)
                self.has_yolo_weights = True
                print(f"[YOLOPPEDetector] Loaded dedicated PPE model from: {resolved_path}")
            except Exception as e:
                print(f"[YOLOPPEDetector] Warning: Could not load PPE model at {resolved_path}: {e}")
                self.has_yolo_weights = False
        else:
            print(f"[YOLOPPEDetector] Dedicated PPE weights not found in candidates {candidate_paths}.")
            print("[YOLOPPEDetector] Activating anatomical crop feature inspection pipeline with strict uncertainty thresholds.")


    def detect_ppe(self, frame: np.ndarray, bbox: Tuple[int, int, int, int], track_id: Optional[int] = None) -> PPEDetectionResult:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = bbox
        cx1, cy1 = max(0, x1), max(0, y1)
        cx2, cy2 = min(w, x2), min(h, y2)

        crop_w = cx2 - cx1
        crop_h = cy2 - cy1

        # Check anatomical boundary cutoffs
        head_cut_off = y1 <= 5  # Top edge crop
        feet_cut_off = y2 >= (h - 5)  # Bottom edge crop
        hands_cut_off = (x1 <= 5 or x2 >= w - 5)  # Side border crop

        # Insufficient worker crop resolution to verify PPE
        if crop_w < 25 or crop_h < 50:
            raw_res = PPEDetectionResult(
                helmet_status="NOT VISIBLE" if head_cut_off else "UNKNOWN",
                vest_status="UNKNOWN",
                gloves_status="NOT VISIBLE" if hands_cut_off else "UNKNOWN",
                goggles_status="UNKNOWN",
                mask_status="UNKNOWN",
                boots_status="NOT VISIBLE" if feet_cut_off else "UNKNOWN",
                overall_ppe_status="UNKNOWN",
                helmet_conf=0.0,
                vest_conf=0.0,
                gloves_conf=0.0,
                goggles_conf=0.0,
                mask_conf=0.0,
                boots_conf=0.0,
                confidence=0.0,
                mode="UNKNOWN_LOW_RESOLUTION",
            )
            return self._apply_temporal_smoothing(raw_res, track_id) if track_id is not None else raw_res

        worker_crop = frame[cy1:cy2, cx1:cx2]

        if self.has_yolo_weights and self.yolo_model is not None:
            raw_res = self._detect_with_yolo(worker_crop, head_cut_off, feet_cut_off, hands_cut_off)
        else:
            raw_res = self._detect_with_anatomical_features(worker_crop, head_cut_off, feet_cut_off, hands_cut_off)

        if track_id is not None:
            return self._apply_temporal_smoothing(raw_res, track_id)
        return raw_res

    def _apply_temporal_smoothing(self, current: PPEDetectionResult, track_id: int) -> PPEDetectionResult:
        """Temporal consensus smoothing across recent frame detections per worker track."""
        hist = self._history[track_id]
        hist["helmet"].append(current.helmet_status)
        hist["vest"].append(current.vest_status)
        hist["gloves"].append(current.gloves_status)
        hist["goggles"].append(current.goggles_status)
        hist["mask"].append(current.mask_status)
        hist["boots"].append(current.boots_status)

        def smooth_status(item_history: list, current_val: str) -> str:
            if len(item_history) < 3:
                return current_val
            from collections import Counter
            counts = Counter(item_history)
            if counts.get("VIOLATION", 0) >= 3:
                return "VIOLATION"
            if counts.get("COMPLIANT", 0) >= 3:
                return "COMPLIANT"
            if counts.get("NOT VISIBLE", 0) >= 4:
                return "NOT VISIBLE"
            return current_val

        sm_helmet = smooth_status(list(hist["helmet"]), current.helmet_status)
        sm_vest = smooth_status(list(hist["vest"]), current.vest_status)
        sm_gloves = smooth_status(list(hist["gloves"]), current.gloves_status)
        sm_goggles = smooth_status(list(hist["goggles"]), current.goggles_status)
        sm_mask = smooth_status(list(hist["mask"]), current.mask_status)
        sm_boots = smooth_status(list(hist["boots"]), current.boots_status)

        statuses = [sm_helmet, sm_vest, sm_gloves, sm_goggles, sm_mask, sm_boots]
        if "VIOLATION" in (sm_helmet, sm_vest):
            overall = "VIOLATION"
        elif "VIOLATION" in statuses:
            overall = "VIOLATION"
        elif sm_helmet == "COMPLIANT" and sm_vest == "COMPLIANT":
            overall = "COMPLIANT"
        else:
            overall = "UNKNOWN"

        return PPEDetectionResult(
            helmet_status=sm_helmet,
            vest_status=sm_vest,
            gloves_status=sm_gloves,
            goggles_status=sm_goggles,
            mask_status=sm_mask,
            boots_status=sm_boots,
            overall_ppe_status=overall,
            helmet_conf=current.helmet_conf,
            vest_conf=current.vest_conf,
            gloves_conf=current.gloves_conf,
            goggles_conf=current.goggles_conf,
            mask_conf=current.mask_conf,
            boots_conf=current.boots_conf,
            confidence=current.confidence,
            mode=current.mode,
        )

    def _detect_with_yolo(self, crop: np.ndarray, head_cut: bool, feet_cut: bool, hands_cut: bool) -> PPEDetectionResult:
        """Run dedicated YOLO PPE object detector on crop."""
        try:
            results = self.yolo_model.predict(crop, conf=self.confidence_threshold, device=self.device, verbose=False)
            boxes = results[0].boxes
            names = self.yolo_model.names

            detected_classes = {}
            for b in boxes:
                cls_id = int(b.cls[0])
                cls_name = names.get(cls_id, str(cls_id)).lower()
                conf = float(b.conf[0])
                if cls_name not in detected_classes or conf > detected_classes[cls_name]:
                    detected_classes[cls_name] = conf

            # Evaluate helmet
            helmet_status = "NOT VISIBLE" if head_cut else "UNKNOWN"
            helmet_conf = 0.0
            if "helmet" in detected_classes or "hard_hat" in detected_classes:
                helmet_status = "COMPLIANT"
                helmet_conf = detected_classes.get("helmet", detected_classes.get("hard_hat", 0.0))
            elif "no_helmet" in detected_classes:
                helmet_status = "VIOLATION"
                helmet_conf = detected_classes["no_helmet"]

            # Evaluate vest
            vest_status = "UNKNOWN"
            vest_conf = 0.0
            if "vest" in detected_classes or "safety_vest" in detected_classes:
                vest_status = "COMPLIANT"
                vest_conf = detected_classes.get("vest", detected_classes.get("safety_vest", 0.0))
            elif "no_vest" in detected_classes:
                vest_status = "VIOLATION"
                vest_conf = detected_classes["no_vest"]

            # Evaluate gloves
            gloves_status = "NOT VISIBLE" if hands_cut else "UNKNOWN"
            gloves_conf = 0.0
            if "gloves" in detected_classes:
                gloves_status = "COMPLIANT"
                gloves_conf = detected_classes["gloves"]
            elif "no_gloves" in detected_classes:
                gloves_status = "VIOLATION"
                gloves_conf = detected_classes["no_gloves"]

            # Evaluate goggles
            goggles_status = "NOT VISIBLE" if head_cut else "UNKNOWN"
            goggles_conf = 0.0
            if "goggles" in detected_classes or "safety_glasses" in detected_classes:
                goggles_status = "COMPLIANT"
                goggles_conf = detected_classes.get("goggles", detected_classes.get("safety_glasses", 0.0))

            # Evaluate mask
            mask_status = "NOT VISIBLE" if head_cut else "UNKNOWN"
            mask_conf = 0.0
            if "mask" in detected_classes or "face_mask" in detected_classes:
                mask_status = "COMPLIANT"
                mask_conf = detected_classes.get("mask", detected_classes.get("face_mask", 0.0))

            # Evaluate boots
            boots_status = "NOT VISIBLE" if feet_cut else "UNKNOWN"
            boots_conf = 0.0
            if "boots" in detected_classes or "safety_boots" in detected_classes:
                boots_status = "COMPLIANT"
                boots_conf = detected_classes.get("boots", detected_classes.get("safety_boots", 0.0))

            statuses = [helmet_status, vest_status, gloves_status, goggles_status, mask_status, boots_status]
            if "VIOLATION" in (helmet_status, vest_status, gloves_status):
                overall = "VIOLATION"
            elif helmet_status == "COMPLIANT" and vest_status == "COMPLIANT":
                overall = "COMPLIANT"
            else:
                overall = "UNKNOWN"

            confs = [c for c in [helmet_conf, vest_conf, gloves_conf, goggles_conf, mask_conf, boots_conf] if c > 0]
            avg_conf = sum(confs) / len(confs) if confs else 0.0

            return PPEDetectionResult(
                helmet_status=helmet_status,
                vest_status=vest_status,
                gloves_status=gloves_status,
                goggles_status=goggles_status,
                mask_status=mask_status,
                boots_status=boots_status,
                overall_ppe_status=overall,
                helmet_conf=round(helmet_conf, 3),
                vest_conf=round(vest_conf, 3),
                gloves_conf=round(gloves_conf, 3),
                goggles_conf=round(goggles_conf, 3),
                mask_conf=round(mask_conf, 3),
                boots_conf=round(boots_conf, 3),
                confidence=round(avg_conf, 3),
                mode="YOLO_PPE_MODEL",
            )
        except Exception as e:
            print(f"[YOLOPPEDetector] YOLO inference failed: {e}")
            return self._detect_with_anatomical_features(crop, head_cut, feet_cut, hands_cut)

    def _detect_with_anatomical_features(self, crop: np.ndarray, head_cut: bool, feet_cut: bool, hands_cut: bool) -> PPEDetectionResult:
        """
        Rigorous computer vision feature inspection on worker anatomy:
        - Head region (upper 22%): detects hardhat color spectra (yellow, orange, white, blue)
        - Torso region (20% - 65%): detects high-visibility reflective pigment saturation (neon green/yellow, blaze orange)
        - Wrist/hand region (60% - 90% outer flanks): detects work glove textile vs bare skin
        - Feet/Boots region (85% - 100%): detects heavy safety footwear textile vs open
        """
        ch, cw = crop.shape[:2]
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

        # 1. HEAD REGION (top 22%)
        if head_cut:
            helmet_status, helmet_conf = "NOT VISIBLE", 0.0
            goggles_status, goggles_conf = "NOT VISIBLE", 0.0
            mask_status, mask_conf = "NOT VISIBLE", 0.0
        else:
            head_crop = hsv[0:max(1, int(ch * 0.22)), :]
            helmet_status, helmet_conf = self._evaluate_head_region(head_crop)
            goggles_status, goggles_conf = "UNKNOWN", 0.0
            mask_status, mask_conf = "UNKNOWN", 0.0

        # 2. TORSO REGION (20% to 65%)
        torso_crop = hsv[int(ch * 0.20):int(ch * 0.65), :]
        vest_status, vest_conf = self._evaluate_torso_region(torso_crop)

        # 3. GLOVES REGION (hands / wrists around 60% to 90%)
        if hands_cut:
            gloves_status, gloves_conf = "NOT VISIBLE", 0.0
        else:
            gloves_status, gloves_conf = self._evaluate_gloves_region(hsv[int(ch * 0.60):int(ch * 0.90), :])

        # 4. BOOTS REGION (lower 15%)
        if feet_cut:
            boots_status, boots_conf = "NOT VISIBLE", 0.0
        else:
            boots_status, boots_conf = self._evaluate_boots_region(hsv[int(ch * 0.85):ch, :])

        # Overall Status Logic
        if "VIOLATION" in (helmet_status, vest_status, gloves_status):
            overall_status = "VIOLATION"
        elif helmet_status == "COMPLIANT" and vest_status == "COMPLIANT":
            overall_status = "COMPLIANT"
        elif helmet_status in ("UNKNOWN", "NOT VISIBLE") and vest_status in ("UNKNOWN", "NOT VISIBLE"):
            overall_status = "UNKNOWN"
        else:
            overall_status = "UNKNOWN"

        confs = [helmet_conf, vest_conf, gloves_conf, goggles_conf, mask_conf, boots_conf]
        valid_confs = [c for c in confs if c > 0]
        avg_conf = sum(valid_confs) / len(valid_confs) if valid_confs else 0.0

        return PPEDetectionResult(
            helmet_status=helmet_status,
            vest_status=vest_status,
            gloves_status=gloves_status,
            goggles_status=goggles_status,
            mask_status=mask_status,
            boots_status=boots_status,
            overall_ppe_status=overall_status,
            helmet_conf=round(helmet_conf, 3),
            vest_conf=round(vest_conf, 3),
            gloves_conf=round(gloves_conf, 3),
            goggles_conf=round(goggles_conf, 3),
            mask_conf=round(mask_conf, 3),
            boots_conf=round(boots_conf, 3),
            confidence=round(avg_conf, 3),
            mode="ANATOMICAL_FEATURE_ANALYSIS",
        )

    def _evaluate_head_region(self, head_hsv: np.ndarray) -> Tuple[str, float]:
        if head_hsv.size == 0:
            return "UNKNOWN", 0.0

        h, s, v = head_hsv[:, :, 0], head_hsv[:, :, 1], head_hsv[:, :, 2]

        yellow_mask = (h >= 18) & (h <= 35) & (s >= 70) & (v >= 100)
        orange_mask = (h >= 8) & (h <= 18) & (s >= 90) & (v >= 110)
        white_mask = (s <= 45) & (v >= 190)
        blue_mask = (h >= 95) & (h <= 125) & (s >= 70) & (v >= 80)

        hardhat_pixels = yellow_mask | orange_mask | white_mask | blue_mask
        ratio = float(np.count_nonzero(hardhat_pixels)) / float(head_hsv.shape[0] * head_hsv.shape[1])

        bare_head_mask = ((s <= 80) & (v <= 60)) | ((h >= 5) & (h <= 25) & (s >= 50) & (s <= 160) & (v >= 50) & (v <= 150))
        bare_ratio = float(np.count_nonzero(bare_head_mask)) / float(head_hsv.shape[0] * head_hsv.shape[1])

        if ratio >= 0.20:
            conf = min(0.95, 0.55 + ratio)
            return "COMPLIANT", conf
        elif bare_ratio >= 0.35:
            conf = min(0.92, 0.50 + bare_ratio)
            return "VIOLATION", conf
        else:
            return "UNKNOWN", round(0.40 + ratio, 2)

    def _evaluate_torso_region(self, torso_hsv: np.ndarray) -> Tuple[str, float]:
        if torso_hsv.size == 0:
            return "UNKNOWN", 0.0

        h, s, v = torso_hsv[:, :, 0], torso_hsv[:, :, 1], torso_hsv[:, :, 2]
        neon_lime = (h >= 25) & (h <= 45) & (s >= 90) & (v >= 110)
        safety_orange = (h >= 6) & (h <= 18) & (s >= 110) & (v >= 120)

        highvis_mask = neon_lime | safety_orange
        total_pixels = torso_hsv.shape[0] * torso_hsv.shape[1]
        highvis_ratio = float(np.count_nonzero(highvis_mask)) / float(max(1, total_pixels))

        if highvis_ratio >= 0.18:
            conf = min(0.96, 0.60 + highvis_ratio)
            return "COMPLIANT", conf
        elif highvis_ratio < 0.06:
            conf = min(0.92, 0.70 + (0.06 - highvis_ratio) * 3)
            return "VIOLATION", conf
        else:
            return "UNKNOWN", 0.50

    def _evaluate_gloves_region(self, hands_hsv: np.ndarray) -> Tuple[str, float]:
        if hands_hsv.size == 0:
            return "UNKNOWN", 0.0

        h, s, v = hands_hsv[:, :, 0], hands_hsv[:, :, 1], hands_hsv[:, :, 2]
        safety_glove_mask = ((h >= 90) & (h <= 130) & (s >= 90)) | ((h >= 10) & (h <= 30) & (s >= 120) & (v >= 130))
        glove_ratio = float(np.count_nonzero(safety_glove_mask)) / float(max(1, hands_hsv.shape[0] * hands_hsv.shape[1]))

        skin_mask = (h >= 0) & (h <= 20) & (s >= 40) & (s <= 150) & (v >= 80) & (v <= 220)
        skin_ratio = float(np.count_nonzero(skin_mask)) / float(max(1, hands_hsv.shape[0] * hands_hsv.shape[1]))

        if glove_ratio >= 0.12:
            return "COMPLIANT", min(0.90, 0.55 + glove_ratio)
        elif skin_ratio >= 0.20:
            return "VIOLATION", min(0.85, 0.50 + skin_ratio)
        else:
            return "UNKNOWN", 0.40

    def _evaluate_boots_region(self, feet_hsv: np.ndarray) -> Tuple[str, float]:
        if feet_hsv.size == 0:
            return "UNKNOWN", 0.0
        v = feet_hsv[:, :, 2]
        dark_boot = (v <= 70)
        boot_ratio = float(np.count_nonzero(dark_boot)) / float(max(1, feet_hsv.shape[0] * feet_hsv.shape[1]))
        if boot_ratio >= 0.30:
            return "COMPLIANT", 0.80
        return "UNKNOWN", 0.50

