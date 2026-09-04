"""Authentication router: login, logout, refresh, me."""
import logging
from datetime import timedelta, datetime

from fastapi import APIRouter, HTTPException, status, Depends, Request, Response
from sqlalchemy import select

from .. import db
from ..models import User as UserModel, UserOrganization as UserOrganizationModel, RefreshToken as RefreshTokenModel
from ..security import (
    get_password_hash, verify_password, create_access_token, get_current_user, get_admin_user,
    create_refresh_token, hash_token, REFRESH_TOKEN_EXPIRE_DAYS,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from ..schemas import UserRegister, UserLogin, Token, UserResponse

logger = logging.getLogger("backend.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, request: Request, response: Response):
    """Login: returns JWT access token + sets httpOnly refresh cookie."""
    from ..main import _apply_login_rate_limit, _register_failed_login_attempt, _clear_login_attempts
    _apply_login_rate_limit(request)

    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
        user = res.scalars().first()

        if not user or not verify_password(user_data.password, user.hashed_password):
            _register_failed_login_attempt(request)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")

        res_orgs = await session.execute(
            select(UserOrganizationModel.org_id).where(UserOrganizationModel.user_id == user.id)
        )
        org_ids = [r[0] for r in res_orgs.fetchall()]

        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role.value, "org_ids": org_ids},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        # Create refresh token and store its hash
        raw_refresh = create_refresh_token()
        token_hash = hash_token(raw_refresh)
        expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        device_info = request.headers.get("User-Agent", "")[:200]

        session.add(RefreshTokenModel(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            device_info=device_info,
        ))
        await session.commit()

    _clear_login_attempts(request)

    # Set refresh token as httpOnly Secure cookie
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_refresh,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "role": user.role.value,
            "org_ids": org_ids,
        },
    }


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    """Issue new access token using refresh cookie (token rotation)."""
    raw_refresh = request.cookies.get(REFRESH_COOKIE)
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    token_hash = hash_token(raw_refresh)

    async with db.get_session() as session:
        res = await session.execute(
            select(RefreshTokenModel).where(RefreshTokenModel.token_hash == token_hash)
        )
        rt = res.scalars().first()

        if not rt or rt.is_revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        if rt.expires_at < datetime.utcnow():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

        res_user = await session.execute(select(UserModel).where(UserModel.id == rt.user_id))
        user = res_user.scalars().first()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or disabled")

        res_orgs = await session.execute(
            select(UserOrganizationModel.org_id).where(UserOrganizationModel.user_id == user.id)
        )
        org_ids = [r[0] for r in res_orgs.fetchall()]

        # Token rotation: revoke old, issue new
        rt.is_revoked = True

        new_raw = create_refresh_token()
        new_hash = hash_token(new_raw)
        new_expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        session.add(RefreshTokenModel(
            user_id=user.id,
            token_hash=new_hash,
            expires_at=new_expires,
            device_info=rt.device_info,
        ))
        await session.commit()

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "org_ids": org_ids},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=new_raw,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Revoke refresh token and clear cookie."""
    raw_refresh = request.cookies.get(REFRESH_COOKIE)
    if raw_refresh:
        token_hash = hash_token(raw_refresh)
        try:
            async with db.get_session() as session:
                res = await session.execute(
                    select(RefreshTokenModel).where(RefreshTokenModel.token_hash == token_hash)
                )
                rt = res.scalars().first()
                if rt:
                    rt.is_revoked = True
                    await session.commit()
        except Exception as e:
            logger.warning("Logout DB error: %s", e)

    response.delete_cookie(key=REFRESH_COOKIE, path="/api/auth")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info from JWT."""
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.id == int(current_user["user_id"])))
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserRegister, current_user: dict = Depends(get_admin_user)):
    """Register new user (admin only)."""
    from ..models import UserRole
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail="Email already registered")
        res = await session.execute(select(UserModel).where(UserModel.username == user_data.username))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail="Username already taken")

        role = UserRole.VIEWER
        if user_data.role:
            try:
                role = UserRole(user_data.role)
            except ValueError:
                pass

        user = UserModel(
            email=user_data.email,
            username=user_data.username,
            hashed_password=get_password_hash(user_data.password),
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user
