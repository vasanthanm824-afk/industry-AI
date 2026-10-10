"""
Worker Management Router
Handles worker registration with face/appearance enrollment, listing, and individual profile histories.
"""

import json
import os
import shutil
from typing import List, Optional
import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
import numpy as np
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.attendance import Attendance
from backend.db.models.incident import Incident
from backend.db.models.manager import Manager
from backend.db.models.ppe_record import PPERecord
from backend.db.models.worker import Worker
from backend.db.session import get_db
from backend.services.attendance_service import AttendanceService
from ml.inference.identifier import FeatureExtractor

router = APIRouter(prefix="/api/workers", tags=["Workers"])


@router.get("")
def list_workers(db: Session = Depends(get_db), manager: Manager = Depends(get_current_manager)):
    service = AttendanceService(db_session=db)
    workers = service.list_workers()
    return {"total": len(workers), "workers": [w.to_dict() for w in workers]}


@router.get("/{worker_id}")
def get_worker_detail(worker_id: str, db: Session = Depends(get_db), manager: Manager = Depends(get_current_manager)):
    service = AttendanceService(db_session=db)
    worker = service.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Worker {worker_id} not found.")

    # Fetch attendance history
    attendance_records = (
        db.query(Attendance)
        .filter(Attendance.worker_id == worker_id)
        .order_by(Attendance.date.desc())
        .limit(30)
        .all()
    )

    # Fetch safety incident history
    incident_records = (
        db.query(Incident)
        .filter(Incident.worker_id == worker_id)
        .order_by(Incident.timestamp.desc())
        .limit(30)
        .all()
    )

    # Fetch recent PPE checks
    ppe_checks = (
        db.query(PPERecord)
        .filter(PPERecord.worker_id == worker_id)
        .order_by(PPERecord.timestamp.desc())
        .limit(30)
        .all()
    )

    return {
        "worker": worker.to_dict(),
        "attendance_history": [a.to_dict() for a in attendance_records],
        "incident_history": [i.to_dict() for i in incident_records],
        "recent_ppe_checks": [p.to_dict() for p in ppe_checks],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_worker(
    worker_id: str = Form(...),
    worker_name: str = Form(...),
    department: str = Form("Operations"),
    role: str = Form("Worker"),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    os.makedirs("data/worker_faces", exist_ok=True)
    os.makedirs("data/embeddings", exist_ok=True)

    photo_path = None
    embedding_path = None

    if photo:
        photo_filename = f"{worker_id}.jpg"
        save_path = os.path.join("data", "worker_faces", photo_filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(photo.file, f)
        photo_path = save_path.replace("\\", "/")

        # Compute feature embedding using YOLOv8-cls
        try:
            extractor = FeatureExtractor(model_path="ml/weights/yolov8n-cls.pt", device="cpu")
            img = cv2.imread(save_path)
            if img is not None:
                embedding = extractor.extract_embedding(img)
                if embedding is not None:
                    emb_file = os.path.join("data", "embeddings", f"{worker_id}.npy")
                    np.save(emb_file, embedding)
                    embedding_path = emb_file.replace("\\", "/")

                    meta_file = os.path.join("data", "embeddings", f"{worker_id}.json")
                    with open(meta_file, "w", encoding="utf-8") as mf:
                        json.dump({
                            "worker_id": worker_id,
                            "worker_name": worker_name,
                            "department": department,
                            "role": role,
                        }, mf)
        except Exception as e:
            print(f"[WorkerRouter] Warning: Embedding extraction failed: {e}")

    service = AttendanceService(db_session=db)
    worker = service.register_worker(
        worker_id=worker_id,
        worker_name=worker_name,
        department=department,
        role=role,
        photo_path=photo_path,
        embedding_path=embedding_path,
    )

    return {
        "message": f"Worker {worker.worker_name} ({worker.worker_id}) registered successfully.",
        "worker": worker.to_dict(),
        "has_biometric_embedding": embedding_path is not None,
    }
