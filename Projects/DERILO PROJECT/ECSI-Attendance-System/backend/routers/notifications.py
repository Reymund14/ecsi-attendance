"""Database-backed notification history and in-system broadcasts."""

from datetime import datetime
import json
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import get_current_user, require_faculty_or_above
from models.notification import Notification, NotificationSettings
from models.user import User

router = APIRouter()
DEFAULT_SETTINGS = {
    "sms_enabled": False,
    "email_enabled": False,
    "sms_provider": "Not configured",
    "email_provider": "Not configured",
    "recipients": {"parents": True, "admins": True, "faculty": True},
    "triggers": {"proxy_alert": True, "daily_summary": False, "absence_3days": True, "new_enrollment": True},
}


class NotificationCreate(BaseModel):
    channel: Literal["system", "sms", "email"]
    recipient_label: str = Field(..., min_length=1, max_length=255)
    recipient_user_id: Optional[str] = None
    recipient_role: Optional[str] = Field(None, max_length=32)
    subject: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1, max_length=10000)


class NotificationOut(BaseModel):
    id: str
    channel: str
    recipient_label: str
    recipient_user_id: Optional[str]
    recipient_role: Optional[str]
    sender_name: str
    subject: str
    body: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationSettingsUpdate(BaseModel):
    settings: dict


@router.get("/settings")
async def get_notification_settings(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = await db.get(NotificationSettings, "default")
    return json.loads(row.value) if row else DEFAULT_SETTINGS


@router.put("/settings", dependencies=[Depends(require_faculty_or_above)])
async def update_notification_settings(body: NotificationSettingsUpdate, db: AsyncSession = Depends(get_db)):
    row = await db.get(NotificationSettings, "default")
    if row:
        row.value = json.dumps(body.settings)
    else:
        row = NotificationSettings(key="default", value=json.dumps(body.settings))
        db.add(row)
    await db.flush()
    return body.settings


@router.get("/", response_model=list[NotificationOut])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Notification).order_by(Notification.created_at.desc()).limit(200)
    if current_user.role.value == "student":
        stmt = stmt.where(
            or_(Notification.recipient_user_id == current_user.id,
                Notification.recipient_role.in_(["student", "all"]))
        )
    else:
        stmt = stmt.where(
            or_(Notification.recipient_user_id == current_user.id,
                Notification.recipient_user_id.is_(None),
                Notification.recipient_role.in_([current_user.role.value, "all"]))
        )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=NotificationOut, status_code=201,
             dependencies=[Depends(require_faculty_or_above)])
async def create_notification(
    body: NotificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.recipient_user_id:
        recipient = await db.get(User, body.recipient_user_id)
        if not recipient:
            raise HTTPException(status_code=404, detail="Notification recipient not found.")
    notification = Notification(
        channel=body.channel,
        recipient_label=body.recipient_label,
        recipient_user_id=body.recipient_user_id,
        recipient_role=body.recipient_role,
        sender_user_id=current_user.id,
        sender_name=current_user.full_name,
        subject=body.subject,
        body=body.body,
        # No SMS or email provider is configured in this app; persist those as
        # queued records instead of claiming an external message was delivered.
        status="stored" if body.channel == "system" else "queued",
    )
    db.add(notification)
    await db.flush()
    await db.refresh(notification)
    return notification
