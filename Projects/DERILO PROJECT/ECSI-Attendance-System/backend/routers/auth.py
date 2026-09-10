"""
Auth Router — login, token refresh, logout (stateless JWT)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User, AccountStatus
from schemas.user import LoginRequest, TokenResponse
from utils.security import verify_password, create_access_token

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id_number == body.id_number))
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid ID number or password.",
        )

    if user.status != AccountStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active. Contact the administrator.",
        )

    token = create_access_token(subject=user.id_number, role=user.role.value)

    return TokenResponse(
        access_token=token,
        role=user.role,
        user_id=str(user.id),
        full_name=user.full_name,
    )


@router.post("/logout")
async def logout():
    """
    Stateless JWT: client simply discards the token.
    This endpoint exists for API completeness / audit logging hooks.
    """
    return {"detail": "Successfully logged out."}
