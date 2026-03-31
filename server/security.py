"""Security utilities - authentication, JWT, password hashing, RBAC"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Annotated
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from .database import get_db
from .models import User
from .schemas import TokenData

# Password hashing configuration
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

# Role hierarchy
ROLE_HIERARCHY = {
    'observer': 0,
    'user': 1,
    'admin': 2
}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify hashed password"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({'exp': expire})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> TokenData:
    """Verify and decode JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get('user_id')
        username = payload.get('username')
        role = payload.get('role')
        
        if user_id is None or username is None or role is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid token',
                headers={'WWW-Authenticate': 'Bearer'},
            )
        
        return TokenData(user_id=user_id, username=username, role=role)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Token expired',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid token',
            headers={'WWW-Authenticate': 'Bearer'},
        )


def authenticate_user(username: str, password: str, db: Session) -> Optional[User]:
    """Authenticate user by username/password"""
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token"""
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or missing token',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    
    token = authorization.split(' ')[1]
    token_data = verify_token(token)
    
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='User not found or inactive'
        )
    
    return user


def require_role(required_role: str):
    """Dependency for role-based access control"""
    def check_role(current_user: User = Depends(get_current_user)) -> User:
        if ROLE_HIERARCHY.get(current_user.role, -1) < ROLE_HIERARCHY.get(required_role, -1):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Role {required_role} required'
            )
        return current_user
    
    return check_role
