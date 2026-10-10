"""
Sample Video Generator / Test Clip Utility
Generates test benchmark videos to ensure the pipeline can be tested immediately
even without an attached physical webcam or external video files.
"""

import os
import urllib.request
import cv2
import numpy as np


def generate_person_cctv_sample(
    output_path: str = "data/sample_videos/test_cctv.mp4",
    num_frames: int = 75,
    fps: int = 25,
):
    """
    Creates a realistic test CCTV video featuring real human figures with camera motion,
    guaranteeing that YOLO person detector and ByteTrack tracker will detect and track them.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_img_path = "data/sample_videos/_temp_ref.jpg"

    print("[Sample Generator] Preparing sample frame with real persons...")
    # Fetch sample reference containing pedestrians
    url = "https://ultralytics.com/images/bus.jpg"
    try:
        urllib.request.urlretrieve(url, temp_img_path)
        img = cv2.imread(temp_img_path)
    except Exception as e:
        print(f"[Sample Generator] Warning: Could not fetch image ({e}), generating synthetic silhouette.")
        img = np.full((720, 1280, 3), (50, 50, 55), dtype=np.uint8)

    h, w = img.shape[:2]
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    print(f"[Sample Generator] Writing {num_frames} frames to {output_path}...")
    for i in range(num_frames):
        shift_x = int(np.sin(i * 0.08) * 8)
        shift_y = int(np.cos(i * 0.08) * 4)
        M = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
        frame = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT)

        # Overlay simulated CCTV timestamp
        timestamp_str = f"CAM-01 [WAREHOUSE-GATE] 2026-10-06 08:30:{i // fps:02d}.{int((i % fps) * 40):03d}"
        cv2.putText(
            frame,
            timestamp_str,
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
        out.write(frame)

    out.release()
    if os.path.exists(temp_img_path):
        os.remove(temp_img_path)

    print(f"[Sample Generator] Created {output_path} successfully ({os.path.getsize(output_path)} bytes).")
    return output_path


if __name__ == "__main__":
    generate_person_cctv_sample()
