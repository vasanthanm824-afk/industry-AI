"""
Visual Annotation & HUD Statistics Module
Renders high-contrast bounding boxes, persistent track IDs, motion trails,
spatial zone overlays, PPE compliance chips, and real-time safety telemetry.
"""

from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np

from .tracker import TrackedObject


class VideoAnnotator:
    """
    Renders worker detection bounding boxes, tracking identifiers,
    motion trails, zone geofences, PPE status badges, and real-time HUD telemetry overlay.
    """

    COLOR_PALETTE: List[Tuple[int, int, int]] = [
        (46, 204, 113),   # Emerald Green
        (52, 152, 219),   # Blue
        (241, 196, 15),   # Yellow
        (155, 89, 182),   # Purple
        (230, 126, 34),   # Orange
        (26, 188, 156),   # Turquoise
        (231, 76, 60),    # Crimson
        (243, 156, 18),   # Amber
        (52, 73, 94),     # Dark Slate
        (142, 68, 173),   # Violet
    ]

    STATUS_COLORS = {
        "SAFE": (46, 204, 113),                  # Green
        "PPE_VIOLATION": (0, 165, 255),          # Amber / Orange
        "RESTRICTED_ZONE_VIOLATION": (40, 40, 230), # Crimson
        "MULTIPLE_VIOLATIONS": (30, 20, 240),    # Severe Red
        "UNKNOWN": (140, 150, 160),              # Slate Gray
    }

    def __init__(
        self,
        box_thickness: int = 2,
        font_scale: float = 0.50,
        show_confidence: bool = True,
        trail_length: int = 20,
        show_hud: bool = True,
    ):
        self.box_thickness = box_thickness
        self.font_scale = font_scale
        self.show_confidence = show_confidence
        self.trail_length = trail_length
        self.show_hud = show_hud
        self.font = cv2.FONT_HERSHEY_SIMPLEX

    def get_color_for_id(self, track_id: int) -> Tuple[int, int, int]:
        return self.COLOR_PALETTE[track_id % len(self.COLOR_PALETTE)]

    def get_color_for_safety_status(self, status: str) -> Tuple[int, int, int]:
        return self.STATUS_COLORS.get(status, (46, 204, 113))

    def draw_rounded_rectangle(
        self,
        img: np.ndarray,
        pt1: Tuple[int, int],
        pt2: Tuple[int, int],
        color: Tuple[int, int, int],
        thickness: int = 2,
    ) -> None:
        x1, y1 = pt1
        x2, y2 = pt2
        cv2.rectangle(img, (x1, y1), (x2, y2), color, thickness)
        corner_len = min(15, max(4, (x2 - x1) // 5), max(4, (y2 - y1) // 5))
        if corner_len > 0:
            corner_thick = thickness + 2
            cv2.line(img, (x1, y1), (x1 + corner_len, y1), color, corner_thick)
            cv2.line(img, (x1, y1), (x1, y1 + corner_len), color, corner_thick)
            cv2.line(img, (x2, y1), (x2 - corner_len, y1), color, corner_thick)
            cv2.line(img, (x2, y1), (x2, y1 + corner_len), color, corner_thick)
            cv2.line(img, (x1, y2), (x1 + corner_len, y2), color, corner_thick)
            cv2.line(img, (x1, y2), (x1, y2 - corner_len), color, corner_thick)
            cv2.line(img, (x2, y2), (x2 - corner_len, y2), color, corner_thick)
            cv2.line(img, (x2, y2), (x2, y2 - corner_len), color, corner_thick)

    def draw_zones(self, img: np.ndarray, zones: List[any]) -> None:
        """Renders translucent colored polygon overlays for defined monitoring zones."""
        if not zones:
            return

        h, w = img.shape[:2]
        overlay = img.copy()

        for z in zones:
            poly = getattr(z, "polygon", []) if not isinstance(z, dict) else z.get("polygon", [])
            z_type = getattr(z, "zone_type", "SAFE") if not isinstance(z, dict) else z.get("zone_type", "SAFE")
            z_name = getattr(z, "zone_name", "Zone") if not isinstance(z, dict) else z.get("zone_name", "Zone")

            if len(poly) < 3:
                continue

            pts = []
            for p in poly:
                x, y = p[0], p[1]
                px = int(x * w) if x <= 1.0 else int(x)
                py = int(y * h) if y <= 1.0 else int(y)
                pts.append([px, py])
            pts = np.array([pts], dtype=np.int32)

            color = (40, 180, 80) if z_type == "SAFE" else ((0, 165, 255) if z_type == "WARNING" else (40, 40, 220))
            cv2.fillPoly(overlay, pts, color)

            # Draw zone label
            center_x = int(np.mean(pts[0][:, 0]))
            center_y = int(np.mean(pts[0][:, 1]))
            badge_text = f"[{z_type}] {z_name}"
            cv2.putText(overlay, badge_text, (center_x - 60, center_y), self.font, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

        cv2.addWeighted(overlay, 0.15, img, 0.85, 0, img)

    def annotate(
        self,
        frame: np.ndarray,
        tracked_objects: List[TrackedObject],
        stats: Optional[Dict[str, any]] = None,
        zones: Optional[List[any]] = None,
    ) -> np.ndarray:
        output = frame.copy()

        # 1. Render Zone Geofences
        if zones:
            self.draw_zones(output, zones)

        # 2. Render Tracked Workers
        for worker in tracked_objects:
            x1, y1, x2, y2 = worker.bbox
            box_color = self.get_color_for_safety_status(worker.safety_status)

            # Draw motion trail
            if self.trail_length > 0 and len(worker.history) > 1:
                points = worker.history[-self.trail_length:]
                for i in range(1, len(points)):
                    alpha = i / len(points)
                    thickness = max(1, int(2 * alpha))
                    cv2.line(output, points[i - 1], points[i], box_color, thickness, cv2.LINE_AA)

            # Bounding box
            self.draw_rounded_rectangle(output, (x1, y1), (x2, y2), box_color, self.box_thickness)
            cv2.circle(output, worker.centroid, 3, box_color, -1)

            # Construct worker status card
            self._draw_worker_card(output, worker, (x1, y1), box_color)

        # 3. Render HUD Telemetry
        if self.show_hud and stats is not None:
            self._render_hud(output, stats, len(tracked_objects))

        return output

    def _draw_worker_card(
        self,
        img: np.ndarray,
        worker: TrackedObject,
        origin: Tuple[int, int],
        status_color: Tuple[int, int, int],
    ) -> None:
        x, y = origin
        h_frame, w_frame = img.shape[:2]

        # Primary name / identity label & Allocated Manager
        if worker.is_verified:
            name_text = f"{worker.worker_name} ({worker.worker_id}) | Mgr: {getattr(worker, 'allocated_manager', 'Unassigned')}"
            att_text = getattr(worker, 'attendance_display_status', 'Attendance Marked')
        elif worker.worker_name and worker.worker_name not in ("UNKNOWN", "UNKNOWN PERSON"):
            name_text = f"{worker.worker_name}? ({int(worker.id_confidence * 100)}%)"
            att_text = "Verification In Progress..."
        else:
            name_text = f"UNKNOWN PERSON (Track #{worker.track_id})"
            att_text = "Unknown Worker — Attendance Not Marked"

        # Safety status line
        status_text = f"Status: {worker.safety_status.replace('_', ' ')}"

        # PPE chips line: [H:✓] [V:✗] [G:?]
        h_sym = "✓" if worker.helmet_status == "COMPLIANT" else ("✗" if worker.helmet_status == "VIOLATION" else ("N/V" if worker.helmet_status == "NOT VISIBLE" else "?"))
        v_sym = "✓" if worker.vest_status == "COMPLIANT" else ("✗" if worker.vest_status == "VIOLATION" else ("N/V" if worker.vest_status == "NOT VISIBLE" else "?"))
        g_sym = "✓" if worker.gloves_status == "COMPLIANT" else ("✗" if worker.gloves_status == "VIOLATION" else ("N/V" if worker.gloves_status == "NOT VISIBLE" else "?"))
        ppe_text = f"PPE [H:{h_sym} V:{v_sym} G:{g_sym}] | {att_text}"

        lines = [name_text, status_text, ppe_text]
        card_w = max(260, max(len(l) * 8 for l in lines))
        card_h = 62
        card_y = max(0, y - card_h - 4)

        # Draw dark badge background with colored border
        overlay = img.copy()
        cv2.rectangle(overlay, (x, card_y), (x + card_w, card_y + card_h), (18, 20, 24), -1)
        cv2.rectangle(overlay, (x, card_y), (x + 5, card_y + card_h), status_color, -1)
        cv2.rectangle(overlay, (x, card_y), (x + card_w, card_y + card_h), (60, 65, 75), 1)
        cv2.addWeighted(overlay, 0.85, img, 0.15, 0, img)

        # Draw text lines
        cv2.putText(img, name_text, (x + 10, card_y + 16), self.font, 0.44, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(img, status_text, (x + 10, card_y + 35), self.font, 0.38, status_color, 1, cv2.LINE_AA)
        cv2.putText(img, ppe_text, (x + 10, card_y + 53), self.font, 0.34, (200, 220, 240), 1, cv2.LINE_AA)

    def _render_hud(self, img: np.ndarray, stats: Dict[str, any], active_workers: int) -> None:
        hud_x, hud_y = 16, 16
        hud_w, hud_h = 320, 185

        overlay = img.copy()
        cv2.rectangle(overlay, (hud_x, hud_y), (hud_x + hud_w, hud_y + hud_h), (18, 22, 28), -1)
        cv2.rectangle(overlay, (hud_x, hud_y), (hud_x + hud_w, hud_y + hud_h), (55, 65, 80), 1)
        cv2.rectangle(overlay, (hud_x, hud_y), (hud_x + 4, hud_y + hud_h), (0, 215, 255), -1)
        cv2.addWeighted(overlay, 0.85, img, 0.15, 0, img)

        cv2.putText(
            img,
            "INDUSTRIAL SAFETY AI - LIVE TELEMETRY",
            (hud_x + 12, hud_y + 22),
            self.font,
            0.42,
            (0, 215, 255),
            1,
            cv2.LINE_AA,
        )

        fps = stats.get("fps", 0.0)
        total_unique = stats.get("total_unique_tracks", 0)
        identified_count = stats.get("identified_count", 0)
        attendance_count = stats.get("attendance_count", 0)
        violations_count = stats.get("violations_count", 0)
        weather_risk = stats.get("weather_risk", "SAFE")
        weather_temp = stats.get("weather_temp", "--")

        fps_color = (46, 204, 113) if fps >= 20 else ((241, 196, 15) if fps >= 10 else (231, 76, 60))
        cv2.putText(img, f"FPS: {fps:4.1f} | Active Workers: {active_workers}", (hud_x + 12, hud_y + 44), self.font, 0.42, fps_color, 1, cv2.LINE_AA)

        cv2.putText(img, f"Cumulative Unique Tracks: {total_unique}", (hud_x + 12, hud_y + 65), self.font, 0.40, (230, 230, 230), 1, cv2.LINE_AA)
        cv2.putText(img, f"Identified Workers: {identified_count}", (hud_x + 12, hud_y + 86), self.font, 0.40, (46, 204, 113) if identified_count > 0 else (170, 170, 170), 1, cv2.LINE_AA)
        cv2.putText(img, f"Today Attendance Present: {attendance_count}", (hud_x + 12, hud_y + 107), self.font, 0.40, (0, 220, 255), 1, cv2.LINE_AA)

        viol_color = (40, 40, 230) if violations_count > 0 else (46, 204, 113)
        cv2.putText(img, f"Active Safety Violations: {violations_count}", (hud_x + 12, hud_y + 128), self.font, 0.40, viol_color, 1, cv2.LINE_AA)

        w_color = (46, 204, 113) if weather_risk == "SAFE" else ((241, 196, 15) if weather_risk == "CAUTION" else (231, 76, 60))
        cv2.putText(img, f"Weather: {weather_temp}°C | Hazard Risk: {weather_risk}", (hud_x + 12, hud_y + 149), self.font, 0.38, w_color, 1, cv2.LINE_AA)

        frame_idx = stats.get("frame_index", 0)
        cv2.putText(img, f"Frame #{frame_idx} | Video Processing Stream", (hud_x + 12, hud_y + 170), self.font, 0.35, (130, 140, 150), 1, cv2.LINE_AA)
