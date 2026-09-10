"""
Camera Service — OpenCV stream management.
Supports USB webcam (index) and RTSP/IP camera streams.
"""

import asyncio
import logging
import threading
import time
from typing import Optional

import cv2
import numpy as np

from config import settings

logger = logging.getLogger("ecsi.camera")


class CameraService:
    """
    Maintains a background thread that continuously reads frames from the
    camera source. Consumers call `capture_frame()` to get the most recent
    decoded frame as JPEG bytes.
    """

    def __init__(self):
        source = settings.CAMERA_SOURCE
        # Convert numeric string to int for USB cams
        self._source = int(source) if source.isdigit() else source
        self._cap: Optional[cv2.VideoCapture] = None
        self._latest_frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    def start(self) -> None:
        if self._running:
            return
        self._cap = cv2.VideoCapture(self._source)
        if not self._cap.isOpened():
            raise RuntimeError(
                f"Cannot open camera source '{self._source}'. "
                "Check CAMERA_SOURCE in .env."
            )
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings.CAMERA_WIDTH)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.CAMERA_HEIGHT)
        self._cap.set(cv2.CAP_PROP_FPS, settings.CAMERA_FPS)

        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(
            "Camera started  source=%s  resolution=%dx%d  fps=%d",
            self._source, settings.CAMERA_WIDTH, settings.CAMERA_HEIGHT, settings.CAMERA_FPS,
        )

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
        if self._cap:
            self._cap.release()
        logger.info("Camera stopped.")

    # ── Background reader loop ────────────────────────────────────────────────
    def _read_loop(self) -> None:
        while self._running:
            if self._cap and self._cap.isOpened():
                ret, frame = self._cap.read()
                if ret:
                    with self._lock:
                        self._latest_frame = frame
                else:
                    logger.warning("Camera read failure — attempting reconnect in 2s.")
                    time.sleep(2)
                    self._cap.release()
                    self._cap = cv2.VideoCapture(self._source)
            else:
                time.sleep(0.1)

    # ── Public API ────────────────────────────────────────────────────────────
    def capture_frame(self) -> Optional[bytes]:
        """
        Returns the latest camera frame encoded as JPEG bytes,
        or None if no frame is available yet.
        """
        with self._lock:
            frame = self._latest_frame

        if frame is None:
            return None

        success, buffer = cv2.imencode(
            ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90]
        )
        return bytes(buffer) if success else None

    def capture_raw_frame(self) -> Optional[np.ndarray]:
        """Returns the raw BGR numpy array of the latest frame."""
        with self._lock:
            return self._latest_frame.copy() if self._latest_frame is not None else None

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def is_available(self) -> bool:
        return self._running and self._latest_frame is not None


# Global singleton
camera_service = CameraService()
