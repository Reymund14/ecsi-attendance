"""
Admin Router — system settings, proxy audit logs, export, terminal management
"""

import csv
import io
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from middleware.rbac import require_faculty_or_above, require_super_admin
from models.attendance import AttendanceRecord, ProxyAuditLog, AttendanceStatus
from models.user import User
from schemas.attendance import ProxyAuditOut

router = APIRouter()


# ── Proxy Audit Logs ──────────────────────────────────────────────────────────
@router.get(
    "/proxy-logs",
    response_model=List[ProxyAuditOut],
    dependencies=[Depends(require_faculty_or_above)],
)
async def list_proxy_logs(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ProxyAuditLog)
        .options(selectinload(ProxyAuditLog.registered_user))
        .order_by(ProxyAuditLog.detected_at.desc())
    )
    if date_from:
        stmt = stmt.where(ProxyAuditLog.detected_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(ProxyAuditLog.detected_at <= datetime.combine(date_to, datetime.max.time()))

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    out = []
    for log in logs:
        obj = ProxyAuditOut.model_validate(log)
        if log.registered_user:
            obj.registered_user_name = log.registered_user.full_name
        out.append(obj)
    return out


# ── Export attendance CSV ─────────────────────────────────────────────────────
@router.get("/export/attendance", dependencies=[Depends(require_faculty_or_above)])
async def export_attendance_csv(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.user))
        .order_by(AttendanceRecord.timestamp)
    )
    if date_from:
        stmt = stmt.where(AttendanceRecord.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(AttendanceRecord.timestamp <= datetime.combine(date_to, datetime.max.time()))

    result = await db.execute(stmt)
    records = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Record ID", "ID Number", "Full Name", "Status",
        "Check Type", "Cosine Distance", "Terminal", "Timestamp"
    ])
    for r in records:
        writer.writerow([
            str(r.id),
            r.user.id_number if r.user else "",
            r.user.full_name if r.user else "",
            r.status.value,
            r.check_type.value,
            f"{r.cosine_distance:.4f}" if r.cosine_distance is not None else "",
            r.terminal_id or "",
            r.timestamp.isoformat(),
        ])

    output.seek(0)
    filename = f"attendance_export_{date.today().isoformat()}.csv"
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Analytics dashboard stats ─────────────────────────────────────────────────
@router.get("/analytics/overview", dependencies=[Depends(require_faculty_or_above)])
async def analytics_overview(db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())

    # Today's status breakdown
    status_result = await db.execute(
        select(AttendanceRecord.status, func.count(AttendanceRecord.id).label("count"))
        .where(AttendanceRecord.timestamp.between(start, end))
        .group_by(AttendanceRecord.status)
    )
    status_counts = {row.status.value: row.count for row in status_result.all()}

    # Total enrolled users
    user_count = await db.execute(select(func.count(User.id)))
    total_users = user_count.scalar()

    # Total proxy attempts all time
    proxy_count = await db.execute(select(func.count(ProxyAuditLog.id)))
    total_proxies = proxy_count.scalar()

    return {
        "today_verified": status_counts.get("verified", 0),
        "today_proxy_anomaly": status_counts.get("proxy_anomaly", 0),
        "today_manual_override": status_counts.get("manual_override", 0),
        "today_total": sum(status_counts.values()),
        "total_users": total_users,
        "total_proxy_attempts_all_time": total_proxies,
    }


# ── Reset / Delete proxy log (super admin) ────────────────────────────────────
@router.delete("/proxy-logs/{log_id}", status_code=204, dependencies=[Depends(require_super_admin)])
async def delete_proxy_log(log_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProxyAuditLog).where(ProxyAuditLog.id == log_id))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Proxy log not found.")
    await db.delete(log)
