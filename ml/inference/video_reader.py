"""
Video Ingestion Module
Handles video streams from webcams, recorded video files, and RTSP CCTV endpoints.
"""

import os
from typing import Generator, Optional, Tuple, Union
import cv2
import numpy as np


class VideoReader:
    """
    Robust video capture stream wrapper supporting webcam indices,
    file paths, and RTSP stream URLs.
    """

    def __init__(
        self,
        source: Union[int, str] = 0,
        target_width: Optional[int] = None,
        target_height: Optional[int] = None,
        loop: bool = False,
    ):
        """
        Initialize the video reader.

        Args:
            source: Integer webcam index (e.g. 0), path to video file, or RTSP URL.
            target_width: Optional resize target width in pixels.
            target_height: Optional resize target height in pixels.
            loop: Whether to loop video files upon reaching EOF.
        """
        self.raw_source = source
        self.target_width = target_width
        self.target_height = target_height
        self.loop = loop

        # Parse source (convert numeric strings like "0" to integer for cv2)
        self.source = self._parse_source(source)
        self.is_live = isinstance(self.source, int) or str(self.source).lower().startswith("rtsp://")

        self.cap: Optional[cv2.VideoCapture] = None
        self.frame_count: int = 0
        self._open_capture()

    def _parse_source(self, source: Union[int, str]) -> Union[int, str]:
        if isinstance(source, str) and source.isdigit():
            return int(source)
        return source

    def _open_capture(self) -> None:
        if isinstance(self.source, str) and not self.source.lower().startswith("rtsp://") and not self.source.lower().startswith("http://"):
            if not os.path.exists(self.source):
                raise FileNotFoundError(f"Video file does not exist at path: {self.source}")

        self.cap = cv2.VideoCapture(self.source)
        if not self.cap.isOpened():
            raise RuntimeError(f"Failed to open video source: {self.raw_source}")

        # Query native properties
        self._fps = self.cap.get(cv2.CAP_PROP_FPS)
        if self._fps <= 0 or np.isnan(self._fps):
            self._fps = 30.0  # Fallback reasonable default

        self._width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT)) if not self.is_live else -1

    @property
    def fps(self) -> float:
        return self._fps

    @property
    def width(self) -> int:
        return self.target_width if self.target_width else self._width

    @property
    def height(self) -> int:
        return self.target_height if self.target_height else self._height

    @property
    def total_frames(self) -> int:
        return self._total_frames

    @property
    def is_opened(self) -> bool:
        return self.cap is not None and self.cap.isOpened()

    def read_frame(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Read a single frame from the video source.
        Returns:
            Tuple of (success, frame).
        """
        if not self.is_opened:
            return False, None

        ret, frame = self.cap.read()
        if not ret:
            if self.loop and not self.is_live:
                # Rewind to beginning
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = self.cap.read()
                if not ret:
                    return False, None
            else:
                return False, None

        self.frame_count += 1

        # Optional frame resize
        if self.target_width and self.target_height:
            frame = cv2.resize(frame, (self.target_width, self.target_height), interpolation=cv2.INTER_LINEAR)

        return True, frame

    def stream_frames(self) -> Generator[Tuple[int, np.ndarray], None, None]:
        """
        Yields (frame_index, frame) until video stream completes or is stopped.
        """
        while self.is_opened:
            ret, frame = self.read_frame()
            if not ret or frame is None:
                break
            yield self.frame_count, frame

    def release(self) -> None:
        """Release underlying OpenCV capture resource."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
