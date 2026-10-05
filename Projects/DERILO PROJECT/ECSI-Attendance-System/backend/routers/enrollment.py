"""
Enrollment Router — RFID card binding + face capture / re-enrollment
"""

import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import get_current_user, require_faculty_or_above, require_super_admin
from models.user import User, RFIDCard, FaceEmbedding
from schemas.user import RFIDBindRequest, RFIDOut, FaceEmbeddingOut
from services import storage
from services.face_service import FaceService, face_pipeline_available

router = APIRouter()
face_service = FaceService()


@router.delete("/{user_id}/face", status_code=204, dependencies=[Depends(require_super_admin)])
async def delete_face(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a user's face template.

    Delete the biometric embedding and its private reference image. The
    profile photo in the public photos bucket is a separate user-managed asset.
    """
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    user_id = str(user_id)
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    result = await db.execute(
        select(FaceEmbedding).where(FaceEmbedding.user_id == user_id)
    )
    embedding = result.scalar_one_or_none()
    if not embedding:
        raise HTTPException(status_code=404, detail="No face template found for this user.")

    await db.delete(embedding)
    await storage.delete_face_enrollment_photo(user_id)
    return Response(status_code=204)


# ── RFID: Bind card to user ───────────────────────────────────────────────────
@router.post("/{user_id}/rfid", response_model=RFIDOut, dependencies=[Depends(require_faculty_or_above)])
async def bind_rfid(
    user_id: uuid.UUID,
    body: RFIDBindRequest,
    db: AsyncSession = Depends(get_db),
):
    user_id = str(user_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
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
    user_id = str(user_id)
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
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
    # IDs are VARCHAR(36) strings, but FastAPI hands us a uuid.UUID. Normalise
    # once so comparisons and binds below both work.
    user_id = str(user_id)
    from models.user import UserRole

    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Students may only enroll their own face.")

    # Fail clearly if the biometric dependencies are unavailable instead of
    # returning a misleading "no valid faces detected" response.
    if not face_pipeline_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Face enrollment is unavailable because OpenCV/DeepFace could not be loaded. "
                "Check /health/ready for face_pipeline_available, then verify Render is "
                "using Python 3.11 and installing backend/requirements-render.txt."
            ),
        )

    if not (1 <= len(frames) <= 10):
        raise HTTPException(status_code=400, detail="Provide between 1 and 10 face images.")

    # Ensure target user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Read all frame bytes
    frame_bytes_list = [await f.read() for f in frames]

    # Verify the bytes really are images before spending CPU on inference. The
    # client-supplied content_type is untrusted.
    for idx, frame_bytes in enumerate(frame_bytes_list):
        if storage.sniff_image(frame_bytes) is None:
            raise HTTPException(
                status_code=400,
                detail=f"Frame {idx + 1} is not a valid JPEG, PNG or WEBP image.",
            )

    # Generate mean embedding via AI pipeline
    try:
        mean_vector = await face_service.generate_enrollment_embedding(frame_bytes_list)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Keep one reference frame in the private Supabase bucket. Raw face imagery
    # never goes in the public profile-photo bucket.
    try:
        await storage.save_face_enrollment_photo(user_id, frame_bytes_list[0])
    except storage.StorageError as exc:
        raise HTTPException(status_code=502, detail=f"Could not save enrollment photo: {exc}")

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
    output = FaceEmbeddingOut.model_validate(embedding)
    output.face_photo_url = await storage.face_enrollment_photo_url(user_id)
    return output


# ── Face Enrollment Status ────────────────────────────────────────────────────
@router.get("/{user_id}/status", dependencies=[Depends(require_faculty_or_above)])
async def enrollment_status(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
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
    photo_url = (
        await storage.face_enrollment_photo_url(user_id)
        if user.face_embedding is not None else None
    )
    return {
        "user_id": str(user.id),
        "full_name": user.full_name,
        "has_rfid": user.rfid_card is not None and user.rfid_card.is_active,
        "rfid_uid": user.rfid_card.card_uid if user.rfid_card is not None and user.rfid_card.is_active else None,
        "has_face_embedding": user.face_embedding is not None,
        "face_photo_url": photo_url,
        "enrollment_complete": (
            user.rfid_card is not None
            and user.rfid_card.is_active
            and user.face_embedding is not None
        ),
    }
