"""
Face Service — AI Biometrics Pipeline
Uses DeepFace with ArcFace model for 512-dim embedding extraction.
Cosine distance threshold: <= 0.40 → MATCH (positive identity).
"""

import io
import logging
from typing import List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("ecsi.face")

# DeepFace import is lazy to allow the app to start even if GPU is not available
try:
    from deepface import DeepFace
    _DEEPFACE_AVAILABLE = True
except ImportError:
    _DEEPFACE_AVAILABLE = False
    logger.warning("DeepFace not installed — face verification will be unavailable.")


class FaceService:
    """
    Wraps the DeepFace / ArcFace pipeline for:
      1. Enrollment: generate a mean 512-dim embedding from N frames.
      2. Verification: compare a live frame embedding against a stored vector.
    """

    def __init__(self, model_name: str = "ArcFace", detector_backend: str = "mtcnn"):
        self.model_name = model_name
        self.detector_backend = detector_backend
        self._threshold = 0.40  # Cosine distance threshold

    # ── Internal: bytes → BGR numpy array ────────────────────────────────────
    @staticmethod
    def _bytes_to_bgr(image_bytes: bytes) -> np.ndarray:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image bytes. Ensure the file is a valid JPEG/PNG.")
        return img

    # ── Internal: extract embedding from BGR image ────────────────────────────
    def _extract_embedding(self, bgr_image: np.ndarray) -> np.ndarray:
        if not _DEEPFACE_AVAILABLE:
            raise RuntimeError("DeepFace is not installed. Run: pip install deepface")

        # DeepFace.represent expects RGB
        rgb = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
        representations = DeepFace.represent(
            img_path=rgb,
            model_name=self.model_name,
            detector_backend=self.detector_backend,
            enforce_detection=True,
            align=True,
        )
        if not representations:
            raise ValueError("No face detected in the provided image.")

        # Use the most prominent face (largest facial area)
        best = max(representations, key=lambda r: r.get("facial_area", {}).get("w", 0))
        return np.array(best["embedding"], dtype=np.float32)

    # ── Enrollment: mean embedding from multiple frames ───────────────────────
    async def generate_enrollment_embedding(
        self, frame_bytes_list: List[bytes]
    ) -> List[float]:
        """
        Processes N image frames and returns their normalised mean embedding
        as a Python list of 512 floats, ready for PostgreSQL FLOAT[] storage.
        """
        if not frame_bytes_list:
            raise ValueError("At least one frame is required for enrollment.")

        embeddings: List[np.ndarray] = []
        errors: List[str] = []

        for idx, frame_bytes in enumerate(frame_bytes_list):
            try:
                bgr = self._bytes_to_bgr(frame_bytes)
                emb = self._extract_embedding(bgr)
                embeddings.append(emb)
            except Exception as exc:
                errors.append(f"Frame {idx + 1}: {exc}")
                logger.warning("Enrollment frame %d failed: %s", idx + 1, exc)

        if not embeddings:
            raise ValueError(
                f"No valid faces detected in any provided frame. Errors: {'; '.join(errors)}"
            )

        mean_vec = np.mean(np.stack(embeddings, axis=0), axis=0)
        # L2-normalise the mean vector for cosine distance stability
        norm = np.linalg.norm(mean_vec)
        if norm > 0:
            mean_vec = mean_vec / norm

        return mean_vec.tolist()

    # ── Verification: cosine distance between live frame and stored vector ────
    async def verify(
        self,
        live_frame_bytes: bytes,
        stored_embedding: List[float],
    ) -> Tuple[bool, float]:
        """
        Returns (is_match: bool, cosine_distance: float).
        cosine_distance <= threshold → MATCH.
        """
        bgr = self._bytes_to_bgr(live_frame_bytes)

        try:
            live_emb = self._extract_embedding(bgr)
        except ValueError as e:
            logger.info("Verification: no face detected — %s", e)
            # If no face is found, treat as mismatch with max distance
            return False, 1.0

        stored = np.array(stored_embedding, dtype=np.float32)

        # L2-normalise both
        live_norm = np.linalg.norm(live_emb)
        stored_norm = np.linalg.norm(stored)

        if live_norm > 0:
            live_emb = live_emb / live_norm
        if stored_norm > 0:
            stored = stored / stored_norm

        # Cosine similarity → distance
        cosine_similarity = float(np.dot(live_emb, stored))
        cosine_distance = 1.0 - cosine_similarity

        is_match = cosine_distance <= self._threshold
        logger.info(
            "Verification  cosine_dist=%.4f  threshold=%.2f  match=%s",
            cosine_distance, self._threshold, is_match,
        )
        return is_match, round(cosine_distance, 6)

    # ── Utility: crop face ROI from frame ─────────────────────────────────────
    def crop_face(self, bgr_image: np.ndarray) -> Optional[np.ndarray]:
        """Return the cropped face region or None if no face found."""
        try:
            if not _DEEPFACE_AVAILABLE:
                return None
            rgb = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
            faces = DeepFace.extract_faces(
                img_path=rgb,
                detector_backend=self.detector_backend,
                enforce_detection=True,
            )
            if not faces:
                return None
            face_data = max(faces, key=lambda f: f.get("facial_area", {}).get("w", 0))
            fa = face_data["facial_area"]
            x, y, w, h = fa["x"], fa["y"], fa["w"], fa["h"]
            return bgr_image[max(0, y):y + h, max(0, x):x + w]
        except Exception:
            return None
