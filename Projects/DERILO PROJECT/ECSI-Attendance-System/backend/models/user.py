"""
ORM Models: Users, RFID Cards, Face Embeddings
Portable across PostgreSQL (production) and SQLite (dev/test).
"""

import json as _json
import uuid
from datetime import datetime
from typing import List, Optional

import enum
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ── JSON-serialised float list ────────────────────────────────────────────────
class FloatListJSON(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return _json.dumps(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return _json.loads(value) if value is not None else None


# ── UUID stored as a 36-char string ───────────────────────────────────────────
class UUIDString(TypeDecorator):
    """
    `VARCHAR(36)` that also accepts a `uuid.UUID` when bound.

    IDs are stored as strings so the schema works identically on SQLite and
    PostgreSQL, but FastAPI hands routers a real `uuid.UUID` for path params.
    Without this coercion aiosqlite raises "type 'UUID' is not supported" and
    asyncpg would raise a type error, turning every ID lookup into a 500.
    """

    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if isinstance(value, uuid.UUID):
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        return value


# ── Enumerations ──────────────────────────────────────────────────────────────
class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    FACULTY = "faculty"
    STUDENT = "student"


class AccountStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


# ── User ──────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUIDString(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    id_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.STUDENT
    )
    status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus, name="account_status"),
        nullable=False,
        default=AccountStatus.ACTIVE,
    )
    profile_photo_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    section: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    rfid_card: Mapped[Optional["RFIDCard"]] = relationship(
        "RFIDCard", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    face_embedding: Mapped[Optional["FaceEmbedding"]] = relationship(
        "FaceEmbedding", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    # Explicit foreign_keys to resolve ambiguity with override_by FK
    attendance_records: Mapped[List["AttendanceRecord"]] = relationship(  # type: ignore[name-defined]
        "AttendanceRecord",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="AttendanceRecord.user_id",
    )


# ── RFID Card ─────────────────────────────────────────────────────────────────
class RFIDCard(Base):
    __tablename__ = "rfid_cards"

    id: Mapped[str] = mapped_column(
        UUIDString(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUIDString(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    card_uid: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="rfid_card")


# ── Face Embedding ────────────────────────────────────────────────────────────
class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[str] = mapped_column(
        UUIDString(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUIDString(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    embedding_vector: Mapped[List[float]] = mapped_column(FloatListJSON, nullable=False)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False, default="ArcFace")
    source_frame_count: Mapped[int] = mapped_column(default=5)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="face_embedding")
