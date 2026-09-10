"""
RBAC Middleware — FastAPI dependency injectors for role-based access control.
"""

from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User, UserRole, AccountStatus
from utils.security import decode_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate JWT and return the authenticated User ORM object."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload.get("sub")
        if not user_id:
            raise exc
    except JWTError:
        raise exc

    result = await db.execute(select(User).where(User.id_number == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise exc
    if user.status != AccountStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive or suspended.",
        )
    return user


def require_roles(*roles: UserRole):
    """
    Returns a FastAPI dependency that enforces the user has one of the
    specified roles. Usage:
        router.get("/admin-only", dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN))])
    """
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not authorized for this resource.",
            )
        return current_user
    return checker


# ── Convenience shorthands ────────────────────────────────────────────────────
require_super_admin = require_roles(UserRole.SUPER_ADMIN)
require_faculty_or_above = require_roles(UserRole.SUPER_ADMIN, UserRole.FACULTY)
require_any_authenticated = require_roles(
    UserRole.SUPER_ADMIN, UserRole.FACULTY, UserRole.STUDENT
)
