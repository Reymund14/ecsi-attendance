"""
Face Service — AI Biometrics Pipeline
Uses DeepFace with ArcFace model for 512-dim embedding extraction.
Cosine distance threshold: <= 0.40 → MATCH (positive identity).
"""

import io
import logging
from typing import TYPE_CHECKING, List, Optional, Tuple

if TYPE_CHECKING:  # numpy only needed for type hints
    import numpy as np

logger = logging.getLogger("ecsi.face")

# OpenCV, NumPy and DeepFace are imported lazily. The cloud deployment (Render)
# serves the dashboard / auth / CRUD paths only and does NOT install the ~1GB
# computer-vision stack, so these must not be required at import time.
_CV = None
_NP = None
_DEEPFACE = None
_DEEPFACE_IMPORT_FAILED = False


def _cv():
    """Import cv2 on first use. Raises RuntimeError with an actionable message."""
    global _CV
    if _CV is None:
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError(
                "OpenCV is not installed. Face enrollment/verification is unavailable. "
                "Install the CV extras: pip install -r requirements.txt"
            ) from exc
        _CV = cv2
    return _CV


def _np():
    """Import numpy on first use. Raises RuntimeError with an actionable message."""
    global _NP
    if _NP is None:
        try:
            import numpy
        except ImportError as exc:
            raise RuntimeError(
                "NumPy is not installed. Face enrollment/verification is unavailable. "
                "Install the CV extras: pip install -r requirements.txt"
            ) from exc
        _NP = numpy
    return _NP


def _deepface():
    """
    Import DeepFace on first use. Returns None when unavailable so callers can
    degrade gracefully instead of crashing.
    """
    global _DEEPFACE, _DEEPFACE_IMPORT_FAILED
    if _DEEPFACE is None and not _DEEPFACE_IMPORT_FAILED:
        try:
            from deepface import DeepFace
            _DEEPFACE = DeepFace
        except ImportError:
            _DEEPFACE_IMPORT_FAILED = True
            logger.warning(
                "DeepFace not installed — face verification will be unavailable. "
                "Install the CV extras: pip install -r requirements.txt"
            )
    return _DEEPFACE


def face_pipeline_available() -> bool:
    """True when the full biometric pipeline can run on this host."""
    return _deepface() is not None


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
    def _bytes_to_bgr(image_bytes: bytes) -> "np.ndarray":
        cv2, np = _cv(), _np()
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image bytes. Ensure the file is a valid JPEG/PNG.")
        return img

    # ── Internal: extract embedding from BGR image ────────────────────────────
    def _extract_embedding(self, bgr_image: "np.ndarray") -> "np.ndarray":
        DeepFace = _deepface()
        cv2, np = _cv(), _np()
        if DeepFace is None:
            raise RuntimeError("DeepFace is not installed. Run: pip install -r requirements.txt")

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

        np = _np()
        embeddings: List["np.ndarray"] = []
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
        np = _np()
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
    def crop_face(self, bgr_image: "np.ndarray") -> Optional["np.ndarray"]:
        """Return the cropped face region or None if no face found."""
        try:
            DeepFace = _deepface()
            if DeepFace is None:
                return None
            cv2 = _cv()
            rgb = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
            faces = DeepFace.extract_faces(
                img_path=rgb,
                detector_backend=self.detector_backend,
                enforce_detection=True,
            )
            if not faces:
                return None
            face_data = max(faces, key=lambda f: f["facial_area"]["w"])
            fa = face_data["facial_area"]
            x, y, w, h = fa["x"], fa["y"], fa["w"], fa["h"]
            return bgr_image[max(0, y):y + h, max(0, x):x + w]
        except Exception:
            return None
