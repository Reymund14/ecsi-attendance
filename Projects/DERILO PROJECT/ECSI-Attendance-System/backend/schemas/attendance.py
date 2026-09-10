"""
Pydantic v2 Schemas: Attendance Records & Proxy Audit
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from models.attendance import AttendanceStatus, CheckType


# ── Attendance ────────────────────────────────────────────────────────────────
class AttendanceOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    card_uid_used: str
    status: AttendanceStatus
    check_type: CheckType
    cosine_distance: Optional[float]
    terminal_id: Optional[str]
    captured_frame_path: Optional[str]
    timestamp: datetime

    # Joined fields
    full_name: Optional[str] = None
    id_number: Optional[str] = None
    profile_photo_path: Optional[str] = None

    model_config = {"from_attributes": True}


class AttendanceOverrideRequest(BaseModel):
    status: AttendanceStatus
    note: str = Field(..., min_length=5, max_length=500)


# ── Proxy Audit ───────────────────────────────────────────────────────────────
class ProxyAuditOut(BaseModel):
    id: uuid.UUID
    attendance_record_id: uuid.UUID
    intruder_image_path: Optional[str]
    cosine_distance: float
    card_uid: str
    registered_user_id: uuid.UUID
    terminal_id: Optional[str]
    detected_at: datetime
    resolution_note: Optional[str]

    # Joined
    registered_user_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Real-time WebSocket Event Payloads ────────────────────────────────────────
class WSAttendanceEvent(BaseModel):
    event: str = "attendance_update"
    record_id: str
    user_id: str
    full_name: str
    id_number: str
    profile_photo_path: Optional[str]
    status: AttendanceStatus
    check_type: CheckType
    cosine_distance: Optional[float]
    terminal_id: Optional[str]
    captured_frame_path: Optional[str]
    timestamp: str
    intruder_image_path: Optional[str] = None  # proxy attempts only


class WSAlertEvent(BaseModel):
    event: str = "proxy_alert"
    message: str
    card_uid: str
    registered_user_name: str
    cosine_distance: float
    intruder_image_path: Optional[str]
    terminal_id: Optional[str]
    detected_at: str
