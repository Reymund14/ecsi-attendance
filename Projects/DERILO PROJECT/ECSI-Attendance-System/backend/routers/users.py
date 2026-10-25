"""
Users Router — CRUD for user accounts (admin-managed + self-service)
"""

import os
import posixpath
import uuid
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from middleware.rbac import get_current_user, require_faculty_or_above, require_super_admin
from models.user import User, UserRole
from schemas.user import UserCreate, UserOut, UserUpdate, UserPasswordChange
from services import storage
from utils.security import hash_password, verify_password
from config import settings

router = APIRouter()


# ── List / Search Users (admin + faculty) ─────────────────────────────────────
@router.get("/", response_model=List[UserOut], dependencies=[Depends(require_faculty_or_above)])
async def list_users(
    role: Optional[UserRole] = None,
    search: Optional[str] = Query(None, min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.rfid_card), selectinload(User.face_embedding))

    if role:
        stmt = stmt.where(User.role == role)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            User.full_name.ilike(pattern) | User.id_number.ilike(pattern)
        )

    stmt = stmt.order_by(User.full_name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [UserOut.from_orm_extended(u) for u in users]


# ── Get single user ────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.from_orm_extended(current_user)


@router.get("/{user_id}", response_model=UserOut, dependencies=[Depends(require_faculty_or_above)])
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user_id = str(user_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    result = await db.execute(
        select(User)
        .options(selectinload(User.rfid_card), selectinload(User.face_embedding))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return UserOut.from_orm_extended(user)


# ── Create user (super admin only) ────────────────────────────────────────────
@router.post("/", response_model=UserOut, status_code=201, dependencies=[Depends(require_super_admin)])
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check uniqueness
    existing = await db.execute(select(User).where(User.id_number == body.id_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="ID number already registered.")

    # Email is also unique in the database. Check it before INSERT so the
    # enrollment form gets an actionable conflict instead of a generic 500.
    if body.email:
        existing_email = await db.execute(
            select(User.id).where(func.lower(User.email) == body.email.lower())
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already exists.")

    user = User(
        id_number=body.id_number,
        full_name=body.full_name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        department=body.department,
        section=body.section,
        phone=body.phone,
        address=body.address,
        parent_name=body.parent_name,
        parent_contact=body.parent_contact,
        children=body.children or ([] if body.role != UserRole.PARENT else []),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        # A concurrent request can pass the pre-check before another request
        # inserts the same ID/email. Keep that case a client-visible conflict.
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Student ID or email already exists.",
        ) from exc
    await db.refresh(user)
    return UserOut.from_orm_extended(user)


# ── Update user ───────────────────────────────────────────────────────────────
@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = str(user_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    # Students may only update their own record; admin/faculty can update any
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Students may only update their own profile.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    data = body.model_dump(exclude_none=True)
    new_password = data.pop("password", None)

    for field, value in data.items():
        # Only super admin can change status
        if field == "status" and current_user.role != UserRole.SUPER_ADMIN:
            continue
        setattr(user, field, value)

    # Password resets are a super-admin action; the dedicated self-service
    # endpoint (/me/change-password) is the only way for anyone else to change
    # their own password, because it requires the current password.
    if new_password is not None:
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Only a super admin can reset a password.",
            )
        user.hashed_password = hash_password(new_password)

    await db.flush()
    await db.refresh(user)
    return UserOut.from_orm_extended(user)


# ── Change password (self-service) ────────────────────────────────────────────
@router.post("/me/change-password")
async def change_password(
    body: UserPasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    current_user.hashed_password = hash_password(body.new_password)
    await db.flush()
    return {"detail": "Password updated successfully."}


# ── Upload profile photo ──────────────────────────────────────────────────────
@router.post("/me/photo", response_model=UserOut)
async def upload_profile_photo(
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accept a JPEG/PNG/WEBP avatar and store it in object storage.

    Returns a directly loadable URL: `/static/profiles/<id><ext>` when running
    against the local filesystem, or an absolute Supabase public URL in the cloud.
    """
    content = await photo.read()

    # The client's Content-Type is untrusted — an attacker could upload HTML and
    # have it served from our own origin, so validate the real magic bytes and
    # derive the extension from what we actually sniffed.
    if storage.sniff_image(content) is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image. Only genuine JPEG, PNG or WEBP files are accepted.",
        )

    try:
        public_url = await storage.save_photo(current_user.id, content, photo.content_type or "")
    except storage.StorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Replace any previous photo so we do not leave orphans under another extension.
    previous = current_user.profile_photo_path
    current_user.profile_photo_path = public_url
    await db.flush()
    await db.refresh(current_user)

    if previous and previous != public_url:
        old_key = posixpath.basename(urlparse(str(previous)).path)
        if old_key.startswith(f"{current_user.id}."):
            await storage.delete_photo_key(old_key)

    return UserOut.from_orm_extended(current_user)


# ── Delete user (super admin only) ───────────────────────────────────────────
@router.delete("/{user_id}", status_code=204, dependencies=[Depends(require_super_admin)])
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user_id = str(user_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    await db.delete(user)

    # Remove the stored avatar too, otherwise the object outlives the user and
    # accumulates in the bucket (and in local dev on disk).
    await storage.delete_photo(str(user_id))


# ── Parent dashboard data ─────────────────────────────────────────────────────
@router.get("/me/children", response_model=List[UserOut])
async def get_my_children(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.PARENT:
        raise HTTPException(status_code=403, detail="Only parent accounts can access child records.")

    child_ids = current_user.children or []
    if not child_ids:
        return []

    result = await db.execute(
        select(User)
        .options(selectinload(User.rfid_card), selectinload(User.face_embedding))
        .where(User.id.in_(child_ids))
        .order_by(User.full_name)
    )
    kids = result.scalars().all()
    return [UserOut.from_orm_extended(u) for u in kids]
