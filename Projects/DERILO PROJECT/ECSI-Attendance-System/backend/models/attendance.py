"""
ORM Models: Attendance Records & Proxy Attempt Audit Logs
"""

import uuid
from datetime import datetime
from typing import Optional

import enum
from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.user import UUIDString


# ── Enumerations ──────────────────────────────────────────────────────────────
class AttendanceStatus(str, enum.Enum):
    VERIFIED = "verified"
    PROXY_ANOMALY = "proxy_anomaly"
    MANUAL_OVERRIDE = "manual_override"
    PENDING_REVIEW = "pending_review"


class CheckType(str, enum.Enum):
    TIME_IN = "time_in"
    TIME_OUT = "time_out"


# ── Attendance Record ─────────────────────────────────────────────────────────
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[str] = mapped_column(
        UUIDString(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUIDString(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_uid_used: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, name="attendance_status"),
        nullable=False,
        default=AttendanceStatus.PENDING_REVIEW,
    )
    check_type: Mapped[CheckType] = mapped_column(
        Enum(CheckType, name="check_type"),
        nullable=False,
        default=CheckType.TIME_IN,
    )
    cosine_distance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    terminal_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    override_by: Mapped[Optional[str]] = mapped_column(
        UUIDString(36), ForeignKey("users.id"), nullable=True
    )
    override_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    captured_frame_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[user_id], back_populates="attendance_records"
    )
    override_officer: Mapped[Optional["User"]] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[override_by]
    )
    proxy_log: Mapped[Optional["ProxyAuditLog"]] = relationship(
        "ProxyAuditLog", back_populates="attendance_record", uselist=False, cascade="all, delete-orphan"
    )


# ── Proxy Audit Log ───────────────────────────────────────────────────────────
class ProxyAuditLog(Base):
    __tablename__ = "proxy_audit_logs"

    id: Mapped[str] = mapped_column(
        UUIDString(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    attendance_record_id: Mapped[str] = mapped_column(
        UUIDString(36),
        ForeignKey("attendance_records.id", ondelete="CASCADE"),
        unique=True,
    )
    intruder_image_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    cosine_distance: Mapped[float] = mapped_column(Float, nullable=False)
    card_uid: Mapped[str] = mapped_column(String(64), nullable=False)
    registered_user_id: Mapped[str] = mapped_column(
        UUIDString(36), ForeignKey("users.id"), nullable=False
    )
    terminal_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    attendance_record: Mapped["AttendanceRecord"] = relationship(
        "AttendanceRecord", back_populates="proxy_log"
    )
    registered_user: Mapped["User"] = relationship("User", foreign_keys=[registered_user_id])  # type: ignore[name-defined]
