"""
Attendance Router — manual override, records query, WebSocket trigger endpoint
"""

import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from middleware.rbac import get_current_user, require_faculty_or_above
from models.attendance import AttendanceRecord, AttendanceStatus
from models.user import User, UserRole
from schemas.attendance import AttendanceOut, AttendanceOverrideRequest
from websocket.manager import ws_manager

router = APIRouter()


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
    elif user_id:
        stmt = stmt.where(AttendanceRecord.user_id == user_id)

    if date_from:
        stmt = stmt.where(AttendanceRecord.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(AttendanceRecord.timestamp <= datetime.combine(date_to, datetime.max.time()))
    if status:
        stmt = stmt.where(AttendanceRecord.status == status)

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    records = result.scalars().all()
    return [_build_attendance_out(r) for r in records]


# ── Get single record ─────────────────────────────────────────────────────────
@router.get("/{record_id}", response_model=AttendanceOut)
async def get_attendance_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
