"""
Enrollment Router — RFID card binding + face capture / re-enrollment
"""

import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import get_current_user, require_faculty_or_above, require_super_admin
from models.user import User, RFIDCard, FaceEmbedding
from schemas.user import RFIDBindRequest, RFIDOut, FaceEmbeddingOut
from services.face_service import FaceService

router = APIRouter()
face_service = FaceService()


# ── RFID: Bind card to user ───────────────────────────────────────────────────
@router.post("/{user_id}/rfid", response_model=RFIDOut, dependencies=[Depends(require_faculty_or_above)])
async def bind_rfid(
    user_id: uuid.UUID,
    body: RFIDBindRequest,
    db: AsyncSession = Depends(get_db),
):
    # Ensure user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Ensure card UID not already taken by someone else
    existing = await db.execute(select(RFIDCard).where(RFIDCard.card_uid == body.card_uid))
    card = existing.scalar_one_or_none()
    if card and card.user_id != user_id:
        raise HTTPException(status_code=409, detail="This RFID card is already assigned to another user.")

    if card:
        # Re-activate existing card
        card.is_active = True
    else:
        # Remove old card if exists
        old = await db.execute(select(RFIDCard).where(RFIDCard.user_id == user_id))
        old_card = old.scalar_one_or_none()
        if old_card:
            await db.delete(old_card)
            await db.flush()

        card = RFIDCard(user_id=user_id, card_uid=body.card_uid.upper())
        db.add(card)

    await db.flush()
    await db.refresh(card)
    return card


# ── RFID: Deactivate card ─────────────────────────────────────────────────────
@router.delete("/{user_id}/rfid", dependencies=[Depends(require_super_admin)])
async def deactivate_rfid(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RFIDCard).where(RFIDCard.user_id == user_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="No RFID card found for this user.")
    card.is_active = False
    return {"detail": "RFID card deactivated."}


# ── Face Enrollment: Upload frames and generate embedding ─────────────────────
@router.post("/{user_id}/face", response_model=FaceEmbeddingOut)
async def enroll_face(
    user_id: uuid.UUID,
    frames: List[UploadFile] = File(..., description="5 distinct face frame images (JPEG/PNG)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accepts up to 5 facial image frames, generates a mean 512-dim ArcFace
    embedding, and stores it in the database. Students enroll themselves;
    faculty/admin can enroll any user.
    """
    from models.user import UserRole

    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Students may only enroll their own face.")

    if not (1 <= len(frames) <= 10):
        raise HTTPException(status_code=400, detail="Provide between 1 and 10 face images.")

    # Ensure target user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Read all frame bytes
    frame_bytes_list = [await f.read() for f in frames]

    # Generate mean embedding via AI pipeline
    try:
        mean_vector = await face_service.generate_enrollment_embedding(frame_bytes_list)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Persist or update embedding
    existing = await db.execute(select(FaceEmbedding).where(FaceEmbedding.user_id == user_id))
    embedding = existing.scalar_one_or_none()

    if embedding:
        embedding.embedding_vector = mean_vector
        embedding.source_frame_count = len(frames)
        embedding.model_name = face_service.model_name
    else:
        embedding = FaceEmbedding(
            user_id=user_id,
            embedding_vector=mean_vector,
            model_name=face_service.model_name,
            source_frame_count=len(frames),
        )
        db.add(embedding)

    await db.flush()
    await db.refresh(embedding)
    return embedding


# ── Face Enrollment Status ────────────────────────────────────────────────────
@router.get("/{user_id}/status", dependencies=[Depends(require_faculty_or_above)])
async def enrollment_status(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .options(selectinload(User.rfid_card), selectinload(User.face_embedding))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {
        "user_id": str(user.id),
        "full_name": user.full_name,
        "has_rfid": user.rfid_card is not None and user.rfid_card.is_active,
        "has_face_embedding": user.face_embedding is not None,
        "enrollment_complete": (
            user.rfid_card is not None
            and user.rfid_card.is_active
            and user.face_embedding is not None
        ),
    }
