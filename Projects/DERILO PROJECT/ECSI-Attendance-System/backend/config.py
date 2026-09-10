"""
ECSI Multi-Modal Attendance System
Configuration & Environment Settings
"""

from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # ── Application ──────────────────────────────────────────────
    APP_NAME: str = "ECSI Attendance System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "CHANGE_THIS_IN_PRODUCTION_USE_256_BIT_RANDOM_KEY"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # ── Database ─────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://ecsi_user:ecsi_pass@localhost:5432/ecsi_attendance"

    # ── CORS ─────────────────────────────────────────────────────
    # Add your Vercel URL and Cloudflare Tunnel URL here, or set
    # ALLOWED_ORIGINS=["https://your-app.vercel.app","https://your-tunnel.com"] in .env
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    # ── Camera ───────────────────────────────────────────────────
    CAMERA_SOURCE: str = "0"          # "0" = USB cam index, or "rtsp://..." for IP cam
    CAMERA_WIDTH: int = 1920
    CAMERA_HEIGHT: int = 1080
    CAMERA_FPS: int = 30
    CAPTURE_FRAMES_COUNT: int = 5     # frames captured per enrollment session

    # ── AI / Biometrics ──────────────────────────────────────────
    FACE_MODEL: str = "ArcFace"       # "ArcFace" | "Facenet512" | "DeepFace"
    FACE_DETECTOR: str = "mtcnn"      # "mtcnn" | "retinaface" | "opencv"
    COSINE_DISTANCE_THRESHOLD: float = 0.40   # <= 0.40 → MATCH
    EMBEDDING_DIMENSIONS: int = 512

    # ── RFID ─────────────────────────────────────────────────────
    RFID_PORT: str = "/dev/ttyUSB0"   # Serial port for UART readers; ignored for USB-HID
    RFID_BAUDRATE: int = 9600
    RFID_MODE: str = "USB_HID"        # "USB_HID" | "SERIAL" | "SPI_RC522"

    # ── Audit / Storage ──────────────────────────────────────────
    AUDIT_CAPTURE_DIR: str = os.path.join(os.path.dirname(__file__), "audit_captures")
    MAX_AUDIT_IMAGES_PER_DAY: int = 500

    # ── WebSocket ────────────────────────────────────────────────
    WS_HEARTBEAT_INTERVAL: int = 30   # seconds

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
