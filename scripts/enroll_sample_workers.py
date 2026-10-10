#!/usr/bin/env python3
"""
Enroll Sample Benchmark Workers from CCTV footage
Extracts crops from the sample CCTV video and enrolls them as registered workers:
- EMP-01: "Alex Rivera" (Lead Technician, Operations)
- EMP-02: "Marcus Chen" (Site Supervisor, Safety)
(Leaves Worker #3 unregistered as a true test of the UNKNOWN worker detection logic!)
"""

import os
import sys
import cv2

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.services.attendance_service import AttendanceService
from ml.inference.identifier import FeatureExtractor


def enroll_sample_benchmark_workers():
    video_path = "data/sample_videos/test_cctv.mp4"
    if not os.path.exists(video_path):
        print(f"[ERROR] Sample video not found: {video_path}")
        return

    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        print("[ERROR] Could not read frame from sample video.")
        return

    # Detected bounding box locations from the first frame
    # Worker 1 (Left: Fleece coat), Worker 2 (Right: Dark jacket)
    sample_workers = [
        {
            "id": "EMP-01",
            "name": "Alex Rivera",
            "department": "Mechanical Operations",
            "role": "Lead Technician",
            "crop": frame[401:906, 46:245],  # Worker #1 crop (left)
        },
        {
            "id": "EMP-02",
            "name": "Marcus Chen",
            "department": "Logistics",
            "role": "Forklift Operator",
            "crop": frame[393:879, 669:809],  # Worker #2 crop (right)
        },
    ]

    extractor = FeatureExtractor(model_path="ml/weights/yolov8n-cls.pt", device="cpu")
    service = AttendanceService()

    os.makedirs("data/worker_faces", exist_ok=True)
    os.makedirs("data/embeddings", exist_ok=True)

    print("\n" + "=" * 65)
    print("ENROLLING BENCHMARK WORKERS (Step 2 Demo)")
    print("=" * 65)

    for w in sample_workers:
        crop = w["crop"]
        if crop.shape[0] < 20 or crop.shape[1] < 20:
            continue

        photo_path = f"data/worker_faces/{w['id']}.jpg"
        emb_path = f"data/embeddings/{w['id']}.npy"

        # Save photo
        cv2.imwrite(photo_path, crop)

        # Extract and save embedding
        feat = extractor.extract_embedding(crop)
        import numpy as np
        np.save(emb_path, feat)

        import json
        meta_path = f"data/embeddings/{w['id']}.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump({"worker_id": w["id"], "worker_name": w["name"], "department": w["department"], "role": w["role"]}, f)

        # Register in database
        rec = service.register_worker(
            worker_id=w["id"],
            worker_name=w["name"],
            department=w["department"],
            role=w["role"],
            photo_path=photo_path,
            embedding_path=emb_path,
        )

        print(f"  [+] Enrolled {rec.worker_name} ({rec.worker_id}) -> {rec.role} in {rec.department}")

    print("\n[NOTE] Worker #3 is intentionally UNREGISTERED to demonstrate the UNKNOWN rejection logic.")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    enroll_sample_benchmark_workers()
