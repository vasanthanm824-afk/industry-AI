#!/usr/bin/env python3
"""
CLI Execution Script for Industrial Worker Safety Vision Pipeline (Step 1)

Usage Examples:
  # Run on default webcam:
  python scripts/run_pipeline.py --source 0

  # Run on a recorded video file:
  python scripts/run_pipeline.py --source data/sample_videos/test_cctv.mp4

  # Run headless and save output video:
  python scripts/run_pipeline.py --source data/sample_videos/test_cctv.mp4 --no-display --save output/result.mp4

  # Run with custom detection threshold:
  python scripts/run_pipeline.py --source 0 --conf 0.45
"""

import argparse
import os
import sys

# Ensure repository root is in Python module search path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml.inference.pipeline import SafetyVisionPipeline


def parse_args():
    parser = argparse.ArgumentParser(
        description="Industrial Worker Safety Monitoring - Step 1 Detection & ByteTrack Pipeline"
    )
    parser.add_argument(
        "--config",
        type=str,
        default="ml/configs/pipeline_config.yaml",
        help="Path to pipeline configuration YAML file.",
    )
    parser.add_argument(
        "--source",
        type=str,
        default=None,
        help="Video source: webcam index (e.g. 0), path to video file, or RTSP stream URL.",
    )
    parser.add_argument(
        "--weights",
        type=str,
        default=None,
        help="Path to YOLO weights (.pt file). Defaults to value in config.",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=None,
        help="Detection confidence threshold (0.0 to 1.0).",
    )
    parser.add_argument(
        "--save",
        type=str,
        default=None,
        help="Path to save output video (e.g. output/result.mp4).",
    )
    parser.add_argument(
        "--no-display",
        action="store_true",
        help="Disable GUI display window (recommended for headless or background execution).",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        choices=["auto", "cpu", "cuda", "xpu"],
        help="Inference device: 'cpu', 'cuda', 'xpu', or 'auto'.",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    show_display = not args.no_display
    save_video = args.save is not None

    print("\n" + "=" * 60)
    print("AI INDUSTRIAL WORKER SAFETY & MONITORING SYSTEM - STEP 1")
    print("=" * 60)

    try:
        pipeline = SafetyVisionPipeline(
            config_path=args.config,
            source=args.source,
            model_path=args.weights,
            conf_thresh=args.conf,
            save_video=save_video,
            output_path=args.save,
            show_display=show_display,
            device=args.device,
        )

        pipeline.run()

    except FileNotFoundError as fnf_err:
        print(f"\n[ERROR] File not found: {fnf_err}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[Pipeline] Interrupted by user.")
    except Exception as exc:
        print(f"\n[CRITICAL ERROR] Pipeline terminated with error: {exc}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
