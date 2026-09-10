"""
Attendance Service — Core dual-factor verification pipeline.

This is the brain of the system:
  1. RFID UID arrives → look up student in DB
  2. Grab live camera frame
  3. Run AI face comparison (cosine distance)
  4. Write AttendanceRecord (Verified / ProxyAnomalies)
  5. Broadcast WebSocket event to dashboard
"""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

import cv2
import numpy as np

from config import settings
from database import AsyncSessionLocal
from models.attendance import AttendanceRecord, AttendanceStatus, CheckType, ProxyAuditLog
from models.user import RFIDCard, FaceEmbedding, User
from schemas.attendance import WSAttendanceEvent, WSAlertEvent
from services.camera_service import camera_service
from services.face_service import FaceService
from websocket.manager import ws_manager

from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger("ecsi.attendance")
face_service = FaceService()


class AttendanceService:
    """
    Processes a single RFID tap event through the dual-factor pipeline.
    Designed to be called as an async coroutine from the RFID service callback.
    """

    async def process_tap(self, card_uid: str, terminal_id: str = "TERMINAL-01") -> None:
        """
        Full dual-factor attendance workflow triggered by an RFID tap.
        """
        logger.info("Processing tap  uid=%s  terminal=%s", card_uid, terminal_id)

        async with AsyncSessionLocal() as db:
            # ── Step 1: Resolve RFID → User ────────────────────────────────
            rfid_result = await db.execute(
                select(RFIDCard)
                .options(
                    selectinload(RFIDCard.user).selectinload(User.face_embedding)
                )
                .where(RFIDCard.card_uid == card_uid.upper(), RFIDCard.is_active == True)  # noqa: E712
            )
            rfid_card = rfid_result.scalar_one_or_none()

            if not rfid_card:
                logger.warning("Unknown or inactive RFID UID: %s", card_uid)
                await ws_manager.broadcast_admin_faculty({
                    "event": "unknown_card",
                    "card_uid": card_uid,
                    "terminal_id": terminal_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                return

            user: User = rfid_card.user

            # ── Step 2: Capture live camera frame ─────────────────────────
            frame_bytes = camera_service.capture_frame()
            raw_frame = camera_service.capture_raw_frame()

            if frame_bytes is None:
                logger.error("Camera unavailable — recording as PENDING_REVIEW.")
                await self._save_record(
                    db, user, card_uid, terminal_id,
                    status=AttendanceStatus.PENDING_REVIEW,
                    cosine_distance=None,
                    captured_path=None,
                    raw_frame=None,
                )
                return

            # ── Step 3: AI Face Verification ──────────────────────────────
            face_embedding = user.face_embedding

            if face_embedding is None:
                logger.warning("User %s has no face embedding — marking PENDING_REVIEW.", user.id_number)
                await self._save_record(
                    db, user, card_uid, terminal_id,
                    status=AttendanceStatus.PENDING_REVIEW,
                    cosine_distance=None,
                    captured_path=None,
                    raw_frame=None,
                )
                return

            is_match, cosine_distance = await face_service.verify(
                live_frame_bytes=frame_bytes,
                stored_embedding=face_embedding.embedding_vector,
            )

            # ── Step 4: Save captured frame ────────────────────────────────
            captured_path = self._save_frame(
                raw_frame=raw_frame,
                user_id=str(user.id),
                is_proxy=not is_match,
            )

            # ── Step 5a: MATCH — Verified attendance ───────────────────────
            if is_match:
                record = await self._save_record(
                    db, user, card_uid, terminal_id,
                    status=AttendanceStatus.VERIFIED,
                    cosine_distance=cosine_distance,
                    captured_path=captured_path,
                    raw_frame=raw_frame,
                )
                await self._broadcast_verified(user, record, cosine_distance)

            # ── Step 5b: MISMATCH — Proxy attempt ─────────────────────────
            else:
                record = await self._save_record(
                    db, user, card_uid, terminal_id,
                    status=AttendanceStatus.PROXY_ANOMALY,
                    cosine_distance=cosine_distance,
                    captured_path=captured_path,
                    raw_frame=raw_frame,
                )

                # Save intruder crop to audit directory
                intruder_path = self._save_intruder_crop(raw_frame, record.id)

                # Write proxy audit log
                proxy_log = ProxyAuditLog(
                    attendance_record_id=record.id,
                    intruder_image_path=intruder_path,
                    cosine_distance=cosine_distance,
                    card_uid=card_uid,
                    registered_user_id=user.id,
                    terminal_id=terminal_id,
                )
                db.add(proxy_log)
                await db.flush()

                await self._broadcast_proxy_alert(user, record, cosine_distance, intruder_path)

            await db.commit()

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _save_record(
        self, db, user: User, card_uid: str, terminal_id: str,
        status: AttendanceStatus, cosine_distance, captured_path, raw_frame
    ) -> AttendanceRecord:
        record = AttendanceRecord(
            user_id=user.id,
            card_uid_used=card_uid,
            status=status,
            check_type=CheckType.TIME_IN,
            cosine_distance=cosine_distance,
            terminal_id=terminal_id,
            captured_frame_path=captured_path,
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        return record

    def _save_frame(self, raw_frame: np.ndarray, user_id: str, is_proxy: bool) -> str | None:
        if raw_frame is None:
            return None
        try:
            subdir = "proxy" if is_proxy else "verified"
            target_dir = os.path.join(settings.AUDIT_CAPTURE_DIR, subdir)
            os.makedirs(target_dir, exist_ok=True)
            filename = f"{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.jpg"
            path = os.path.join(target_dir, filename)
            cv2.imwrite(path, raw_frame)
            return path
        except Exception as exc:
            logger.error("Failed to save frame: %s", exc)
            return None

    def _save_intruder_crop(self, raw_frame: np.ndarray, record_id: uuid.UUID) -> str | None:
        if raw_frame is None:
            return None
        try:
            crop = face_service.crop_face(raw_frame)
            target = crop if crop is not None else raw_frame
            target_dir = os.path.join(settings.AUDIT_CAPTURE_DIR, "intruders")
            os.makedirs(target_dir, exist_ok=True)
            filename = f"intruder_{record_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.jpg"
            path = os.path.join(target_dir, filename)
            cv2.imwrite(path, target)
            return path
        except Exception as exc:
            logger.error("Failed to save intruder crop: %s", exc)
            return None

    async def _broadcast_verified(self, user: User, record: AttendanceRecord, dist: float):
        event = WSAttendanceEvent(
            record_id=str(record.id),
            user_id=str(user.id),
            full_name=user.full_name,
            id_number=user.id_number,
            profile_photo_path=user.profile_photo_path,
            status=AttendanceStatus.VERIFIED,
            check_type=record.check_type,
            cosine_distance=dist,
            terminal_id=record.terminal_id,
            captured_frame_path=record.captured_frame_path,
            timestamp=record.timestamp.isoformat(),
        )
        await ws_manager.broadcast_admin_faculty(event.model_dump())

    async def _broadcast_proxy_alert(
        self, user: User, record: AttendanceRecord, dist: float, intruder_path: str | None
    ):
        # Send full event
        event = WSAttendanceEvent(
            record_id=str(record.id),
            user_id=str(user.id),
            full_name=user.full_name,
            id_number=user.id_number,
            profile_photo_path=user.profile_photo_path,
            status=AttendanceStatus.PROXY_ANOMALY,
            check_type=record.check_type,
            cosine_distance=dist,
            terminal_id=record.terminal_id,
            captured_frame_path=record.captured_frame_path,
            timestamp=record.timestamp.isoformat(),
            intruder_image_path=intruder_path,
        )
        await ws_manager.broadcast_admin_faculty(event.model_dump())

        # Also broadcast a dedicated high-priority alert
        alert = WSAlertEvent(
            message=f"PROXY ATTEMPT DETECTED — Card UID {record.card_uid_used} used by unrecognised individual.",
            card_uid=record.card_uid_used,
            registered_user_name=user.full_name,
            cosine_distance=dist,
            intruder_image_path=intruder_path,
            terminal_id=record.terminal_id,
            detected_at=record.timestamp.isoformat(),
        )
        await ws_manager.broadcast_admin_only(alert.model_dump())


# Global singleton
attendance_service = AttendanceService()
