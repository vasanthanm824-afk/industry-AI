"""
AEGIS AI — Reproducible Model Training Pipeline for PPE Compliance Detection
Fine-tunes YOLOv8 on industrial worker safety and PPE dataset splits.
Saves checkpoints, records empirical validation metrics, and updates model registry metadata.
"""

import argparse
import json
import os
import sys
from typing import Dict, Any
from ultralytics import YOLO


def train_ppe_model(
    data_config: str = "ml/datasets/ppe_compliance_dataset.yaml",
    base_weights: str = "ml/weights/yolov8n.pt",
    output_weights: str = "ml/weights/yolov8n-ppe-v2.1.pt",
    epochs: int = 25,
    batch_size: int = 16,
    imgsz: int = 640,
    device: str = "cpu",
) -> Dict[str, Any]:
    """
    Train / fine-tune YOLOv8 model on custom PPE detection dataset.
    """
    print("=" * 60)
    print("AEGIS AI — INDUSTRIAL SAFETY CV MODEL TRAINING PIPELINE")
    print("=" * 60)
    print(f"Data Configuration: {data_config}")
    print(f"Base Checkpoint:   {base_weights}")
    print(f"Target Checkpoint: {output_weights}")
    print(f"Epochs: {epochs} | Batch Size: {batch_size} | Image Size: {imgsz} | Device: {device}")

    if not os.path.exists(base_weights):
        print(f"Base weights not found at {base_weights}. Downloading baseline YOLOv8n...")

    # Load model
    model = YOLO(base_weights)

    if not os.path.exists(data_config):
        print(f"\n[NOTICE] Dataset configuration '{data_config}' not present.")
        print("To run full fine-tuning on a labeled custom dataset:")
        print("  1. Prepare dataset in YOLO format under data/ppe_dataset/")
        print("  2. Ensure train/val/test image directories contain valid annotations.")
        print("  3. Execute: python ml/training/train_ppe.py --epochs 25")
        return {}

    print("\nStarting YOLO fine-tuning with data augmentations...")
    results = model.train(
        data=data_config,
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        device=device,
        save=True,
        plots=True,
        verbose=True,
    )

    # Validate trained checkpoint on held-out test split
    print("\nRunning post-training benchmark on validation split...")
    metrics = model.val()

    mAP50 = float(metrics.box.map50)
    mAP50_95 = float(metrics.box.map)
    precision = float(metrics.box.mp)
    recall = float(metrics.box.mr)
    f1 = 2 * (precision * recall) / (precision + recall + 1e-6)

    eval_summary = {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "mAP50": round(mAP50, 4),
        "mAP50_95": round(mAP50_95, 4),
    }

    print("\n" + "=" * 50)
    print("FINAL POST-TRAINING BENCHMARK RESULTS:")
    print(f"  Precision:    {eval_summary['precision']}")
    print(f"  Recall:       {eval_summary['recall']}")
    print(f"  F1 Score:     {eval_summary['f1_score']}")
    print(f"  mAP@0.5:      {eval_summary['mAP50']}")
    print(f"  mAP@0.5:0.95: {eval_summary['mAP50_95']}")
    print("=" * 50)

    # Save trained checkpoint to target path
    os.makedirs(os.path.dirname(output_weights), exist_ok=True)
    model.save(output_weights)
    print(f"[Training] Saved fine-tuned checkpoint to: {output_weights}")

    # Update model registry
    registry_path = "ml/weights/models_registry.json"
    if os.path.exists(registry_path):
        try:
            with open(registry_path, "r") as f:
                reg = json.load(f)
            reg["active_model"] = os.path.basename(output_weights)
            with open(registry_path, "w") as f:
                json.dump(reg, f, indent=2)
            print(f"[Training] Updated active model in {registry_path}")
        except Exception as e:
            print(f"Warning updating registry: {e}")

    return eval_summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train custom PPE compliance YOLO detector.")
    parser.add_argument("--data", type=str, default="ml/datasets/ppe_compliance_dataset.yaml")
    parser.add_argument("--weights", type=str, default="ml/weights/yolov8n.pt")
    parser.add_argument("--output", type=str, default="ml/weights/yolov8n-ppe-v2.1.pt")
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", type=str, default="cpu")
    args = parser.parse_args()

    train_ppe_model(
        data_config=args.data,
        base_weights=args.weights,
        output_weights=args.output,
        epochs=args.epochs,
        batch_size=args.batch,
        imgsz=args.imgsz,
        device=args.device,
    )
