"""
ECSI Multi-Modal Attendance System — FastAPI Application Entry Point
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from jose import JWTError

from config import settings
from database import init_db
from utils.security import decode_token
from websocket.manager import ws_manager

# ── Routers ───────────────────────────────────────────────────────────────────
from routers import auth, users, enrollment, attendance, admin, notifications, excuses, evaluations
from services import storage
from services.face_service import face_pipeline_available

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("ecsi")

# Storage directories must exist *before* StaticFiles mounts them.
# StaticFiles(check_dir=True) raises at import time on a missing directory, which
# would crash a fresh cloud deploy (the dirs only appeared via lifespan startup).
os.makedirs(settings.AUDIT_CAPTURE_DIR, exist_ok=True)
os.makedirs(settings.PROFILE_PHOTO_DIR, exist_ok=True)


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ECSI Attendance System v%s", settings.APP_VERSION)
    logger.info("Environment: %s", settings.ENVIRONMENT)

    # Ensure DB tables exist
    await init_db()

    # Create storage buckets up front so the first upload cannot fail on a
    # missing bucket. Safe to call on every boot (idempotent).
    try:
        created = await storage.ensure_buckets()
        if created:
            logger.info("Created storage buckets: %s", ", ".join(created))
    except Exception:
        # Never block startup on object storage: the DB and API are still useful,
        # and a missing bucket will surface as a 400 on the upload itself.
        logger.exception("Could not verify storage buckets — uploads may fail")

    # Start WS heartbeat background task
    heartbeat_task = asyncio.create_task(
        ws_manager.heartbeat_loop(settings.WS_HEARTBEAT_INTERVAL)
    )

    logger.info("Startup complete — listening for events. Storage backend: %s",
                settings.storage_backend)
    yield

    heartbeat_task.cancel()
    with suppress(asyncio.CancelledError):
        await heartbeat_task
    await storage.aclose()
    logger.info("Shutdown complete.")


# ── Application ───────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# allow_origin_regex lets Vercel preview deployments (random subdomains) through
# without listing every one of them in ALLOWED_ORIGINS.
_cors_kwargs = dict(
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
if settings.CORS_ORIGIN_REGEX:
    _cors_kwargs["allow_origin_regex"] = settings.CORS_ORIGIN_REGEX
    logger.info("CORS origin regex enabled: %s", settings.CORS_ORIGIN_REGEX)

app.add_middleware(CORSMiddleware, **_cors_kwargs)

# ── Trusted hosts (Render sets RENDER_EXTERNAL_URL) ──────────────────────────
# TrustedHostMiddleware compares against the Host header, which has no scheme or
# trailing slash, while RENDER_EXTERNAL_URL arrives as "https://service.onrender.com".
# Passing the raw URL would reject every request, so reduce it to bare hostnames.
_trusted_hosts = []
for _raw in (os.getenv("RENDER_EXTERNAL_URL", ""), *settings.ALLOWED_ORIGINS):
    _host = urlparse(_raw).hostname or ""
    _host = _host.strip().lower()
    if _host and _host not in _trusted_hosts:
        _trusted_hosts.append(_host)
if _trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=_trusted_hosts)
    logger.info("TrustedHost middleware enabled for %s", _trusted_hosts)

# ── Static files (profile photos, audit captures served to frontend) ──────────
# routers/users.py stores uploads as "/static/profiles/<user_id>.jpg" and
# records "/static/audit/..." paths, so both mounts must line up with the dirs
# those routes write into.
app.mount("/static/audit", StaticFiles(directory=settings.AUDIT_CAPTURE_DIR), name="audit")
app.mount(
    "/static/profiles",
    StaticFiles(directory=settings.PROFILE_PHOTO_DIR),
    name="profiles",
)

# ── API Routers ───────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth.router,       prefix=f"{API_PREFIX}/auth",       tags=["Auth"])
app.include_router(users.router,      prefix=f"{API_PREFIX}/users",      tags=["Users"])
app.include_router(enrollment.router, prefix=f"{API_PREFIX}/enrollment", tags=["Enrollment"])
app.include_router(attendance.router, prefix=f"{API_PREFIX}/attendance", tags=["Attendance"])
app.include_router(admin.router,      prefix=f"{API_PREFIX}/admin",      tags=["Admin"])
app.include_router(notifications.router, prefix=f"{API_PREFIX}/notifications", tags=["Notifications"])
app.include_router(excuses.router,      prefix=f"{API_PREFIX}/excuses",      tags=["Excuses"])
app.include_router(evaluations.router,  prefix=f"{API_PREFIX}/evaluations",  tags=["Evaluations"])


# ── WebSocket Endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    """
    Authenticated WebSocket for live dashboard feed.
    Client must send: { "token": "<jwt>" } as first message after connect.
    """
    await websocket.accept()

    # Expect auth handshake within 10 seconds
    try:
        data = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
        token = data.get("token", "")
        payload = decode_token(token)
        role = payload.get("role", "student")
    except (JWTError, asyncio.TimeoutError, Exception) as exc:
        await websocket.send_json({"event": "auth_error", "detail": str(exc)})
        await websocket.close(code=4001)
        return

    # Re-register now that we know the role (avoids double-accept)
    async with ws_manager._lock:
        bucket = ws_manager._connections.setdefault(role, [])
        bucket.append(websocket)

    await websocket.send_json({"event": "connected", "role": role})
    logger.info("WS authenticated  role=%s", role)

    try:
        while True:
            # Keep-alive: discard any incoming client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, role)


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    """Liveness probe — does not touch the database."""
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/health/ready", tags=["System"])
async def health_ready():
    """Readiness probe — verifies the database connection actually works."""
    from sqlalchemy import text

    from database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("Readiness check failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Database unreachable: {exc}")

    return {
        "status": "ready",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "database": "connected",
        "storage": settings.storage_backend,
        "face_pipeline_available": face_pipeline_available(),
    }
