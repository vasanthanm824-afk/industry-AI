"""
Worker Management Router
Handles worker registration with quality checks, auto-ID generation,
editing, removal, and live biometric gallery synchronization.
"""

import json
import os
import shutil
from typing import List, Optional
import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
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
from ml.inference.quality_checker import quality_checker

router = APIRouter(prefix="/api/workers", tags=["Workers"])


@router.get("/next-id")
def get_next_worker_id(db: Session = Depends(get_db), manager: Manager = Depends(get_current_manager)):
    """Returns the next suggested unique Worker ID."""
    service = AttendanceService(db_session=db)
    next_id = service.get_next_worker_id()
    return {"next_id": next_id}


@router.get("")
def list_workers(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    """Lists registered workers with optional search filtering."""
    service = AttendanceService(db_session=db)
    workers = service.list_workers()

    if search:
        s = search.strip().lower()
        workers = [
            w for w in workers
            if s in w.worker_name.lower()
            or s in w.worker_id.lower()
            or (w.allocated_manager and s in w.allocated_manager.lower())
            or (w.department and s in w.department.lower())
        ]

    return {"total": len(workers), "workers": [w.to_dict() for w in workers]}


@router.get("/{worker_id}")
def get_worker_detail(worker_id: str, db: Session = Depends(get_db), manager: Manager = Depends(get_current_manager)):
    """Retrieves worker profile, recent shift attendances, incidents, and PPE audits."""
    service = AttendanceService(db_session=db)
    worker = service.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Worker {worker_id} not found.")

    attendance_records = (
        db.query(Attendance)
        .filter(Attendance.worker_id == worker_id)
        .order_by(Attendance.date.desc())
        .limit(30)
        .all()
    )

    incident_records = (
        db.query(Incident)
        .filter(Incident.worker_id == worker_id)
        .order_by(Incident.timestamp.desc())
        .limit(30)
        .all()
    )

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
    worker_name: str = Form(...),
    allocated_manager: str = Form(...),
    worker_id: Optional[str] = Form(None),
    department: str = Form("Operations"),
    role: str = Form("Worker"),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    """
    Registers a new worker using the required fields:
    - Worker Name
    - Worker ID (auto-generated if empty)
    - Allocated Manager
    Validates duplicates and runs quality checks on uploaded photo.
    """
    # Enforce role-based access control
    if manager.role not in ("ADMIN", "SAFETY_MANAGER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only Administrator accounts can enroll new workers.",
        )

    service = AttendanceService(db_session=db)

    # 1. Resolve or auto-generate Worker ID
    final_worker_id = worker_id.strip() if worker_id and worker_id.strip() else service.get_next_worker_id()

    # 2. Duplicate Validation
    existing = service.get_worker(final_worker_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Worker ID '{final_worker_id}' is already registered. Please choose another ID or auto-generate.",
        )

    os.makedirs("data/worker_faces", exist_ok=True)
    os.makedirs("data/embeddings", exist_ok=True)

    photo_path = None
    embedding_path = None
    quality_warning = None

    # 3. Process Photo & Biometric Embedding
    if photo:
        content = await photo.read()
        np_arr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is not a valid image.",
            )

        # Run Industrial Image Quality & Anti-Spoofing Diagnostics
        q_result = quality_checker.evaluate_image(img, is_registration=True)
        if not q_result.is_valid:
            issue_str = " | ".join(q_result.issues)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Photo quality check failed: {issue_str}",
            )

        if q_result.warning:
            quality_warning = q_result.warning

        # Save photo
        photo_filename = f"{final_worker_id}.jpg"
        save_path = os.path.join("data", "worker_faces", photo_filename)
        cv2.imwrite(save_path, img)
        photo_path = save_path.replace("\\", "/")

        # Compute 256-D deep appearance/face embedding
        try:
            extractor = FeatureExtractor(model_path="ml/weights/yolov8n-cls.pt", device="cpu")
            embedding = extractor.extract_embedding(img)
            if embedding is not None:
                emb_file = os.path.join("data", "embeddings", f"{final_worker_id}.npy")
                np.save(emb_file, embedding)
                embedding_path = emb_file.replace("\\", "/")

                meta_file = os.path.join("data", "embeddings", f"{final_worker_id}.json")
                with open(meta_file, "w", encoding="utf-8") as mf:
                    json.dump({
                        "worker_id": final_worker_id,
                        "worker_name": worker_name,
                        "allocated_manager": allocated_manager,
                        "department": department,
                        "role": role,
                    }, mf, indent=2)
        except Exception as e:
            print(f"[WorkerRouter] Warning: Embedding extraction failed: {e}")

    # 4. Save Worker Record in DB
    worker = service.register_worker(
        worker_id=final_worker_id,
        worker_name=worker_name,
        allocated_manager=allocated_manager,
        department=department,
        role=role,
        photo_path=photo_path,
        embedding_path=embedding_path,
    )

    # 5. Reload live gallery so webcam/CCTV recognizes worker immediately
    _sync_live_gallery()

    return {
        "message": f"Worker {worker.worker_name} ({worker.worker_id}) registered successfully.",
        "worker": worker.to_dict(),
        "has_biometric_embedding": embedding_path is not None,
        "quality_warning": quality_warning,
    }


@router.put("/{worker_id}")
async def update_worker(
    worker_id: str,
    worker_name: Optional[str] = Form(None),
    allocated_manager: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    role: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    """Updates an existing worker profile and optionally replaces photo/biometric embeddings."""
    if manager.role not in ("ADMIN", "SAFETY_MANAGER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only Administrator accounts can edit workers.",
        )

    service = AttendanceService(db_session=db)
    worker = service.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Worker '{worker_id}' not found.")

    photo_path = None
    embedding_path = None

    if photo:
        content = await photo.read()
        np_arr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")

        q_result = quality_checker.evaluate_image(img, is_registration=True)
        if not q_result.is_valid:
            issue_str = " | ".join(q_result.issues)
            raise HTTPException(status_code=400, detail=f"Photo quality check failed: {issue_str}")

        photo_filename = f"{worker_id}.jpg"
        save_path = os.path.join("data", "worker_faces", photo_filename)
        cv2.imwrite(save_path, img)
        photo_path = save_path.replace("\\", "/")

        try:
            extractor = FeatureExtractor(model_path="ml/weights/yolov8n-cls.pt", device="cpu")
            embedding = extractor.extract_embedding(img)
            if embedding is not None:
                emb_file = os.path.join("data", "embeddings", f"{worker_id}.npy")
                np.save(emb_file, embedding)
                embedding_path = emb_file.replace("\\", "/")

                meta_file = os.path.join("data", "embeddings", f"{worker_id}.json")
                with open(meta_file, "w", encoding="utf-8") as mf:
                    json.dump({
                        "worker_id": worker_id,
                        "worker_name": worker_name or worker.worker_name,
                        "allocated_manager": allocated_manager or worker.allocated_manager,
                        "department": department or worker.department,
                        "role": role or worker.role,
                    }, mf, indent=2)
        except Exception as e:
            print(f"[WorkerRouter] Warning: Embedding extraction failed: {e}")

    updated = service.update_worker(
        worker_id=worker_id,
        worker_name=worker_name,
        allocated_manager=allocated_manager,
        department=department,
        role=role,
        photo_path=photo_path,
        embedding_path=embedding_path,
    )

    _sync_live_gallery()

    return {
        "message": f"Worker '{worker_id}' updated successfully.",
        "worker": updated.to_dict() if updated else None,
    }


@router.delete("/{worker_id}")
def delete_worker(
    worker_id: str,
    db: Session = Depends(get_db),
    manager: Manager = Depends(get_current_manager),
):
    """Removes a worker record and associated biometric embedding files."""
    if manager.role not in ("ADMIN", "SAFETY_MANAGER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only Administrator accounts can remove workers.",
        )

    service = AttendanceService(db_session=db)
    worker = service.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Worker '{worker_id}' not found.")

    # Remove photo file
    photo_file = os.path.join("data", "worker_faces", f"{worker_id}.jpg")
    if os.path.exists(photo_file):
        try:
            os.remove(photo_file)
        except Exception:
            pass

    # Remove embedding files
    emb_file = os.path.join("data", "embeddings", f"{worker_id}.npy")
    meta_file = os.path.join("data", "embeddings", f"{worker_id}.json")
    for f in (emb_file, meta_file):
        if os.path.exists(f):
            try:
                os.remove(f)
            except Exception:
                pass

    service.delete_worker(worker_id)
    _sync_live_gallery()

    return {"message": f"Worker '{worker_id}' ({worker.worker_name}) was successfully removed."}


def _sync_live_gallery():
    """Syncs in-memory galleries across active pipelines."""
    try:
        from backend.api.cctv import stream_manager, webcam_manager
        if stream_manager.pipeline and stream_manager.pipeline.identifier:
            stream_manager.pipeline.identifier.load_enrolled_workers()
        if webcam_manager.pipeline and webcam_manager.pipeline.identifier:
            webcam_manager.pipeline.identifier.load_enrolled_workers()
    except Exception as e:
        pass
