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
    from models import user, attendance, notification  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add profile fields to databases created before these fields existed.
        columns = {
            "phone": "VARCHAR(32)",
            "address": "VARCHAR(255)",
            "parent_name": "VARCHAR(128)",
            "parent_contact": "VARCHAR(32)",
        }
        if _is_sqlite:
            existing = await conn.run_sync(
                lambda sync_conn: {column["name"] for column in
                                   __import__("sqlalchemy").inspect(sync_conn).get_columns("users")}
            )
            for name, sql_type in columns.items():
                if name not in existing:
                    await conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {name} {sql_type}")
        else:
            for name, sql_type in columns.items():
                await conn.exec_driver_sql(
                    f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {name} {sql_type}"
                )
