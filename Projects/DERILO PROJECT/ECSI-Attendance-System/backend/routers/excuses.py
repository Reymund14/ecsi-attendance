"""Database-backed student excuse requests with private proof uploads."""

import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from middleware.rbac import get_current_user
from models.excuse import ExcuseRequest
from models.user import User, UserRole
from services import storage

router = APIRouter()
MAX_PROOF_BYTES = 5 * 1024 * 1024


class ExcuseOut(BaseModel):
    id: str
    student_id: str
    student_name: str
    id_number: str
    section: Optional[str]
    date: date
    reason: str
    status: str
    adviser_note: Optional[str]
    filed_at: datetime
    proof_name: Optional[str]
    proof_type: Optional[str]
    proof_url: Optional[str] = None


class ExcuseReview(BaseModel):
    status: str = Field(pattern="^(approved|rejected)$")
    adviser_note: Optional[str] = Field(None, max_length=2000)


async def _to_out(request: ExcuseRequest) -> ExcuseOut:
    return ExcuseOut(
        id=request.id,
        student_id=request.student_id,
        student_name=request.student.full_name,
        id_number=request.student.id_number,
        section=request.student.section,
        date=request.absence_date,
        reason=request.reason,
        status=request.status,
        adviser_note=request.adviser_note,
        filed_at=request.filed_at,
        proof_name=request.proof_name,
        proof_type=request.proof_type,
        proof_url=await storage.capture_signed_url(request.proof_path) if request.proof_path else None,
    )


@router.get("/", response_model=list[ExcuseOut])
async def list_excuses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(ExcuseRequest).options(selectinload(ExcuseRequest.student)).order_by(ExcuseRequest.filed_at.desc())
    if current_user.role == UserRole.STUDENT:
        stmt = stmt.where(ExcuseRequest.student_id == current_user.id)
    elif current_user.role == UserRole.FACULTY:
        if not current_user.section:
            return []
        stmt = stmt.join(ExcuseRequest.student).where(
            User.role == UserRole.STUDENT, User.section == current_user.section
        )
    elif current_user.role != UserRole.SUPER_ADMIN:
        return []
    result = await db.execute(stmt)
    return [await _to_out(row) for row in result.scalars().unique().all()]


@router.post("/", response_model=ExcuseOut, status_code=201)
async def create_excuse(
    absence_date: date = Form(...),
    reason: str = Form(..., min_length=1, max_length=5000),
    proof: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only student accounts can submit excuse requests.")
    if absence_date > date.today():
        raise HTTPException(status_code=400, detail="Absence date cannot be in the future.")
    if not reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required.")

    request = ExcuseRequest(
        student_id=current_user.id,
        absence_date=absence_date,
        reason=reason.strip(),
    )
    db.add(request)
    await db.flush()

    if proof and proof.filename:
        content = await proof.read(MAX_PROOF_BYTES + 1)
        if len(content) > MAX_PROOF_BYTES:
            raise HTTPException(status_code=413, detail="Proof file exceeds the 5 MB limit.")
        if content.startswith(b"%PDF-"):
            content_type = "application/pdf"
        else:
            sniffed = storage.sniff_image(content)
            if not sniffed:
                raise HTTPException(status_code=400, detail="Proof must be a JPG, PNG, WEBP, or PDF file.")
            content_type = sniffed[0]
        try:
            request.proof_path = await storage.save_excuse_proof(
                current_user.id, request.id, proof.filename, content, content_type
            )
        except storage.StorageError as exc:
            raise HTTPException(status_code=502, detail=f"Could not save proof file: {exc}")
        request.proof_name = proof.filename[:255]
        request.proof_type = content_type

    await db.flush()
    await db.refresh(request)
    request.student = current_user
    return await _to_out(request)


@router.patch("/{request_id}", response_model=ExcuseOut)
async def review_excuse(
    request_id: uuid.UUID,
    body: ExcuseReview,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.FACULTY, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Only faculty or administrators may review excuse requests.")
    result = await db.execute(
        select(ExcuseRequest).options(selectinload(ExcuseRequest.student)).where(ExcuseRequest.id == str(request_id))
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Excuse request not found.")
    if current_user.role == UserRole.FACULTY and request.student.section != current_user.section:
        raise HTTPException(status_code=403, detail="You may only review requests from your section.")
    request.status = body.status
    request.adviser_note = body.adviser_note
    await db.flush()
    await db.refresh(request)
    return await _to_out(request)
