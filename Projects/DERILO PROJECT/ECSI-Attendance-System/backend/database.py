"""
ECSI Attendance System — Async Database Layer
Supports PostgreSQL (production, asyncpg) and SQLite (dev, aiosqlite).
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

# ── Engine — dialect-aware kwargs ─────────────────────────────────────────────
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

_engine_kwargs = dict(echo=settings.DEBUG)
if not _is_sqlite:
    # pool_pre_ping survives Supabase dropping idle connections.
    # Keep the pool small: Supabase's transaction pooler multiplexes many
    # clients over few backend connections.
    _engine_kwargs.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        pool_pre_ping=True,
        connect_args={
            "statement_cache_size": 0,
        },
    )
else:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# ── Base Model ────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency ────────────────────────────────────────────────────────────────
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Init (called on startup) ──────────────────────────────────────────────────
async def init_db() -> None:
    """Create all tables defined via the ORM if they do not already exist."""
    from models import user, attendance  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
