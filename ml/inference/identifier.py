"""
Worker Identification & Biometric Matching Module
Extracts reusable appearance/face embeddings, performs cosine-similarity matching against
enrolled worker references, handles UNKNOWN detection, and provides temporal consensus verification.
"""

from collections import defaultdict, deque
import os
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np
import torch
from ultralytics import YOLO


class FeatureExtractor:
    """
    Extracts L2-normalized deep appearance embeddings from worker crops.
    Uses pretrained lightweight CNN backbone (YOLOv8-cls), producing a 256-D vector.
    """

    def __init__(self, model_path: str = "ml/weights/yolov8n-cls.pt", device: str = "cpu"):
        self.model_path = model_path
        self.device = device
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Feature extraction model weights not found at: {self.model_path}")
        self.model = YOLO(self.model_path)

    def extract_embedding(self, crop: np.ndarray) -> Optional[np.ndarray]:
        """
        Extract a normalized 256-dimensional feature embedding from an image crop.
        Returns:
            np.ndarray of shape (256,), or None if crop is invalid.
        """
        if crop is None or crop.size == 0 or crop.shape[0] < 10 or crop.shape[1] < 10:
            return None

        # Preprocess / resize to 224x224 standard classifier dimension
        crop_resized = cv2.resize(crop, (224, 224), interpolation=cv2.INTER_LINEAR)

        try:
            # Ultralytics embed method extracts deep features before classification head
            embeddings = self.model.embed(crop_resized, device=self.device, verbose=False)
            if embeddings is None or len(embeddings) == 0:
                return None

            feat = embeddings[0].cpu().numpy().flatten().astype(np.float32)
            # L2-normalize vector for cosine similarity calculation
            norm = np.linalg.norm(feat)
            if norm > 0:
                feat = feat / norm
            return feat
        except Exception as e:
            print(f"[FeatureExtractor] Extraction error: {e}")
            return None


class WorkerIdentifier:
    """
    Matches candidate worker crops against enrolled worker gallery.
    Flags candidates below confidence threshold as UNKNOWN.
    """

    def __init__(
        self,
        model_path: str = "ml/weights/yolov8n-cls.pt",
        embeddings_dir: str = "data/embeddings",
        confidence_threshold: float = 0.98,
        device: str = "cpu",
    ):
        self.embeddings_dir = embeddings_dir
        self.confidence_threshold = confidence_threshold
        self.extractor = FeatureExtractor(model_path=model_path, device=device)
        self.gallery: Dict[str, Dict[str, any]] = {}
        self.load_enrolled_workers()

    def load_enrolled_workers(self) -> int:
        """
        Load all stored .npy worker embeddings from data/embeddings.
        Returns total count of enrolled workers in memory.
        """
        self.gallery.clear()
        if not os.path.exists(self.embeddings_dir):
            os.makedirs(self.embeddings_dir, exist_ok=True)
            return 0

        # Scan embeddings directory for .npy files
        for fname in os.listdir(self.embeddings_dir):
            if fname.endswith(".npy"):
                worker_id = fname[:-4]
                emb_path = os.path.join(self.embeddings_dir, fname)
                try:
                    emb = np.load(emb_path)
                    norm = np.linalg.norm(emb)
                    if norm > 0:
                        emb = emb / norm

                    # Metadata file (optional)
                    meta_path = os.path.join(self.embeddings_dir, f"{worker_id}.json")
                    worker_name = worker_id
                    if os.path.exists(meta_path):
                        import json
                        with open(meta_path, "r", encoding="utf-8") as f:
                            meta = json.load(f)
                            worker_name = meta.get("worker_name", worker_id)

                    self.gallery[worker_id] = {
                        "worker_id": worker_id,
                        "worker_name": worker_name,
                        "embedding": emb,
                    }
                except Exception as e:
                    print(f"[WorkerIdentifier] Could not load embedding for {worker_id}: {e}")

        print(f"[WorkerIdentifier] Loaded {len(self.gallery)} enrolled worker(s) into gallery.")
        return len(self.gallery)

    def enroll_worker(
        self,
        worker_id: str,
        worker_name: str,
        image_or_crop: np.ndarray,
        save_to_disk: bool = True,
    ) -> bool:
        """
        Compute embedding for a new worker and store in memory (and disk).
        """
        feat = self.extractor.extract_embedding(image_or_crop)
        if feat is None:
            return False

        self.gallery[worker_id] = {
            "worker_id": worker_id,
            "worker_name": worker_name,
            "embedding": feat,
        }

        if save_to_disk:
            os.makedirs(self.embeddings_dir, exist_ok=True)
            emb_path = os.path.join(self.embeddings_dir, f"{worker_id}.npy")
            np.save(emb_path, feat)

            import json
            meta_path = os.path.join(self.embeddings_dir, f"{worker_id}.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({"worker_id": worker_id, "worker_name": worker_name}, f, indent=2)

        return True

    def identify_crop(self, crop: np.ndarray) -> Tuple[Optional[str], str, float]:
        """
        Compare query crop against enrolled worker gallery.

        Returns:
            Tuple of (worker_id or None, worker_name, confidence).
            If confidence < threshold or gallery empty -> (None, 'UNKNOWN', conf).
        """
        if not self.gallery:
            return None, "UNKNOWN", 0.0

        query_emb = self.extractor.extract_embedding(crop)
        if query_emb is None:
            return None, "UNKNOWN", 0.0

        best_id: Optional[str] = None
        best_name: str = "UNKNOWN"
        best_sim: float = -1.0

        for worker_id, data in self.gallery.items():
            stored_emb = data["embedding"]
            # Cosine similarity between L2-normalized vectors
            sim = float(np.dot(query_emb, stored_emb))
            if sim > best_sim:
                best_sim = sim
                best_id = worker_id
                best_name = data["worker_name"]

        # Confidence verification check
        if best_sim >= self.confidence_threshold and best_id is not None:
            return best_id, best_name, best_sim
        else:
            return None, "UNKNOWN", max(0.0, best_sim)


class TemporalConsensusTracker:
    """
    Prevents false-positive attendance and identification flickering.
    Requires consistent identification across N consecutive frames before locking
    the identity to the persistent ByteTrack track ID.
    """

    def __init__(self, required_consensus_frames: int = 5):
        self.required_consensus = required_consensus_frames
        # track_id -> deque of recent (worker_id, confidence)
        self.history: Dict[int, deque] = defaultdict(lambda: deque(maxlen=self.required_consensus))
        # track_id -> locked verified info: {"worker_id": str, "worker_name": str, "conf": float}
        self.locked_identities: Dict[int, Dict[str, any]] = {}

    @property
    def consensus_records(self) -> Dict[int, Dict[str, any]]:
        return self.locked_identities


    def update(
        self,
        track_id: int,
        raw_worker_id: Optional[str],
        raw_worker_name: str,
        confidence: float,
    ) -> Tuple[Optional[str], str, float, bool]:
        """
        Update temporal history for a given track ID.

        Returns:
            Tuple of (verified_worker_id, verified_name, verified_confidence, is_verified).
        """
        # If this track ID has already been conclusively verified and locked:
        if track_id in self.locked_identities:
            locked = self.locked_identities[track_id]
            return locked["worker_id"], locked["worker_name"], locked["confidence"], True

        # Append current frame observation
        self.history[track_id].append((raw_worker_id, raw_worker_name, confidence))

        records = list(self.history[track_id])
        if len(records) < self.required_consensus:
            # Insufficient frames accumulated yet -> keep UNKNOWN status
            return None, "UNKNOWN", confidence, False

        # Count occurrences of identified worker IDs
        valid_votes = [r for r in records if r[0] is not None]
        if len(valid_votes) < self.required_consensus:
            # Not enough valid non-unknown votes in the window
            return None, "UNKNOWN", confidence, False

        # Tally candidate worker IDs
        counts = defaultdict(int)
        conf_sums = defaultdict(float)
        names = {}
        for wid, wname, conf in valid_votes:
            counts[wid] += 1
            conf_sums[wid] += conf
            names[wid] = wname

        best_wid, vote_count = max(counts.items(), key=lambda item: item[1])
        if vote_count >= self.required_consensus:
            avg_conf = conf_sums[best_wid] / vote_count
            verified_info = {
                "worker_id": best_wid,
                "worker_name": names[best_wid],
                "confidence": avg_conf,
            }
            self.locked_identities[track_id] = verified_info
            return best_wid, names[best_wid], avg_conf, True

        return None, "UNKNOWN", confidence, False

    def reset_track(self, track_id: int):
        """Clear memory for lost track."""
        if track_id in self.history:
            del self.history[track_id]
        if track_id in self.locked_identities:
            del self.locked_identities[track_id]
