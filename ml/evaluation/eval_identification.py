"""
Worker Identification Evaluation & Accuracy Measurement Module
Measures empirical Top-1 accuracy, Top-k accuracy, and UNKNOWN rejection rates on holdout datasets.

CRITICAL ARCHITECTURAL RULE:
No accuracy claim is made unless evaluated on actual labeled test/validation splits.
"""

import argparse
import os
import sys
from typing import Dict, List, Tuple
import cv2
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from ml.inference.identifier import WorkerIdentifier


def evaluate_identification(
    eval_dataset_dir: str = "data/eval_workers",
    embeddings_dir: str = "data/embeddings",
    model_path: str = "ml/weights/yolov8n-cls.pt",
    threshold: float = 0.60,
) -> Dict[str, any]:
    """
    Evaluates identification accuracy against a ground-truth directory structure:
    data/eval_workers/
      ├── EMP-01/
      │   ├── test1.jpg
      │   └── test2.jpg
      ├── EMP-02/
      │   └── test1.jpg
      └── UNKNOWN/
          └── stranger1.jpg
    """
    if not os.path.exists(eval_dataset_dir) or not os.listdir(eval_dataset_dir):
        print("\n" + "=" * 60)
        print("[EVALUATION NOTICE - WORKER IDENTIFICATION]")
        print(f"Evaluation directory '{eval_dataset_dir}' is empty or not yet populated.")
        print("To measure verifiable identification accuracy:")
        print(f"  1. Create class folders in '{eval_dataset_dir}/<worker_id>/' with test images.")
        print(f"  2. (Optional) Add an 'UNKNOWN' folder for unregistered test persons.")
        print(f"  3. Re-run this evaluation script.")
        print("\nPolicy: No identification accuracy is claimed without ground-truth evaluation.")
        print("=" * 60 + "\n")
        return {}

    identifier = WorkerIdentifier(
        model_path=model_path,
        embeddings_dir=embeddings_dir,
        confidence_threshold=threshold,
        device="cpu",
    )

    total_samples = 0
    correct_top1 = 0
    false_acceptances = 0
    false_rejections = 0
    unknown_samples = 0
    correct_unknown_rejections = 0

    print(f"\n[Evaluation] Benchmarking identification on dataset: {eval_dataset_dir}")
    print(f"[Evaluation] Registered Gallery size: {len(identifier.gallery)} enrolled worker(s)")
    print(f"[Evaluation] Operating threshold: {threshold:.2f}")

    for ground_truth_id in os.listdir(eval_dataset_dir):
        class_folder = os.path.join(eval_dataset_dir, ground_truth_id)
        if not os.path.isdir(class_folder):
            continue

        for fname in os.listdir(class_folder):
            if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                continue

            img_path = os.path.join(class_folder, fname)
            img = cv2.imread(img_path)
            if img is None:
                continue

            total_samples += 1
            pred_id, pred_name, conf = identifier.identify_crop(img)

            is_ground_truth_unknown = (ground_truth_id.upper() == "UNKNOWN")

            if is_ground_truth_unknown:
                unknown_samples += 1
                if pred_id is None:
                    correct_unknown_rejections += 1
                else:
                    false_acceptances += 1
            else:
                if pred_id == ground_truth_id:
                    correct_top1 += 1
                elif pred_id is None:
                    false_rejections += 1
                else:
                    # Misidentified as another registered worker
                    pass

    known_samples = total_samples - unknown_samples
    top1_accuracy = (correct_top1 / known_samples * 100.0) if known_samples > 0 else 0.0
    unknown_rejection_rate = (correct_unknown_rejections / unknown_samples * 100.0) if unknown_samples > 0 else 0.0

    metrics = {
        "total_test_samples": total_samples,
        "enrolled_test_samples": known_samples,
        "unregistered_test_samples": unknown_samples,
        "top1_accuracy_pct": round(top1_accuracy, 2),
        "unknown_rejection_rate_pct": round(unknown_rejection_rate, 2),
        "false_rejections": false_rejections,
        "false_acceptances": false_acceptances,
    }

    print("\n" + "=" * 60)
    print("MEASURED IDENTIFICATION BENCHMARK RESULTS:")
    print(f"  Total Test Samples:            {metrics['total_test_samples']}")
    print(f"  Enrolled Samples Evaluated:    {metrics['enrolled_test_samples']}")
    print(f"  Top-1 Accuracy:                {metrics['top1_accuracy_pct']}%")
    print(f"  False Rejection Count:         {metrics['false_rejections']}")
    if unknown_samples > 0:
        print(f"  Unregistered Impostor Samples: {metrics['unregistered_test_samples']}")
        print(f"  Impostor Rejection Rate:       {metrics['unknown_rejection_rate_pct']}%")
        print(f"  False Acceptance Count:        {metrics['false_acceptances']}")
    print("=" * 60 + "\n")

    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate worker identification accuracy.")
    parser.add_argument("--data", type=str, default="data/eval_workers", help="Path to evaluation dataset.")
    parser.add_argument("--threshold", type=float, default=0.60, help="Confidence threshold.")
    args = parser.parse_args()

    evaluate_identification(eval_dataset_dir=args.data, threshold=args.threshold)
