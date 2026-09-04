import os
import asyncio
import logging
import secrets
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from .models import User, UserRole
from .security import get_password_hash

logger = logging.getLogger("backend.db")

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _run_alembic_upgrade() -> None:
    """Apply Alembic migrations up to head (runs a sync engine, must be called off the event loop)."""
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import create_engine, inspect as sa_inspect

    cfg = Config(os.path.join(_BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(_BACKEND_DIR, "migrations"))

    sync_url = DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")
    sync_engine = create_engine(sync_url)
    try:
        existing_tables = set(sa_inspect(sync_engine).get_table_names())
    finally:
        sync_engine.dispose()

    if existing_tables and "alembic_version" not in existing_tables:
        # Database was created before Alembic was wired in (via Base.metadata.create_all).
        # Its schema already matches migration 0001, so mark it as up to date instead of
        # re-running CREATE TABLE against tables that already exist.
        command.stamp(cfg, "head")
    else:
        command.upgrade(cfg, "head")


DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./data/monitoring.db')
_IS_SQLITE = DATABASE_URL.startswith('sqlite')

if _IS_SQLITE:
    logger.warning(
        "Using SQLite database. For production, set DATABASE_URL to a PostgreSQL connection string."
    )
    # Ensure data directory exists
    try:
        path = DATABASE_URL.split('///', 1)[1]
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
    except Exception:
        pass
    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        connect_args={"timeout": 30},
    )
else:
    # PostgreSQL — use connection pool
    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
        pool_pre_ping=True,
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "3600")),
    )

async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    if _IS_SQLITE:
        async with engine.begin() as conn:
            await conn.execute(text('PRAGMA journal_mode=WAL'))
            await conn.execute(text('PRAGMA synchronous=NORMAL'))
            await conn.execute(text('PRAGMA busy_timeout=30000'))
            await conn.execute(text('PRAGMA foreign_keys=ON'))

    # Schema is managed by Alembic (backend/alembic/versions/) rather than create_all,
    # so schema changes are versioned and applied the same way in dev and production.
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _run_alembic_upgrade)

    # Bootstrap admin user without hardcoded static password.
    async with async_session() as session:
        admin_email = os.getenv('INITIAL_ADMIN_EMAIL', 'admin@example.com')
        admin_password = os.getenv('INITIAL_ADMIN_PASSWORD', '').strip()

        # If any admin already exists, skip bootstrap.
        res_admin = await session.execute(select(User).where(User.role == UserRole.ADMIN))
        existing_admin = res_admin.scalars().first()
        if existing_admin:
            return

        # If password is not provided, generate a random one-time password.
        if not admin_password:
            admin_password = secrets.token_urlsafe(18)
            print(
                f"WARNING: INITIAL_ADMIN_PASSWORD was not set. "
                f"Generated bootstrap admin password for {admin_email}: {admin_password}"
            )

        res = await session.execute(select(User).where(User.email == admin_email))
        if not res.scalars().first():
            admin = User(
                email=admin_email,
                username='admin',
                hashed_password=get_password_hash(admin_password),
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(admin)
            await session.commit()


def get_session():
    return async_session()
