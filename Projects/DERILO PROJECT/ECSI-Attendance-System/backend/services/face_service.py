"""OpenCV YuNet face detection and SFace face embeddings."""

import logging
from pathlib import Path
from typing import List, Optional, Tuple

from config import settings

logger = logging.getLogger("ecsi.face")

MODEL_DIR = Path(__file__).resolve().parents[1] / "model_weights"
YUNET_MODEL = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_MODEL = MODEL_DIR / "face_recognition_sface_2021dec.onnx"

_CV = None
_NP = None
_DETECTOR = None
_RECOGNIZER = None


def _cv():
    global _CV
    if _CV is None:
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError("OpenCV is required for face detection and recognition.") from exc
        if not hasattr(cv2, "FaceDetectorYN") or not hasattr(cv2, "FaceRecognizerSF"):
            raise RuntimeError("OpenCV 4.5.4 or newer with YuNet and SFace support is required.")
        _CV = cv2
    return _CV


def _np():
    global _NP
    if _NP is None:
        try:
            import numpy
        except ImportError as exc:
            raise RuntimeError("NumPy is required for face embeddings.") from exc
        _NP = numpy
    return _NP


def _load_models():
    global _DETECTOR, _RECOGNIZER
    if _DETECTOR is None or _RECOGNIZER is None:
        cv2 = _cv()
        if not YUNET_MODEL.is_file() or not SFACE_MODEL.is_file():
            raise RuntimeError("YuNet/SFace ONNX model files are missing from backend/model_weights.")
        _DETECTOR = cv2.FaceDetectorYN.create(
            str(YUNET_MODEL), "", (320, 320), 0.7, 0.3, 5000,
            cv2.dnn.DNN_BACKEND_OPENCV, cv2.dnn.DNN_TARGET_CPU,
        )
        _RECOGNIZER = cv2.FaceRecognizerSF.create(
            str(SFACE_MODEL), "", cv2.dnn.DNN_BACKEND_OPENCV, cv2.dnn.DNN_TARGET_CPU,
        )
    return _DETECTOR, _RECOGNIZER


def face_pipeline_available() -> bool:
    """Return whether CPU OpenCV YuNet/SFace and both bundled models are available."""
    if not settings.FACE_PIPELINE_ENABLED or not YUNET_MODEL.is_file() or not SFACE_MODEL.is_file():
        return False
    try:
        cv2 = _cv()
        return hasattr(cv2, "FaceDetectorYN") and hasattr(cv2, "FaceRecognizerSF")
    except RuntimeError:
        return False


class FaceService:
    """Create SFace embeddings at enrollment and compare them during attendance."""

    model_name = "SFace"
    embedding_dimensions = 128

    def __init__(self):
        self._similarity_threshold = settings.FACE_SIMILARITY_THRESHOLD

    @staticmethod
    def _bytes_to_bgr(image_bytes: bytes):
        cv2, np = _cv(), _np()
        image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image bytes. Ensure the file is a valid JPEG/PNG.")
        return image

    @staticmethod
    def _detect_faces(image):
        detector, _ = _load_models()
        detector.setInputSize((image.shape[1], image.shape[0]))
        _, faces = detector.detect(image)
        if faces is None or len(faces) == 0:
            return None
        # YuNet rows contain the box, five landmarks and confidence score.
        return max(faces, key=lambda face: float(face[2] * face[3]))

    def _extract_embedding(self, bgr_image):
        np = _np()
        _, recognizer = _load_models()
        face = self._detect_faces(bgr_image)
        if face is None:
            raise ValueError("No face detected in the provided image.")
        aligned_face = recognizer.alignCrop(bgr_image, face)
        embedding = np.asarray(recognizer.feature(aligned_face), dtype=np.float32).reshape(-1)
        if embedding.size != self.embedding_dimensions:
            raise RuntimeError(f"SFace returned an unexpected {embedding.size}-value embedding.")
        norm = np.linalg.norm(embedding)
        if norm <= 0:
            raise RuntimeError("SFace returned an empty face embedding.")
        return embedding / norm

    async def generate_enrollment_embedding(self, frame_bytes_list: List[bytes]) -> List[float]:
        """Return the normalized mean of SFace embeddings from enrollment frames."""
        if not frame_bytes_list:
            raise ValueError("At least one frame is required for enrollment.")

        np = _np()
        embeddings = []
        errors = []
        for idx, frame_bytes in enumerate(frame_bytes_list):
            try:
                embeddings.append(self._extract_embedding(self._bytes_to_bgr(frame_bytes)))
            except Exception as exc:
                errors.append(f"Frame {idx + 1}: {exc}")
                logger.warning("Enrollment frame %d failed: %s", idx + 1, exc)

        if not embeddings:
            raise ValueError(f"No valid faces detected in any provided frame. Errors: {'; '.join(errors)}")

        mean_embedding = np.mean(np.stack(embeddings, axis=0), axis=0)
        norm = np.linalg.norm(mean_embedding)
        if norm <= 0:
            raise ValueError("Could not create a stable face template from the enrollment frames.")
        return (mean_embedding / norm).tolist()

    async def verify(self, live_frame_bytes: bytes, stored_embedding: List[float]) -> Tuple[bool, float]:
        """Return (match, cosine_distance); uses OpenCV's recommended SFace score cutoff."""
        np = _np()
        stored = np.asarray(stored_embedding, dtype=np.float32).reshape(-1)
        if stored.size != self.embedding_dimensions:
            raise ValueError("This face template uses an older model. Re-enroll this person's face.")
        try:
            live_embedding = self._extract_embedding(self._bytes_to_bgr(live_frame_bytes))
        except ValueError as exc:
            if "No face detected" in str(exc):
                logger.info("Verification rejected: no face detected in camera frame.")
                return False, 1.0
            raise
        stored_norm = np.linalg.norm(stored)
        if stored_norm <= 0:
            raise ValueError("Stored face template is invalid. Re-enroll this person's face.")
        similarity = float(np.dot(live_embedding, stored / stored_norm))
        cosine_distance = 1.0 - similarity
        matched = similarity >= self._similarity_threshold
        logger.info(
            "SFace similarity=%.4f threshold=%.3f match=%s",
            similarity, self._similarity_threshold, matched,
        )
        return matched, round(cosine_distance, 6)

    def crop_face(self, bgr_image):
        """Return the largest YuNet face crop, or None when no face is found."""
        try:
            face = self._detect_faces(bgr_image)
            if face is None:
                return None
            x, y, width, height = (int(value) for value in face[:4])
            x1, y1 = max(0, x), max(0, y)
            x2 = min(bgr_image.shape[1], x + width)
            y2 = min(bgr_image.shape[0], y + height)
            if x2 <= x1 or y2 <= y1:
                return None
            return bgr_image[y1:y2, x1:x2]
        except Exception:
            return None
