from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List
from enum import Enum
import ipaddress
from urllib.parse import urlparse


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


# Auth schemas
class UserRegister(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_.-]+$')
    password: str = Field(..., min_length=8, max_length=72)
    role: Optional[str] = None


class UserLogin(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
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
    email: Optional[str] = Field(default=None, max_length=254)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


# Server schemas
class ServerCreate(BaseModel):
    id: str = Field(..., min_length=1)
    name: str
    host: Optional[str] = None
    org_id: Optional[int] = None
    monitor_type: Optional[str] = 'agent'  # agent, ssh, winrm, ping_only
    ssh_user: Optional[str] = None
    ssh_port: Optional[int] = 22
    ssh_password: Optional[str] = None
    ssh_key_path: Optional[str] = None
    winrm_user: Optional[str] = None
    winrm_password: Optional[str] = None
    winrm_port: Optional[int] = 5985
    winrm_use_ssl: Optional[bool] = False
    create_agent_token: Optional[bool] = False


class ServerResponse(BaseModel):
    id: str
    name: str
    host: Optional[str]
    monitor_type: Optional[str] = 'agent'
    
    class Config:
        orm_mode = True


class AgentTokenCreate(BaseModel):
    server_id: str


class AgentTokenResponse(BaseModel):
    id: int
    server_id: str
    token: str
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True


# Website schemas
class WebsiteCreate(BaseModel):
    id: str = Field(..., min_length=1)
    name: str
    url: str
    org_id: Optional[int] = None

    @validator('url')
    @classmethod
    def validate_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in ('http', 'https'):
            raise ValueError('URL must start with http:// or https://')
        host = parsed.hostname
        if not host:
            raise ValueError('URL must have a valid hostname')
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise ValueError('URL must point to a public host, not a private/internal address')
        except ValueError as exc:
            if 'URL must' in str(exc):
                raise
            # hostname — not an IP literal, that's fine
        return v


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


# Organization schemas
class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = '#6c5ce7'


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class OrganizationResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True


class MessageResponse(BaseModel):
    message: str


class SettingsUpdate(BaseModel):
    settings: dict  # {"key": "value", ...}


# Generic response
class MessageResponse(BaseModel):
    message: str
    detail: Optional[dict] = None


# Notification channel schemas
class NotificationChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    channel_type: str = Field(..., pattern=r'^(telegram|email|webhook|discord)$')
    config: dict = Field(default_factory=dict)
    is_enabled: bool = True
    severity_filter: str = 'all'
    category_filter: str = 'all'


class NotificationChannelUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    is_enabled: Optional[bool] = None
    severity_filter: Optional[str] = None
    category_filter: Optional[str] = None


class NotificationChannelResponse(BaseModel):
    id: int
    name: str
    channel_type: str
    config: dict
    is_enabled: bool
    severity_filter: str
    category_filter: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True


# Notification rule schemas
class NotificationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    is_enabled: bool = True
    org_id: Optional[int] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    metric: str = Field(..., min_length=1)
    condition: str = Field(default='gt', pattern=r'^(gt|lt|eq|neq)$')
    threshold_value: str = Field(...)
    severity: str = Field(default='warning', pattern=r'^(critical|warning|info)$')
    channel_id: Optional[int] = None
    cooldown: int = Field(default=300, ge=0)


class NotificationRuleUpdate(BaseModel):
    name: Optional[str] = None
    is_enabled: Optional[bool] = None
    org_id: Optional[int] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    metric: Optional[str] = None
    condition: Optional[str] = None
    threshold_value: Optional[str] = None
    severity: Optional[str] = None
    channel_id: Optional[int] = None
    cooldown: Optional[int] = None


# Dynamic Agent payloads
class AgentMetricsPayload(BaseModel):
    service: str | None = None
    agent_version: str | None = None
    timestamp: int | None = None
    server_id: str | None = None
    metric: str | None = None
    status: str | None = None
    warmup: bool | None = None
    metrics: dict | None = None
    system_info: dict | None = None
    cpu_detail: dict | None = None
    ram_detail: dict | None = None
    swap_detail: dict | None = None
    disks: list | None = None
    disk_io: dict | None = None
    network_interfaces: list | None = None
    network_connections: dict | None = None
    processes_detail: dict | None = None
    services: list | None = None
    docker_containers: list | None = None
    virtual_machines: list | None = None
    recent_logs: dict | None = None
    security: dict | None = None
    temperatures: list | None = None
    battery: dict | None = None

    class Config:
        extra = "allow"


class ProbePayload(BaseModel):
    target: str | None = None
    status: str | None = None
    status_code: int | None = None
    response_time: float | None = None
    timestamp: int | None = None

    class Config:
        extra = "allow"


class LogPayload(BaseModel):
    level: str | None = None
    message: str | None = None
    timestamp: int | None = None
    server_id: str | None = None

    class Config:
        extra = "allow"
