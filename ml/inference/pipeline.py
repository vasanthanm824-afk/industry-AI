"""
Unified Computer Vision Pipeline
Orchestrates frame ingestion, person detection, ByteTrack tracking,
worker identification, automatic attendance, PPE verification,
zone geofencing, safety status engine, and real-time visual output.
"""

from collections import deque
import os
import time
from typing import Dict, Generator, List, Optional, Tuple, Union
import cv2
import numpy as np
import yaml

from .annotator import VideoAnnotator
from .detector import BaseDetector, DetectionResult, YOLODetector
from .identifier import TemporalConsensusTracker, WorkerIdentifier
from .ppe_detector import BasePPEDetector, YOLOPPEDetector
from .tracker import BaseTracker, ByteTrackTracker, TrackedObject
from .video_reader import VideoReader
from backend.services.attendance_service import AttendanceService
from backend.services.ppe_service import PPEService
from backend.services.safety_engine import SafetyStatusEngine
from backend.services.weather_service import WeatherService
from backend.services.zone_service import ZoneService


class SafetyVisionPipeline:
    """
    Main orchestration class for complete Industrial Safety AI pipeline.
    """

    def __init__(
        self,
        config_path: str = "ml/configs/pipeline_config.yaml",
        source: Optional[Union[int, str]] = None,
        model_path: Optional[str] = None,
        conf_thresh: Optional[float] = None,
        save_video: Optional[bool] = None,
        output_path: Optional[str] = None,
        show_display: Optional[bool] = None,
        device: Optional[str] = None,
    ):
        self.config = self._load_config(config_path)

        # Apply CLI / constructor overrides
        if source is not None:
            self.config["input"]["source"] = source
        if model_path is not None:
            self.config["detector"]["model_path"] = model_path
        if conf_thresh is not None:
            self.config["detector"]["confidence_threshold"] = conf_thresh
        if save_video is not None:
            self.config["output"]["save_video"] = save_video
        if output_path is not None:
            self.config["output"]["output_path"] = output_path
        if show_display is not None:
            self.config["output"]["show_display"] = show_display
        if device is not None:
            self.config["detector"]["device"] = device

        # Initialize sub-modules
        input_cfg = self.config.get("input", {})
        det_cfg = self.config.get("detector", {})
        trk_cfg = self.config.get("tracker", {})
        ann_cfg = self.config.get("annotator", {})

        print(f"[Pipeline] Initializing VideoReader with source: {input_cfg.get('source')}")
        self.reader = VideoReader(
            source=input_cfg.get("source", 0),
            target_width=input_cfg.get("target_width"),
            target_height=input_cfg.get("target_height"),
            loop=input_cfg.get("loop", False),
        )

        print(f"[Pipeline] Loading Detector from: {det_cfg.get('model_path')}")
        self.detector: BaseDetector = YOLODetector(
            model_path=det_cfg.get("model_path", "ml/weights/yolov8n.pt"),
            confidence_threshold=det_cfg.get("confidence_threshold", 0.35),
            iou_threshold=det_cfg.get("iou_threshold", 0.45),
            target_classes=det_cfg.get("target_classes", [0]),
            device=det_cfg.get("device", "auto"),
        )

        tracker_config_file = trk_cfg.get("config_path", "ml/configs/bytetrack.yaml")
        print(f"[Pipeline] Initializing ByteTrack tracker with config: {tracker_config_file}")
        self.tracker: BaseTracker = ByteTrackTracker(config_path=tracker_config_file)

        self.annotator = VideoAnnotator(
            box_thickness=ann_cfg.get("box_thickness", 2),
            font_scale=ann_cfg.get("font_scale", 0.50),
            show_confidence=ann_cfg.get("show_confidence", True),
            trail_length=ann_cfg.get("trail_length", 20),
            show_hud=ann_cfg.get("show_hud", True),
        )

        # Identification & Attendance modules
        id_cfg = self.config.get("identifier", {})
        print(f"[Pipeline] Initializing WorkerIdentifier from: {id_cfg.get('model_path')}")
        self.identifier = WorkerIdentifier(
            model_path=id_cfg.get("model_path", "ml/weights/yolov8n-cls.pt"),
            embeddings_dir=id_cfg.get("embeddings_dir", "data/embeddings"),
            confidence_threshold=id_cfg.get("confidence_threshold", 0.60),
            device=id_cfg.get("device", "cpu"),
        )

        consensus_frames = id_cfg.get("temporal_consensus_frames", 5)
        print(f"[Pipeline] Initializing TemporalConsensusTracker (consensus window: {consensus_frames} frames)")
        self.consensus = TemporalConsensusTracker(required_consensus_frames=consensus_frames)

        att_cfg = self.config.get("attendance", {})
        self.attendance_enabled = att_cfg.get("enabled", True)
        self.attendance_service = AttendanceService()

        # PPE, Zone, and Safety Status Engine
        ppe_cfg = self.config.get("ppe", {})
        self.ppe_detector: BasePPEDetector = YOLOPPEDetector(
            model_path=ppe_cfg.get("model_path", "ml/weights/ppe_yolov8n.pt"),
            confidence_threshold=ppe_cfg.get("confidence_threshold", 0.45),
            device=ppe_cfg.get("device", "cpu"),
        )
        self.zone_service = ZoneService()
        self.weather_service = WeatherService()
        self.ppe_service = PPEService()
        self.safety_engine = SafetyStatusEngine(
            ppe_service=self.ppe_service,
            zone_service=self.zone_service,
            weather_service=self.weather_service,
        )

        # Performance measurement
        self.fps_window = deque(maxlen=30)
        self.total_frames_processed = 0
        self.start_time: Optional[float] = None
        self.writer: Optional[cv2.VideoWriter] = None

    def _load_config(self, config_path: str) -> dict:
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Configuration file not found: {config_path}")
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _init_writer_if_needed(self) -> None:
        out_cfg = self.config.get("output", {})
        if out_cfg.get("save_video", False) and self.writer is None:
            output_file = out_cfg.get("output_path", "output/tracked_output.mp4")
            os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)

            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            fps = out_cfg.get("output_fps") or self.reader.fps
            if fps <= 0 or np.isnan(fps):
                fps = 25.0

            width = self.reader.width
            height = self.reader.height
            self.writer = cv2.VideoWriter(output_file, fourcc, fps, (width, height))
            print(f"[Pipeline] Saving annotated output to: {output_file} ({width}x{height} @ {fps:.1f} FPS)")

    def process_frame(
        self,
        frame: np.ndarray,
        frame_idx: int,
    ) -> Tuple[np.ndarray, List[TrackedObject], Dict[str, any]]:
        """
        Process a single video frame through detection, tracking, identification,
        attendance, PPE compliance, geofencing, and safety status engine.
        """
        t0 = time.perf_counter()

        # Step 1: Detect Persons
        detections: List[DetectionResult] = self.detector.detect(frame)

        # Step 2: Multi-Object Track (ByteTrack)
        tracked_objects: List[TrackedObject] = self.tracker.update(detections, frame)

        # Step 3: Worker Identification & Temporal Verification
        frame_h, frame_w = frame.shape[:2]
        for worker in tracked_objects:
            x1, y1, x2, y2 = worker.bbox
            cx1, cy1 = max(0, x1), max(0, y1)
            cx2, cy2 = min(frame_w, x2), min(frame_h, y2)

            if cx2 - cx1 > 20 and cy2 - cy1 > 20:
                # Check if this track ID is already verified by consensus tracker
                existing_ver = self.consensus.locked_identities.get(worker.track_id)
                if existing_ver is not None:
                    worker.worker_id = existing_ver.get("worker_id")
                    worker.worker_name = existing_ver.get("worker_name", "UNKNOWN")
                    worker.id_confidence = existing_ver.get("confidence", 0.0)
                    worker.is_verified = True
                else:
                    worker_crop = frame[cy1:cy2, cx1:cx2]
                    raw_wid, raw_name, raw_conf = self.identifier.identify_crop(worker_crop)
                    wid, wname, conf, is_verified = self.consensus.update(
                        track_id=worker.track_id,
                        raw_worker_id=raw_wid,
                        raw_worker_name=raw_name,
                        confidence=raw_conf,
                    )

                    worker.worker_id = wid
                    worker.worker_name = wname
                    worker.id_confidence = conf
                    worker.is_verified = is_verified


                # Step 4: Automatic Attendance Marking (Verified & Deduplicated)
                if self.attendance_enabled and worker.is_verified and worker.worker_id is not None and not worker.attendance_marked:
                    rec, is_new = self.attendance_service.mark_or_update_attendance(
                        worker_id=worker.worker_id,
                        worker_name=worker.worker_name,
                        track_id=worker.track_id,
                        confidence=worker.id_confidence,
                    )
                    worker.attendance_marked = True
                    if is_new:
                        print(f"\n[ATTENDANCE MARKED] {worker.worker_name} ({worker.worker_id}) | Track #{worker.track_id} | Time: {rec.first_seen_time} | Conf: {worker.id_confidence:.1%}")


            # Step 5: PPE Verification
            ppe_res = self.ppe_detector.detect_ppe(frame, worker.bbox, track_id=worker.track_id)
            worker.helmet_status = ppe_res.helmet_status
            worker.vest_status = ppe_res.vest_status
            worker.gloves_status = ppe_res.gloves_status
            worker.goggles_status = ppe_res.goggles_status
            worker.mask_status = ppe_res.mask_status
            worker.boots_status = ppe_res.boots_status
            worker.overall_ppe_status = ppe_res.overall_ppe_status
            worker.ppe_confidence = ppe_res.confidence

            # Step 6: Zone Monitoring & Geofencing
            zone_eval = self.zone_service.evaluate_worker_movement(
                track_id=worker.track_id,
                bottom_center=worker.bottom_center,
                frame_width=frame_w,
                frame_height=frame_h,
            )
            worker.zone_name = zone_eval.get("zone_name", "General Area")
            worker.zone_type = zone_eval.get("zone_type", "SAFE")
            worker.dwell_seconds = zone_eval.get("dwell_seconds", 0.0)

            # Step 7: Worker Safety Status Engine & Incident Trigger
            safety_eval = self.safety_engine.evaluate_worker(
                track_id=worker.track_id,
                worker_id=worker.worker_id,
                worker_name=worker.worker_name,
                bbox=worker.bbox,
                ppe_result=ppe_res,
                zone_eval=zone_eval,
                frame=frame,
            )
            worker.safety_status = safety_eval.get("safety_status", "SAFE")
            worker.severity = safety_eval.get("severity", "LOW")

        t_elapsed = time.perf_counter() - t0
        instant_fps = 1.0 / t_elapsed if t_elapsed > 0 else 0.0
        self.fps_window.append(instant_fps)
        current_avg_fps = sum(self.fps_window) / len(self.fps_window)

        identified_count = sum(1 for w in tracked_objects if w.is_verified)
        today_attendance = len(self.attendance_service.get_today_attendance())
        violations_count = sum(
            1 for w in tracked_objects if w.safety_status in ("PPE_VIOLATION", "RESTRICTED_ZONE_VIOLATION", "MULTIPLE_VIOLATIONS")
        )

        weather_reading = self.weather_service.get_current_weather()
        weather_risk = weather_reading.get("risk_level", "SAFE")
        weather_temp = weather_reading.get("temperature_c", "--")

        stats = {
            "fps": current_avg_fps,
            "instant_latency_ms": t_elapsed * 1000.0,
            "frame_index": frame_idx,
            "active_workers": len(tracked_objects),
            "total_unique_tracks": self.tracker.total_unique_tracks,
            "raw_detections_count": len(detections),
            "identified_count": identified_count,
            "attendance_count": today_attendance,
            "violations_count": violations_count,
            "weather_risk": weather_risk,
            "weather_temp": weather_temp,
        }

        # Step 8: Visual Annotation & Telemetry
        active_zones = self.zone_service.list_zones(active_only=True)
        annotated_frame = self.annotator.annotate(frame, tracked_objects, stats, zones=active_zones)

        return annotated_frame, tracked_objects, stats

    def stream(self) -> Generator[Tuple[np.ndarray, List[TrackedObject], Dict[str, any]], None, None]:
        """
        Generator yielding (annotated_frame, tracked_objects, stats) for each frame.
        Useful for web streaming, FastAPI WebSocket endpoints, and custom consumers.
        """
        self._init_writer_if_needed()
        self.start_time = time.perf_counter()

        for frame_idx, frame in self.reader.stream_frames():
            annotated_frame, tracked_objects, stats = self.process_frame(frame, frame_idx)
            self.total_frames_processed += 1

            if self.writer is not None:
                self.writer.write(annotated_frame)

            yield annotated_frame, tracked_objects, stats

    def run(self) -> Dict[str, any]:
        """
        Run the complete pipeline interactively with OpenCV display window.
        Returns final telemetry session summary.
        """
        show_display = self.config.get("output", {}).get("show_display", True)
        window_title = self.config.get("output", {}).get("window_title", "Industrial Worker Safety Monitoring")

        if show_display:
            cv2.namedWindow(window_title, cv2.WINDOW_NORMAL)

        print("[Pipeline] Starting video processing loop. Press 'q' or 'ESC' in window to exit.")
        try:
            for annotated_frame, tracked_objects, stats in self.stream():
                if show_display:
                    cv2.imshow(window_title, annotated_frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key in (27, ord("q"), ord("Q")):
                        print("\n[Pipeline] User requested exit.")
                        break
                    elif key == ord("p"):  # Pause toggle
                        print("[Pipeline] Paused. Press any key to continue...")
                        cv2.waitKey(0)

                # Periodic console heartbeat every 30 frames
                if stats["frame_index"] % 30 == 0:
                    print(
                        f"Frame {stats['frame_index']:04d} | "
                        f"FPS: {stats['fps']:5.1f} | "
                        f"Active: {stats['active_workers']:02d} | "
                        f"Violations: {stats['violations_count']:02d} | "
                        f"Tracks: {stats['total_unique_tracks']:02d}"
                    )
        finally:
            self.close()

        total_duration = time.perf_counter() - self.start_time if self.start_time else 0.0
        final_avg_fps = self.total_frames_processed / total_duration if total_duration > 0 else 0.0

        summary = {
            "total_frames": self.total_frames_processed,
            "total_duration_sec": round(total_duration, 2),
            "average_fps": round(final_avg_fps, 2),
            "total_unique_workers_tracked": self.tracker.total_unique_tracks,
        }

        print("\n" + "=" * 50)
        print("PIPELINE SESSION SUMMARY:")
        print(f"  Frames Processed:   {summary['total_frames']}")
        print(f"  Total Duration:     {summary['total_duration_sec']}s")
        print(f"  Average FPS:        {summary['average_fps']}")
        print(f"  Unique Workers:     {summary['total_unique_workers_tracked']}")
        print("=" * 50)
        return summary

    def close(self) -> None:
        """Release all allocated resources."""
        if self.writer is not None:
            self.writer.release()
            self.writer = None
        self.reader.release()
        cv2.destroyAllWindows()
