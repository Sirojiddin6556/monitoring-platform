import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from .models import Base, User, UserRole
from .security import get_password_hash

# Default to a lightweight local sqlite DB for easier local runs without containers
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./data/monitoring.db')

# Ensure directory exists for sqlite file
if DATABASE_URL.startswith('sqlite'):
    # expecting format sqlite+aiosqlite:///./data/monitoring.db
    try:
        path = DATABASE_URL.split('///', 1)[1]
    except Exception:
        path = None
    if path:
        folder = os.path.dirname(path)
        if folder and not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Создать администратора по умолчанию
    async with async_session() as session:
        res = await session.execute(select(User).where(User.email == 'admin@example.com'))
        if not res.scalars().first():
            admin = User(
                email='admin@example.com',
                username='admin',
                hashed_password=get_password_hash('admin123'),
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(admin)
            await session.commit()


def get_session():
    return async_session()
