"""
ECSI Multi-Modal Attendance System
Configuration & Environment Settings
"""

import json
import os
from typing import List, Union

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Placeholder shipped in config.py — never acceptable in production.
INSECURE_SECRET_KEY = "CHANGE_THIS_IN_PRODUCTION_USE_256_BIT_RANDOM_KEY"

# Markers left behind by backend/.env.production, which still ships the
# template. A credential containing one of these was never filled in, and
# sending it to Supabase produces a 400/403 that reads like a code bug.
_PLACEHOLDER_MARKERS = ("CHANGE_ME", "YOUR-PROJECT-REF", "paste_the")


def _is_placeholder(value: str) -> bool:
    """True when a credential is still the untouched template value."""
    return any(marker in value for marker in _PLACEHOLDER_MARKERS)


class Settings(BaseSettings):
    # ── Application ──────────────────────────────────────────────
    APP_NAME: str = "ECSI Attendance System"
    APP_VERSION: str = "1.0.0"
    # "development" relaxes security checks. Set to "production" on Render.
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    SECRET_KEY: str = INSECURE_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # ── Database ─────────────────────────────────────────────────
    # Local dev default is SQLite; production uses Supabase PostgreSQL.
    # Use the TRANSACTION pooler (port 5432, URI mode, password URL-encoded):
    #   postgresql+asyncpg://postgres.<ref>:<url-encoded-pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
    # Optionally append ?prepared_statement_cache_size=0
    DATABASE_URL: str = "sqlite+aiosqlite:///./ecsi_dev.db"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_TIMEOUT: int = 30

    # ── CORS ─────────────────────────────────────────────────────
    # Must be JSON, e.g. ["https://my-app.vercel.app"] — a comma-separated
    # list is also accepted for convenience.
    # The str arm of the Union is deliberate: pydantic-settings only tolerates
    # non-JSON values for complex Union fields, which lets _split_origins below
    # accept CSV from an environment variable.
    ALLOWED_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]
    # Optional regex for wildcard hosts, e.g. https://my-app-.*\.vercel\.app
    # Needed because every Vercel preview deployment gets a random subdomain.
    CORS_ORIGIN_REGEX: str = ""

    # ── Public URLs (informational / used by docker-compose) ─────
    PUBLIC_URL: str = ""
    PUBLIC_WS_URL: str = ""

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
    PROFILE_PHOTO_DIR: str = os.path.join(os.path.dirname(__file__), "static", "profiles")
    MAX_AUDIT_IMAGES_PER_DAY: int = 500

    # ── Object storage (Supabase Storage) ────────────────────────
    # Leave STORAGE_BACKEND="auto" and both Supabase vars unset to keep using the
    # local filesystem (development). Production refuses to start unless Supabase
    # credentials are present, because the local filesystem is ephemeral on Render.
    #
    # STORAGE_BACKEND: "auto" | "local" | "supabase"
    STORAGE_BACKEND: str = "auto"
    SUPABASE_URL: str = ""
    # Server-side only. The service-role key bypasses RLS: NEVER expose it via a
    # VITE_* variable or it will be readable in the browser bundle.
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_BUCKET_PHOTOS: str = "profile-photos"
    SUPABASE_BUCKET_CAPTURES: str = "audit-captures"
    SIGNED_URL_TTL_SECONDS: int = 300
    # Create missing buckets on startup (needs the service-role key).
    STORAGE_AUTO_CREATE_BUCKETS: bool = True

    # ── WebSocket ────────────────────────────────────────────────
    WS_HEARTBEAT_INTERVAL: int = 30   # seconds

    model_config = SettingsConfigDict(
        # Precedence: real environment variables > .env.local > .env.
        # .env.local is gitignored, so it is the safe place for a real
        # SUPABASE_SERVICE_ROLE_KEY during development.
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Validators ────────────────────────────────────────────────────────────
    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value):
        """Accept a JSON array, or a plain comma-separated string."""
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    return value
            return [origin.strip() for origin in raw.split(",") if origin.strip()]
        return value

    @field_validator("ENVIRONMENT")
    @classmethod
    def _normalise_environment(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("STORAGE_BACKEND")
    @classmethod
    def _normalise_storage_backend(cls, value):
        v = value.strip().lower()
        if v not in ("auto", "local", "supabase"):
            raise ValueError("STORAGE_BACKEND must be one of: auto, local, supabase")
        return v

    @field_validator("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", mode="before")
    @classmethod
    def _clean_credential(cls, value):
        """
        Tidy a credential pasted out of the Supabase dashboard.

        A trailing newline is easy to pick up while copying a key, and httpx
        then refuses to send the request at all ("Illegal header value"), so
        the failure never reaches Supabase. Wrapping quotes also survive a copy
        from some shells, turning a valid key into a 403. Strip both.
        """
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in "\"'":
            cleaned = cleaned[1:-1].strip()
        return cleaned

    @model_validator(mode="after")
    def _require_usable_supabase_credentials(self):
        """
        Refuse to start when the Supabase backend is selected without usable
        credentials.

        This runs in EVERY environment, not just production. Previously the
        check lived inside the production-only guard, so in development a
        missing key surfaced much later as a 400 from Supabase's storage API
        ("headers must have required property 'authorization'") — which reads
        like a bug in the request rather than a missing environment variable.
        """
        if self.storage_backend != "supabase":
            return self

        problems = []
        for name, value in (
            ("SUPABASE_URL", self.SUPABASE_URL),
            ("SUPABASE_SERVICE_ROLE_KEY", self.SUPABASE_SERVICE_ROLE_KEY),
        ):
            if not value:
                problems.append(f"{name} is empty")
            elif _is_placeholder(value):
                problems.append(f"{name} still holds the template placeholder")
        if problems:
            raise ValueError(
                f"STORAGE_BACKEND resolved to 'supabase' but {' and '.join(problems)}. "
                "Set them as environment variables — Render -> Environment, your shell, or "
                "backend/.env.local (gitignored) — using Supabase -> Project Settings -> API. "
                "Never hardcode the service_role key: it bypasses RLS."
            )
        return self


    @model_validator(mode="after")
    def _reject_insecure_production_settings(self):
        if self.ENVIRONMENT != "production":
            return self
        if self.SECRET_KEY == INSECURE_SECRET_KEY or len(self.SECRET_KEY) < 32:
            raise ValueError(
                "SECRET_KEY must be set to a unique value of at least 32 characters when "
                "ENVIRONMENT=production. Generate one with: "
                'python -c "import secrets; print(secrets.token_hex(32))"'
            )
        if self.DATABASE_URL.startswith("sqlite"):
            raise ValueError(
                "DATABASE_URL must point at PostgreSQL (Supabase) when ENVIRONMENT=production."
            )
        # The local filesystem is ephemeral on Render, so profile photos and audit
        # captures would silently vanish on every redeploy.
        if self.storage_backend == "local":
            raise ValueError(
                "STORAGE_BACKEND resolved to 'local', but ENVIRONMENT=production requires "
                "durable object storage. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
                "(Supabase -> Project Settings -> API), or set STORAGE_BACKEND=supabase "
                "if you have attached a persistent disk."
            )
        # An explicit STORAGE_BACKEND=supabase with unusable credentials is
        # rejected by _require_usable_supabase_credentials above, which also
        # covers development.
        return self

    @property
    def storage_backend(self) -> str:
        """Resolved backend name: 'supabase' or 'local'."""
        if self.STORAGE_BACKEND != "auto":
            return self.STORAGE_BACKEND
        if self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY:
            return "supabase"
        return "local"


settings = Settings()