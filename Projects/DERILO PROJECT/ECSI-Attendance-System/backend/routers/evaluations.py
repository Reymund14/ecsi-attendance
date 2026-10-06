"""
Evaluations Router — faculty attendance evaluation backed by real DB data.

The Attendance Evaluation page previously derived every number in the browser
from hardcoded assumptions (a fixed 20-school-day divisor and an in-memory
remarks map), so it showed fabricated rates and lost the adviser's work on
reload. Everything here is computed from `attendance_records` /
`excuse_requests` at read time, and remarks are persisted.

Scoping matches the rest of the API: a faculty member is limited to the
students in their advisory section (`users.section`), which is the same
predicate routers/attendance.py and routers/excuses.py already use.
"""

from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import require_faculty_or_above
from models.attendance import AttendanceRecord, AttendanceStatus, CheckType
from models.evaluation import EVALUATION_STANDINGS, AttendanceEvaluation
from models.excuse import ExcuseRequest
from models.user import User, UserRole

router = APIRouter()

# A check-in only counts as present once it has been confirmed. PROXY_ANOMALY
# means someone else's card was used, and PENDING_REVIEW is unconfirmed, so
# neither is attendance.
PRESENT_STATUSES = (AttendanceStatus.VERIFIED, AttendanceStatus.MANUAL_OVERRIDE)

DEFAULT_WINDOW_DAYS = 30


def _resolve_window(date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    """Default to the trailing DEFAULT_WINDOW_DAYS ending today."""
    end = date_to or date.today()
    start = date_from or (end - timedelta(days=DEFAULT_WINDOW_DAYS - 1))
    if start > end:
        raise HTTPException(status_code=400, detail="date_from must not be after date_to.")
    return start, end


def _school_days(start: date, end: date) -> int:
    """
    Weekdays (Mon-Fri) inside the window — the divisor for the attendance rate.

    There is no school-calendar table, so holidays are counted as school days.
    That is deterministic and derived from the requested window rather than
    hardcoded, but a term with holidays will read slightly low.
    """
    days = 0
    cursor = start
    while cursor <= end:
        if cursor.weekday() < 5:
            days += 1
        cursor += timedelta(days=1)
    return days


class StudentEvaluationOut(BaseModel):
    student_id: str
    id_number: str
    full_name: str
    section: Optional[str]
    days_present: int
    school_days: int
    verified: int
    proxy_anomaly: int
    pending_review: int
    excused: int
    rate: int
    standing: Optional[str] = None
    note: Optional[str] = None
    evaluated_at: Optional[datetime] = None


class EvaluationSummaryOut(BaseModel):
    section: Optional[str]
    date_from: date
    date_to: date
    school_days: int
    students: list[StudentEvaluationOut]


class EvaluationOut(BaseModel):
    id: str
    student_id: str
    evaluator_id: str
    period_start: date
    period_end: date
    standing: str
    note: Optional[str]
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class EvaluationUpsert(BaseModel):
    standing: str = Field(..., description="One of EVALUATION_STANDINGS.")
    note: Optional[str] = Field(None, max_length=2000)
    date_from: Optional[date] = None
    date_to: Optional[date] = None


@router.get("/summary", response_model=EvaluationSummaryOut)
async def evaluation_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    section: Optional[str] = Query(None, description="Super admin only: filter by section."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_faculty_or_above),
):
    """Per-student attendance stats plus the adviser's saved evaluation."""
    start, end = _resolve_window(date_from, date_to)

    if current_user.role == UserRole.FACULTY:
        if not current_user.section:
            # Previously this fell through to "every student in the school".
            raise HTTPException(
                status_code=400,
                detail=(
                    "Your account has no advisory section set. Ask an administrator to "
                    "set one on your faculty record."
                ),
            )
        if section and section != current_user.section:
            raise HTTPException(status_code=403, detail="You may only view your own section.")
        target_section = current_user.section
    else:
        target_section = section

    # ── Students in scope ────────────────────────────────────────────────────
    students_stmt = select(User).where(User.role == UserRole.STUDENT)
    if target_section:
        students_stmt = students_stmt.where(User.section == target_section)
    students_stmt = students_stmt.order_by(User.full_name)
    students = (await db.execute(students_stmt)).scalars().all()
    student_ids = [u.id for u in students]

    stats = {
        uid: {
            "days_present": set(),
            "verified": 0,
            "proxy_anomaly": 0,
            "pending_review": 0,
        }
        for uid in student_ids
    }

    if student_ids:
        window_start = datetime.combine(start, time.min)
        window_end = datetime.combine(end, time.max)

        # ── Attendance tallies ───────────────────────────────────────────────
        rows = (
            await db.execute(
                select(
                    AttendanceRecord.user_id,
                    AttendanceRecord.status,
                    AttendanceRecord.check_type,
                    AttendanceRecord.timestamp,
                ).where(
                    AttendanceRecord.user_id.in_(student_ids),
                    AttendanceRecord.timestamp >= window_start,
                    AttendanceRecord.timestamp <= window_end,
                )
            )
        ).all()

        for user_id, status, check_type, timestamp in rows:
            bucket = stats.get(user_id)
            if bucket is None:
                continue
            if status == AttendanceStatus.PROXY_ANOMALY:
                bucket["proxy_anomaly"] += 1
            elif status == AttendanceStatus.PENDING_REVIEW:
                bucket["pending_review"] += 1
            elif status in PRESENT_STATUSES:
                bucket["verified"] += 1
                # One time-in per school day; extra scans on the same day must
                # not inflate the attendance rate.
                if check_type == CheckType.TIME_IN:
                    bucket["days_present"].add(timestamp.date())

        # ── Approved absences ────────────────────────────────────────────────
        excused_rows = (
            await db.execute(
                select(ExcuseRequest.student_id, func.count())
                .where(
                    ExcuseRequest.student_id.in_(student_ids),
                    ExcuseRequest.status == "approved",
                    ExcuseRequest.absence_date >= start,
                    ExcuseRequest.absence_date <= end,
                )
                .group_by(ExcuseRequest.student_id)
            )
        ).all()
        excused = {uid: count for uid, count in excused_rows}

        # ── Saved evaluations by this evaluator ──────────────────────────────
        eval_rows = (
            await db.execute(
                select(AttendanceEvaluation).where(
                    AttendanceEvaluation.evaluator_id == current_user.id,
                    AttendanceEvaluation.student_id.in_(student_ids),
                )
            )
        ).scalars().all()
    else:
        excused = {}
        eval_rows = []

    saved = {e.student_id: e for e in eval_rows}
    school_days = _school_days(start, end)

    payload = []
    for user in students:
        bucket = stats[user.id]
        present = len(bucket["days_present"])
        rate = min(100, round(present / school_days * 100)) if school_days else 0
        evaluation = saved.get(user.id)
        payload.append(
            StudentEvaluationOut(
                student_id=user.id,
                id_number=user.id_number,
                full_name=user.full_name,
                section=user.section,
                days_present=present,
                school_days=school_days,
                verified=bucket["verified"],
                proxy_anomaly=bucket["proxy_anomaly"],
                pending_review=bucket["pending_review"],
                excused=excused.get(user.id, 0),
                rate=rate,
                standing=evaluation.standing if evaluation else None,
                note=evaluation.note if evaluation else None,
                evaluated_at=evaluation.updated_at if evaluation else None,
            )
        )

    return EvaluationSummaryOut(
        section=target_section,
        date_from=start,
        date_to=end,
        school_days=school_days,
        students=payload,
    )


@router.put("/{student_id}", response_model=EvaluationOut)
async def save_evaluation(
    student_id: str,
    body: EvaluationUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_faculty_or_above),
):
    """Create or overwrite this evaluator's evaluation for one student."""
    if body.standing not in EVALUATION_STANDINGS:
        raise HTTPException(
            status_code=422,
            detail=f"standing must be one of: {', '.join(EVALUATION_STANDINGS)}.",
        )

    result = await db.execute(select(User).where(User.id == student_id))
    student = result.scalar_one_or_none()
    if student is None or student.role != UserRole.STUDENT:
        raise HTTPException(status_code=404, detail="Student not found.")

    if current_user.role == UserRole.FACULTY and student.section != current_user.section:
        raise HTTPException(
            status_code=403, detail="You may only evaluate students in your section."
        )

    start, end = _resolve_window(body.date_from, body.date_to)

    existing = (
        await db.execute(
            select(AttendanceEvaluation).where(
                AttendanceEvaluation.student_id == student_id,
                AttendanceEvaluation.evaluator_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = AttendanceEvaluation(
            student_id=student_id,
            evaluator_id=current_user.id,
            period_start=start,
            period_end=end,
            standing=body.standing,
            note=body.note,
        )
        db.add(existing)
    else:
        existing.period_start = start
        existing.period_end = end
        existing.standing = body.standing
        existing.note = body.note

    await db.flush()
    await db.refresh(existing)
    return existing
