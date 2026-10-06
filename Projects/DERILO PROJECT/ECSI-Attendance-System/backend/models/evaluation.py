"""
ORM Model: Faculty Attendance Evaluations

Persists an adviser's standing decision and remarks for a student so the
Attendance Evaluation page survives a reload.

Only the *judgement* is stored here. Rates, day counts and proxy tallies are
always recomputed from `attendance_records` at read time — caching them would
let the page drift out of sync with the real attendance log.
"""

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.user import UUIDString


# Mirrors the <select> in the Attendance Evaluation table. Stored as a plain
# string rather than a native DB enum so new options never need an ALTER TYPE.
EVALUATION_STANDINGS = (
    "Good Standing",
    "Needs Improvement",
    "Referred to Guidance",
    "On Probation",
    "Dropped",
)


class AttendanceEvaluation(Base):
    __tablename__ = "attendance_evaluations"
    __table_args__ = (
        # One evaluation per student per adviser: re-saving overwrites in place
        # rather than stacking a new row on every Save click.
        UniqueConstraint("student_id", "evaluator_id", name="uq_evaluation_student_evaluator"),
    )

    id: Mapped[str] = mapped_column(
        UUIDString(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    student_id: Mapped[str] = mapped_column(
        UUIDString(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Whoever wrote the evaluation — the adviser, or a super admin reviewing.
    evaluator_id: Mapped[str] = mapped_column(
        UUIDString(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Window the stats were judged over, kept for the audit trail.
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    standing: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    student = relationship("User", foreign_keys=[student_id])
    evaluator = relationship("User", foreign_keys=[evaluator_id])
