"""
Attendance Router — manual override, records query, WebSocket trigger endpoint
"""

import logging
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from database import get_db
from middleware.rbac import get_current_user, require_faculty_or_above, require_super_admin
from models.attendance import AttendanceRecord, AttendanceStatus, CheckType, ProxyAuditLog
from models.user import RFIDCard, User, UserRole
from schemas.attendance import AttendanceOut, AttendanceOverrideRequest, CaptureAccessOut
from services import storage
from services.face_service import FaceService, face_pipeline_available
from websocket.manager import ws_manager

router = APIRouter()
face_service = FaceService()
logger = logging.getLogger("ecsi.attendance.router")


@router.post("/verify-face/{user_id}")
async def verify_live_face(
    user_id: uuid.UUID,
    frame: UploadFile = File(...),
    card_uid: str = Form(..., min_length=4, max_length=64),
    check_type: CheckType = Form(CheckType.TIME_IN),
    terminal_id: str = Form("Terminal-1", max_length=64),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_faculty_or_above),
):
    """Verify a live camera frame against the user's enrolled biometric template."""
    user_id = str(user_id)
    result = await db.execute(
        select(User)
        .options(selectinload(User.face_embedding))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if current_user.role == UserRole.FACULTY and user.section != current_user.section:
        raise HTTPException(status_code=403, detail="You cannot record attendance for this student.")
    card_result = await db.execute(
        select(RFIDCard).where(
            RFIDCard.user_id == user.id,
            RFIDCard.card_uid == card_uid,
            RFIDCard.is_active.is_(True),
        )
    )
    card = card_result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=409, detail="This RFID card is not assigned to this user.")
    if not user.face_embedding:
        raise HTTPException(status_code=409, detail="No face template is enrolled for this user.")
    if user.face_embedding.model_name != face_service.model_name or len(user.face_embedding.embedding_vector) != face_service.embedding_dimensions:
        raise HTTPException(
            status_code=409,
            detail="This user's face template uses the old ArcFace model. Re-enroll their face for SFace.",
        )
    if not face_pipeline_available():
        raise HTTPException(status_code=503, detail="Face verification is unavailable on this server.")

    frame_bytes = await frame.read()
    if storage.sniff_image(frame_bytes) is None:
        raise HTTPException(status_code=400, detail="The camera frame is not a valid image.")
    try:
        matched, distance = await face_service.verify(
            live_frame_bytes=frame_bytes,
            stored_embedding=user.face_embedding.embedding_vector,
        )
    except Exception as exc:
        logger.exception("Face verification failed for %s", user.id_number)
        raise HTTPException(status_code=503, detail="Face verification failed; attendance was not recorded.") from exc
    status = AttendanceStatus.VERIFIED if matched else AttendanceStatus.PROXY_ANOMALY
    record = AttendanceRecord(
        user_id=user.id,
        user=user,
        card_uid_used=card.card_uid,
        status=status,
        check_type=check_type,
        cosine_distance=distance,
        terminal_id=terminal_id,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    if not matched:
        db.add(ProxyAuditLog(
            attendance_record_id=record.id,
            cosine_distance=distance,
            card_uid=card.card_uid,
            registered_user_id=user.id,
            terminal_id=terminal_id,
        ))
        await db.flush()

    await db.commit()
    event = {
        "event": "attendance_update",
        "record_id": str(record.id),
        "user_id": str(user.id),
        "full_name": user.full_name,
        "id_number": user.id_number,
        "profile_photo_path": user.profile_photo_path,
        "status": status.value,
        "check_type": check_type.value,
        "cosine_distance": distance,
        "terminal_id": terminal_id,
        "captured_frame_path": None,
        "timestamp": record.timestamp.isoformat(),
    }
    await ws_manager.broadcast_admin_faculty(event)
    if not matched:
        await ws_manager.broadcast_admin_only({
            "event": "proxy_alert",
            "message": f"Proxy attempt detected for {user.full_name}.",
            "card_uid": card.card_uid,
            "registered_user_name": user.full_name,
            "cosine_distance": distance,
            "intruder_image_path": None,
            "terminal_id": terminal_id,
            "detected_at": record.timestamp.isoformat(),
        })

    return {
        "matched": matched,
        "cosine_distance": distance,
        "record": _build_attendance_out(record),
    }


def _build_attendance_out(record: AttendanceRecord) -> AttendanceOut:
    out = AttendanceOut.model_validate(record)
    if record.user:
        out.full_name = record.user.full_name
        out.id_number = record.user.id_number
        out.profile_photo_path = record.user.profile_photo_path
    return out


# ── List records ──────────────────────────────────────────────────────────────
@router.get("/", response_model=List[AttendanceOut])
async def list_attendance(
    user_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[AttendanceStatus] = None,
    exclude_seeded: bool = Query(False, description="Exclude placeholder attendance rows created by seed.py."),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.user))
        .order_by(AttendanceRecord.timestamp.desc())
    )

    # Students see only their own records
    if current_user.role == UserRole.STUDENT:
        stmt = stmt.where(AttendanceRecord.user_id == current_user.id)
    elif current_user.role == UserRole.FACULTY:
        # A faculty member only sees students assigned to their advisory section.
        if current_user.section:
            stmt = stmt.join(AttendanceRecord.user).where(
                User.role == UserRole.STUDENT,
                User.section == current_user.section,
            )
        else:
            stmt = stmt.where(AttendanceRecord.user_id == "")
    elif user_id:
        stmt = stmt.where(AttendanceRecord.user_id == user_id)

    if date_from:
        stmt = stmt.where(AttendanceRecord.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(AttendanceRecord.timestamp <= datetime.combine(date_to, datetime.max.time()))
    if status:
        stmt = stmt.where(AttendanceRecord.status == status)
    if exclude_seeded:
        # seed.py stores placeholder captures as verified/YYYY-MM-DD_ID_ORDINAL.jpg.
        # Real capture keys use a UUID and timestamp; live browser verification
        # currently stores no capture path. Keep seeded rows in history/reports,
        # but let live feeds omit them without deleting database data.
        seed_capture_pattern = "verified/____-__-__%"
        stmt = stmt.where(or_(
            AttendanceRecord.captured_frame_path.is_(None),
            ~AttendanceRecord.captured_frame_path.like(seed_capture_pattern),
        ))

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    records = result.scalars().all()
    return [_build_attendance_out(r) for r in records]


# ── Get single record ─────────────────────────────────────────────────────────
# ── Private capture access (super admin only) ────────────────────────────────
# Audit captures live in a PRIVATE bucket, so the stored KEY is useless on its
# own: these endpoints mint a short-lived signed URL. Super-admin only, because
# proxy/intruder images are sensitive.
@router.get("/{record_id}/capture", response_model=CaptureAccessOut,
            dependencies=[Depends(require_super_admin)])
async def get_record_capture(record_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    record_id = str(record_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    record = await db.get(AttendanceRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found.")
    if not record.captured_frame_path:
        raise HTTPException(status_code=404, detail="No capture stored for this record.")

    url = await storage.capture_signed_url(record.captured_frame_path)
    if not url:
        raise HTTPException(status_code=410, detail="Stored capture is no longer available.")

    return CaptureAccessOut(
        record_id=record.id,
        kind="captured",
        key=record.captured_frame_path,
        url=url,
        expires_in=settings.SIGNED_URL_TTL_SECONDS,
    )


@router.get("/{record_id}/intruder", response_model=CaptureAccessOut,
            dependencies=[Depends(require_super_admin)])
async def get_record_intruder(record_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    record_id = str(record_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    record = await db.get(AttendanceRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found.")

    result = await db.execute(
        select(ProxyAuditLog).where(ProxyAuditLog.attendance_record_id == record_id)
    )
    log = result.scalar_one_or_none()
    if not log or not log.intruder_image_path:
        raise HTTPException(status_code=404, detail="No intruder image for this record.")

    url = await storage.capture_signed_url(log.intruder_image_path)
    if not url:
        raise HTTPException(status_code=410, detail="Stored intruder image is no longer available.")

    return CaptureAccessOut(
        record_id=record.id,
        kind="intruder",
        key=log.intruder_image_path,
        url=url,
        expires_in=settings.SIGNED_URL_TTL_SECONDS,
    )


@router.get("/{record_id}", response_model=AttendanceOut)
async def get_attendance_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record_id = str(record_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    result = await db.execute(
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.user))
        .where(AttendanceRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found.")

    # Students may only view their own records
    if current_user.role == UserRole.STUDENT and record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return _build_attendance_out(record)


# ── Manual override (faculty + admin) ────────────────────────────────────────
@router.patch(
    "/{record_id}/override",
    response_model=AttendanceOut,
    dependencies=[Depends(require_faculty_or_above)],
)
async def override_attendance(
    record_id: uuid.UUID,
    body: AttendanceOverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record_id = str(record_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    result = await db.execute(
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.user))
        .where(AttendanceRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found.")

    record.status = body.status
    record.override_by = current_user.id
    record.override_note = body.note

    await db.flush()
    await db.refresh(record)

    # Notify dashboard
    await ws_manager.broadcast_admin_faculty({
        "event": "attendance_override",
        "record_id": str(record.id),
        "new_status": body.status.value,
        "override_by": current_user.full_name,
        "note": body.note,
    })

    return _build_attendance_out(record)


# ── Summary stats (admin / faculty) ──────────────────────────────────────────
@router.get("/summary/today", dependencies=[Depends(require_faculty_or_above)])
async def today_summary(db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())

    from sqlalchemy import func

    result = await db.execute(
        select(
            AttendanceRecord.status,
            func.count(AttendanceRecord.id).label("count"),
        )
        .where(and_(AttendanceRecord.timestamp >= start, AttendanceRecord.timestamp <= end))
        .group_by(AttendanceRecord.status)
    )
    rows = result.all()

    summary = {s.value: 0 for s in AttendanceStatus}
    for row in rows:
        summary[row.status.value] = row.count
    summary["total"] = sum(summary.values())
    return summary


# ── Parent summary ───────────────────────────────────────────────────────────
@router.get("/parent-summary")
async def parent_attendance_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.PARENT:
        raise HTTPException(status_code=403, detail="Only parent accounts can access this summary.")

    child_ids = current_user.children or []
    if not child_ids:
        return {"children": []}

    stmt = (
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.user))
        .where(AttendanceRecord.user_id.in_(child_ids))
        .order_by(AttendanceRecord.timestamp.desc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    by_child = {}
    for record in records:
        by_child.setdefault(record.user_id, []).append({
            "id": str(record.id),
            "full_name": record.user.full_name if record.user else "",
            "id_number": record.user.id_number if record.user else "",
            "status": record.status.value,
            "check_type": record.check_type.value,
            "cosine_distance": record.cosine_distance,
            "terminal_id": record.terminal_id,
            "timestamp": record.timestamp.isoformat(),
        })

    return {"children": [{"child_id": child_id, "records": by_child.get(child_id, [])} for child_id in child_ids if child_id in by_child]}
