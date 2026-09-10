"""
Users Router — CRUD for user accounts (admin-managed + self-service)
"""

import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from middleware.rbac import get_current_user, require_faculty_or_above, require_super_admin
from models.user import User, UserRole
from schemas.user import UserCreate, UserOut, UserUpdate, UserPasswordChange
from utils.security import hash_password, verify_password
from config import settings

router = APIRouter()

PHOTO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "profiles")
os.makedirs(PHOTO_DIR, exist_ok=True)


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

    user = User(
        id_number=body.id_number,
        full_name=body.full_name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        department=body.department,
        section=body.section,
    )
    db.add(user)
    await db.flush()
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
    # Students may only update their own record; admin/faculty can update any
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Students may only update their own profile.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    for field, value in body.model_dump(exclude_none=True).items():
        # Only super admin can change status
        if field == "status" and current_user.role != UserRole.SUPER_ADMIN:
            continue
        setattr(user, field, value)

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
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if photo.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WEBP images are accepted.")

    filename = f"{current_user.id}.jpg"
    filepath = os.path.join(PHOTO_DIR, filename)

    with open(filepath, "wb") as f:
        content = await photo.read()
        f.write(content)

    current_user.profile_photo_path = f"/static/profiles/{filename}"
    await db.flush()
    await db.refresh(current_user)
    return UserOut.from_orm_extended(current_user)


# ── Delete user (super admin only) ───────────────────────────────────────────
@router.delete("/{user_id}", status_code=204, dependencies=[Depends(require_super_admin)])
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    await db.delete(user)
