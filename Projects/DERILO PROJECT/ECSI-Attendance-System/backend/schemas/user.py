"""
Pydantic v2 Schemas: User, RFID, Embedding
"""

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from models.user import AccountStatus, UserRole


# ── User Schemas ──────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    id_number: str = Field(..., max_length=32, examples=["2024-00001"])
    full_name: str = Field(..., max_length=128)
    email: Optional[EmailStr] = None
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.STUDENT
    department: Optional[str] = None
    section: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    parent_name: Optional[str] = None
    parent_contact: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=128)
    email: Optional[EmailStr] = None
    department: Optional[str] = None
    section: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    parent_name: Optional[str] = None
    parent_contact: Optional[str] = None
    status: Optional[AccountStatus] = None


class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class UserOut(BaseModel):
    id: uuid.UUID
    id_number: str
    full_name: str
    email: Optional[str]
    role: UserRole
    status: AccountStatus
    department: Optional[str]
    section: Optional[str]
    phone: Optional[str] = None
    address: Optional[str] = None
    parent_name: Optional[str] = None
    parent_contact: Optional[str] = None
    profile_photo_path: Optional[str]
    has_rfid: bool = False
    rfid_uid: Optional[str] = None
    has_face: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_extended(cls, user: "User") -> "UserOut":  # type: ignore[name-defined]
        obj = cls.model_validate(user)
        obj.has_rfid = user.rfid_card is not None and user.rfid_card.is_active
        obj.rfid_uid = user.rfid_card.card_uid if obj.has_rfid else None
        obj.has_face = user.face_embedding is not None
        return obj


# ── RFID Schemas ──────────────────────────────────────────────────────────────
class RFIDBindRequest(BaseModel):
    card_uid: str = Field(..., min_length=4, max_length=64)


class RFIDOut(BaseModel):
    id: uuid.UUID
    card_uid: str
    is_active: bool
    registered_at: datetime

    model_config = {"from_attributes": True}


# ── Face Embedding Schemas ────────────────────────────────────────────────────
class FaceEmbeddingOut(BaseModel):
    id: uuid.UUID
    model_name: str
    source_frame_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Auth Schemas ──────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    id_number: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: str
    full_name: str
