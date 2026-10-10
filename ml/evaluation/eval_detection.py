"""
Evaluation & Accuracy Measurement Module for Worker Detection
Calculates verifiable, empirical performance metrics on a ground-truth dataset.

IMPORTANT ARCHITECTURAL RULE:
Never claim an accuracy value unless it has been calculated on a real holdout validation/test dataset.
"""

import argparse
import os
import sys
from typing import Dict
from ultralytics import YOLO


def evaluate_detector(
    weights_path: str = "ml/weights/yolov8n.pt",
    dataset_yaml: str = "ml/datasets/worker_detection_eval.yaml",
    device: str = "auto",
) -> Dict[str, float]:
    """
    Evaluate detector on a labeled test split and return measured metrics.

    Args:
        weights_path: Path to model weights (.pt).
        dataset_yaml: Path to dataset YAML configuration containing val/test paths.
        device: Device to use for inference ('cpu', 'cuda', 'xpu', or 'auto').

    Returns:
        Dictionary of measured metrics: mAP50, mAP50-95, Precision, Recall.
    """
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Model weights not found: {weights_path}")

    if not os.path.exists(dataset_yaml):
        print(f"\n[EVALUATION NOTICE]")
        print(f"Dataset configuration '{dataset_yaml}' does not exist yet.")
        print(f"To measure real accuracy:")
        print(f"  1. Place labeled images in ml/datasets/ in YOLO format.")
        print(f"  2. Create a dataset YAML pointing to the test/val split.")
        print(f"  3. Re-run this evaluation script.")
        print(f"\nNo accuracy or precision/recall claims are made without an evaluated ground-truth dataset.")
        return {}

    print(f"[Evaluation] Loading model from {weights_path}...")
    model = YOLO(weights_path)

    print(f"[Evaluation] Running validation benchmark on {dataset_yaml}...")
    metrics = model.val(
        data=dataset_yaml,
        split="test",
        device=device,
        verbose=True,
    )

    results = {
        "mAP50": float(metrics.box.map50),
        "mAP50_95": float(metrics.box.map),
        "precision": float(metrics.box.mp),
        "recall": float(metrics.box.mr),
    }

    print("\n" + "=" * 50)
    print("MEASURED DETECTION BENCHMARK RESULTS:")
    print(f"  Precision:       {results['precision']:.4f}")
    print(f"  Recall:          {results['recall']:.4f}")
    print(f"  mAP@0.5:         {results['mAP50']:.4f}")
    print(f"  mAP@0.5:0.95:    {results['mAP50_95']:.4f}")
    print("=" * 50)

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate worker detector on ground truth dataset.")
    parser.add_argument("--weights", type=str, default="ml/weights/yolov8n.pt", help="Path to weights file.")
    parser.add_argument("--data", type=str, default="ml/datasets/worker_detection_eval.yaml", help="Path to dataset YAML.")
    parser.add_argument("--device", type=str, default="auto", help="Inference device.")
    args = parser.parse_args()

    evaluate_detector(args.weights, args.data, args.device)
