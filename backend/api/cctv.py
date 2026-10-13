"""
CCTV Live Telemetry & Video Streaming Router
Streams real-time MJPEG video feed, snapshot captures, and controls monitoring pipelines.
"""

import asyncio
from datetime import datetime
import os
import threading
import time
from typing import Dict, List, Optional
import cv2
from fastapi import APIRouter, Depends, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
import base64
import numpy as np

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from ml.inference.pipeline import SafetyVisionPipeline

router = APIRouter(prefix="/api/cctv", tags=["CCTV Stream"])


class StreamManager:
    """
    Manages background video pipeline processing and distributes annotated frames to web clients.
    """

    def __init__(self):
        self.pipeline: Optional[SafetyVisionPipeline] = None
        self.is_running = False
        self.latest_frame_jpeg: Optional[bytes] = None
        self.latest_stats: Dict[str, any] = {}
        self.latest_tracks: List[dict] = []
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self.source = "data/sample_videos/test_cctv.mp4"

    def start(self, source: Optional[str] = None):
        with self._lock:
            if self.is_running:
                return

            if source:
                self.source = source

            self.is_running = True
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()
            print(f"[StreamManager] Background video stream started on source: {self.source}")

    def stop(self):
        with self._lock:
            self.is_running = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None
        if self.pipeline:
            self.pipeline.close()
            self.pipeline = None
        print("[StreamManager] Background video stream stopped.")

    def _run_loop(self):
        try:
            # Initialize pipeline with headless configuration and looping enabled
            self.pipeline = SafetyVisionPipeline(
                source=self.source,
                show_display=False,
                save_video=False,
            )
            # Ensure looping is enabled on reader for continuous CCTV streaming
            self.pipeline.reader.loop = True

            for annotated_frame, tracked_objects, stats in self.pipeline.stream():
                if not self.is_running:
                    break

                # Encode frame to JPEG for browser streaming
                ret, buffer = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                if ret:
                    with self._lock:
                        self.latest_frame_jpeg = buffer.tobytes()
                        self.latest_stats = stats
                        self.latest_tracks = [
                            {
                                "track_id": w.track_id,
                                "worker_id": w.worker_id,
                                "worker_name": w.worker_name,
                                "allocated_manager": getattr(w, "allocated_manager", "Unassigned"),
                                "attendance_status": getattr(w, "attendance_display_status", "Unknown Worker — Attendance Not Marked"),
                                "bbox": list(w.bbox),
                                "confidence": round(w.confidence, 3),
                                "id_confidence": round(w.id_confidence, 3),
                                "is_verified": w.is_verified,
                                "helmet_status": w.helmet_status,
                                "vest_status": w.vest_status,
                                "gloves_status": w.gloves_status,
                                "goggles_status": getattr(w, 'goggles_status', 'UNKNOWN'),
                                "mask_status": getattr(w, 'mask_status', 'UNKNOWN'),
                                "boots_status": getattr(w, 'boots_status', 'UNKNOWN'),
                                "overall_ppe_status": w.overall_ppe_status,
                                "zone_name": w.zone_name,
                                "zone_type": w.zone_type,
                                "dwell_seconds": w.dwell_seconds,
                                "safety_status": w.safety_status,
                                "severity": w.severity,
                            }
                            for w in tracked_objects
                        ]

                # Maintain realistic streaming frame interval (~20 FPS)
                time.sleep(0.045)
        except Exception as e:
            print(f"[StreamManager] Stream loop terminated: {e}")
            self.is_running = False


# Global singleton instance
stream_manager = StreamManager()


@router.on_event("startup")
def startup_stream():
    # Automatically start streaming sample CCTV loop in the background
    stream_manager.start()


@router.get("/status")
def get_cctv_status():
    return {
        "is_running": stream_manager.is_running,
        "source": stream_manager.source,
        "fps": stream_manager.latest_stats.get("fps", 0.0),
        "frame_index": stream_manager.latest_stats.get("frame_index", 0),
        "active_workers_count": stream_manager.latest_stats.get("active_workers", 0),
        "total_unique_tracks": stream_manager.latest_stats.get("total_unique_tracks", 0),
        "violations_count": stream_manager.latest_stats.get("violations_count", 0),
        "weather_risk": stream_manager.latest_stats.get("weather_risk", "SAFE"),
    }


@router.post("/start")
def start_cctv_stream(source: Optional[str] = None, manager: Manager = Depends(get_current_manager)):
    stream_manager.start(source=source)
    return {"message": "CCTV stream started.", "is_running": stream_manager.is_running}


@router.post("/stop")
def stop_cctv_stream(manager: Manager = Depends(get_current_manager)):
    stream_manager.stop()
    return {"message": "CCTV stream stopped.", "is_running": stream_manager.is_running}


@router.get("/snapshot")
def get_cctv_snapshot():
    """Returns single latest JPEG frame snapshot."""
    if stream_manager.latest_frame_jpeg is None:
        # Generate placeholder frame if pipeline is initializing
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(blank, "INITIALIZING CCTV FEED...", (80, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 215, 255), 2)
        _, buf = cv2.imencode(".jpg", blank)
        return Response(content=buf.tobytes(), media_type="image/jpeg")

    return Response(content=stream_manager.latest_frame_jpeg, media_type="image/jpeg")


def _generate_mjpeg_frames():
    while True:
        if stream_manager.latest_frame_jpeg is not None:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + stream_manager.latest_frame_jpeg + b"\r\n"
            )
        else:
            time.sleep(0.1)
        time.sleep(0.04)


@router.get("/stream")
def get_live_mjpeg_stream():
    """
    Standard multipart/x-mixed-replace MJPEG video stream.
    Directly renderable inside standard HTML <img src="/api/cctv/stream" /> tags.
    """
    if not stream_manager.is_running:
        stream_manager.start()

    return StreamingResponse(
        _generate_mjpeg_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )

class WebcamStreamManager:
    def __init__(self):
        self.pipeline: Optional[SafetyVisionPipeline] = None
        self.frame_index = 0
        self._lock = threading.Lock()

    def get_pipeline(self) -> SafetyVisionPipeline:
        with self._lock:
            if self.pipeline is None:
                # Initialize pipeline with a dummy source just to construct properly
                # We won't use stream(), we'll use process_frame() directly.
                self.pipeline = SafetyVisionPipeline(
                    source="data/sample_videos/test_cctv.mp4", 
                    show_display=False, 
                    save_video=False
                )
            return self.pipeline

webcam_manager = WebcamStreamManager()

@router.websocket("/ws-inference")
async def websocket_inference(websocket: WebSocket):
    await websocket.accept()
    pipeline = webcam_manager.get_pipeline()
    
    try:
        while True:
            data = await websocket.receive_text()
            if data.startswith("data:image/jpeg;base64,"):
                data = data.split(",", 1)[1]
            elif data.startswith("data:image/png;base64,"):
                data = data.split(",", 1)[1]
                
            img_bytes = base64.b64decode(data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if frame is not None:
                webcam_manager.frame_index += 1
                fh, fw = frame.shape[:2]
                
                # Run the actual pipeline directly on this frame
                annotated_frame, tracked_objects, stats = pipeline.process_frame(frame, webcam_manager.frame_index)
                
                # Prepare tracks response with both pixel and normalized coordinates
                tracks = [
                    {
                        "track_id": w.track_id,
                        "worker_id": w.worker_id,
                        "worker_name": w.worker_name,
                        "allocated_manager": getattr(w, "allocated_manager", "Unassigned"),
                        "attendance_status": getattr(w, "attendance_display_status", "Unknown Worker — Attendance Not Marked"),
                        "bbox": list(w.bbox),
                        "norm_bbox": [
                            round(w.bbox[0] / max(1, fw), 4),
                            round(w.bbox[1] / max(1, fh), 4),
                            round(w.bbox[2] / max(1, fw), 4),
                            round(w.bbox[3] / max(1, fh), 4),
                        ],
                        "confidence": round(w.confidence, 3),
                        "id_confidence": round(w.id_confidence, 3),
                        "helmet_status": w.helmet_status,
                        "vest_status": w.vest_status,
                        "gloves_status": w.gloves_status,
                        "goggles_status": getattr(w, 'goggles_status', 'UNKNOWN'),
                        "mask_status": getattr(w, 'mask_status', 'UNKNOWN'),
                        "boots_status": getattr(w, 'boots_status', 'UNKNOWN'),
                        "overall_ppe_status": w.overall_ppe_status,
                        "zone_name": w.zone_name,
                        "safety_status": w.safety_status,
                        "severity": getattr(w, 'severity', 'LOW'),
                        "is_verified": getattr(w, 'is_verified', False)
                    }
                    for w in tracked_objects
                ]

                # Encode annotated frame back to base64
                ret, buffer = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                b64_img = base64.b64encode(buffer).decode("utf-8") if ret else ""
                
                # Update stream_manager global telemetry so REST endpoints like /api/detections stay synced
                with stream_manager._lock:
                    stream_manager.latest_stats = stats
                    stream_manager.latest_tracks = tracks
                    if ret:
                        stream_manager.latest_frame_jpeg = buffer.tobytes()
                
                await websocket.send_json({
                    "image": f"data:image/jpeg;base64,{b64_img}" if b64_img else "",
                    "stats": stats,
                    "tracks": tracks,
                    "frame_width": fw,
                    "frame_height": fh,
                })
    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected from webcam inference")
    except Exception as e:
        print(f"[WebSocket] Error processing frame: {e}")


@router.post("/frame-inference")
def post_frame_inference(payload: dict):
    """
    HTTP REST POST alternative for processing single webcam frames.
    Provides automatic fallback if WebSockets are blocked by proxies or browser policies.
    """
    data = payload.get("image", "")
    if not data:
        return {"error": "No image data provided"}

    if data.startswith("data:image/jpeg;base64,"):
        data = data.split(",", 1)[1]
    elif data.startswith("data:image/png;base64,"):
        data = data.split(",", 1)[1]

    try:
        img_bytes = base64.b64decode(data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"error": "Invalid frame decode"}

        pipeline = webcam_manager.get_pipeline()
        webcam_manager.frame_index += 1
        fh, fw = frame.shape[:2]

        annotated_frame, tracked_objects, stats = pipeline.process_frame(frame, webcam_manager.frame_index)

        ret, buffer = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        b64_img = base64.b64encode(buffer).decode("utf-8") if ret else ""

        tracks = [
            {
                "track_id": w.track_id,
                "worker_id": w.worker_id,
                "worker_name": w.worker_name,
                "allocated_manager": getattr(w, "allocated_manager", "Unassigned"),
                "attendance_status": getattr(w, "attendance_display_status", "Unknown Worker — Attendance Not Marked"),
                "bbox": list(w.bbox),
                "norm_bbox": [
                    round(w.bbox[0] / max(1, fw), 4),
                    round(w.bbox[1] / max(1, fh), 4),
                    round(w.bbox[2] / max(1, fw), 4),
                    round(w.bbox[3] / max(1, fh), 4),
                ],
                "confidence": round(w.confidence, 3),
                "id_confidence": round(w.id_confidence, 3),
                "helmet_status": w.helmet_status,
                "vest_status": w.vest_status,
                "gloves_status": w.gloves_status,
                "goggles_status": getattr(w, 'goggles_status', 'UNKNOWN'),
                "mask_status": getattr(w, 'mask_status', 'UNKNOWN'),
                "boots_status": getattr(w, 'boots_status', 'UNKNOWN'),
                "overall_ppe_status": w.overall_ppe_status,
                "zone_name": w.zone_name,
                "safety_status": w.safety_status,
                "severity": getattr(w, 'severity', 'LOW'),
                "is_verified": getattr(w, 'is_verified', False)
            }
            for w in tracked_objects
        ]

        with stream_manager._lock:
            stream_manager.latest_stats = stats
            stream_manager.latest_tracks = tracks
            if ret:
                stream_manager.latest_frame_jpeg = buffer.tobytes()

        return {
            "image": f"data:image/jpeg;base64,{b64_img}" if b64_img else "",
            "stats": stats,
            "tracks": tracks,
            "frame_width": fw,
            "frame_height": fh,
        }
    except Exception as e:
        print(f"[FrameInference] Error: {e}")
        return {"error": str(e)}


