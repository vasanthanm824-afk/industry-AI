#!/usr/bin/env python3
"""
Worker Registration & Face/Appearance Enrollment CLI

Enrolls a new worker into the system:
1. Saves worker profile into SQLite/SQLAlchemy database.
2. Extracts normalized 256-D deep feature embedding.
3. Saves raw image to data/worker_faces/ and embedding to data/embeddings/.

Usage Examples:
  python scripts/register_worker.py --id EMP-01 --name "Alex Morgan" --department "Assembly" --role "Technician" --image path/to/photo.jpg
  python scripts/register_worker.py --list
"""

import argparse
import os
import shutil
import sys
import cv2
import numpy as np

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.services.attendance_service import AttendanceService
from ml.inference.identifier import FeatureExtractor


def parse_args():
    parser = argparse.ArgumentParser(description="Industrial Worker Registration & Biometric Enrollment")
    parser.add_argument("--id", type=str, help="Unique worker identifier (e.g. EMP-01).")
    parser.add_argument("--name", type=str, help="Worker full name.")
    parser.add_argument("--department", type=str, default="Operations", help="Department/Unit.")
    parser.add_argument("--role", type=str, default="Worker", help="Assigned role.")
    parser.add_argument("--image", type=str, help="Path to worker registration photo.")
    parser.add_argument("--list", action="store_true", help="List all currently registered workers.")
    parser.add_argument("--weights", type=str, default="ml/weights/yolov8n-cls.pt", help="Feature extraction model.")
    return parser.parse_args()


def enroll_worker(worker_id: str, name: str, department: str, role: str, image_path: str, weights_path: str):
    if not os.path.exists(image_path):
        print(f"[ERROR] Registration image not found at: {image_path}")
        sys.exit(1)

    img = cv2.imread(image_path)
    if img is None:
        print(f"[ERROR] Could not decode image file: {image_path}")
        sys.exit(1)

    print(f"\n[Enrollment] Processing worker: {name} (ID: {worker_id})")

    # 1. Initialize Feature Extractor & Compute Embedding
    extractor = FeatureExtractor(model_path=weights_path, device="cpu")
    embedding = extractor.extract_embedding(img)
    if embedding is None:
        print("[ERROR] Failed to extract feature embedding from image.")
        sys.exit(1)

    # 2. Store Embedding Separately from Raw Images
    embeddings_dir = "data/embeddings"
    faces_dir = "data/worker_faces"
    os.makedirs(embeddings_dir, exist_ok=True)
    os.makedirs(faces_dir, exist_ok=True)

    emb_path = os.path.join(embeddings_dir, f"{worker_id}.npy")
    np.save(emb_path, embedding)

    import json
    meta_path = os.path.join(embeddings_dir, f"{worker_id}.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"worker_id": worker_id, "worker_name": name, "department": department, "role": role}, f, indent=2)

    # 3. Store Reference Photo
    dest_photo_path = os.path.join(faces_dir, f"{worker_id}.jpg")
    cv2.imwrite(dest_photo_path, img)

    # 4. Save to Database
    service = AttendanceService()
    worker_record = service.register_worker(
        worker_id=worker_id,
        worker_name=name,
        department=department,
        role=role,
        photo_path=dest_photo_path,
        embedding_path=emb_path,
    )

    print("=" * 60)
    print("WORKER ENROLLMENT SUCCESSFUL:")
    print(f"  Worker ID:       {worker_record.worker_id}")
    print(f"  Name:            {worker_record.worker_name}")
    print(f"  Department:      {worker_record.department}")
    print(f"  Role:            {worker_record.role}")
    print(f"  Photo Saved:     {dest_photo_path}")
    print(f"  Embedding Saved: {emb_path} (256-D normalized vector)")
    print("=" * 60)


def list_registered_workers():
    service = AttendanceService()
    workers = service.list_workers()
    print("\n" + "=" * 60)
    print(f"REGISTERED WORKERS ROSTER (Total: {len(workers)})")
    print("=" * 60)
    if not workers:
        print("  (No workers registered yet. Enroll workers using --id and --image)")
    for w in workers:
        print(f"  * [{w.worker_id}] {w.worker_name:<20} | {w.department:<15} | {w.role}")
    print("=" * 60)


def main():
    args = parse_args()
    if args.list:
        list_registered_workers()
        return

    if not args.id or not args.name or not args.image:
        print("[ERROR] Please provide --id, --name, and --image to enroll a worker, or use --list.")
        sys.exit(1)

    enroll_worker(
        worker_id=args.id,
        name=args.name,
        department=args.department,
        role=args.role,
        image_path=args.image,
        weights_path=args.weights,
    )


if __name__ == "__main__":
    main()
