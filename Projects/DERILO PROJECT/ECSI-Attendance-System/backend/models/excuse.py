"""Student absence excuse requests."""

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ExcuseRequest(Base):
    __tablename__ = "excuse_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    absence_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    adviser_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proof_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    proof_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    proof_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    filed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    student = relationship("User")
