from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


# Auth schemas
class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=72)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=72)


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    
    class Config:
        orm_mode = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


# Server schemas
class ServerCreate(BaseModel):
    id: str = Field(..., min_length=1)
    name: str
    host: Optional[str] = None
    monitor_type: Optional[str] = 'agent'  # agent, ssh, winrm, ping_only
    ssh_user: Optional[str] = None
    ssh_port: Optional[int] = 22
    ssh_password: Optional[str] = None
    ssh_key_path: Optional[str] = None
    winrm_user: Optional[str] = None
    winrm_password: Optional[str] = None
    winrm_port: Optional[int] = 5985
    winrm_use_ssl: Optional[bool] = False


class ServerResponse(BaseModel):
    id: str
    name: str
    host: Optional[str]
    monitor_type: Optional[str] = 'agent'
    
    class Config:
        orm_mode = True


# Website schemas
class WebsiteCreate(BaseModel):
    id: str = Field(..., min_length=1)
    name: str
    url: str


class WebsiteResponse(BaseModel):
    id: str
    name: str
    url: str
    
    class Config:
        orm_mode = True


# Settings schemas
class SettingItem(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

    class Config:
        orm_mode = True


class SettingsUpdate(BaseModel):
    settings: dict  # {"key": "value", ...}


# Generic response
class MessageResponse(BaseModel):
    message: str
    detail: Optional[dict] = None
