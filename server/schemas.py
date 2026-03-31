"""Pydantic validation schemas for API endpoints"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime


# Metric Schemas
class MetricIn(BaseModel):
    """Schema for receiving metric data"""
    agent_id: str
    cpu_percent: Optional[float] = Field(None, ge=0, le=100)
    memory_percent: Optional[float] = Field(None, ge=0, le=100)
    disk_percent: Optional[float] = Field(None, ge=0, le=100)
    network_sent: Optional[float] = Field(None, ge=0)
    network_recv: Optional[float] = Field(None, ge=0)
    load_average_1: Optional[float] = None
    load_average_5: Optional[float] = None
    load_average_15: Optional[float] = None


class MetricOut(BaseModel):
    """Schema for returning metric data"""
    id: int
    agent_id: int
    cpu_percent: Optional[float]
    memory_percent: Optional[float]
    disk_percent: Optional[float]
    network_sent: Optional[float]
    network_recv: Optional[float]
    load_average_1: Optional[float]
    load_average_5: Optional[float]
    load_average_15: Optional[float]
    timestamp: datetime
    
    model_config = ConfigDict(from_attributes=True)


# User Schemas
class UserCreate(BaseModel):
    """Schema for user registration"""
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6)


class UserOut(BaseModel):
    """Schema for returning user data"""
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# Token Schemas
class Token(BaseModel):
    """Schema for token response"""
    access_token: str
    token_type: str
    expires_in: int


class TokenData(BaseModel):
    """Schema for token payload"""
    user_id: int
    username: str
    role: str


# Agent Schemas
class AgentCreateIn(BaseModel):
    """Schema for creating agent"""
    agent_id: str = Field(..., min_length=1, max_length=255)
    hostname: Optional[str] = None


class AgentOut(BaseModel):
    """Schema for returning agent data"""
    id: int
    agent_id: str
    hostname: Optional[str]
    last_seen: datetime
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# Alert Settings Schemas
class AgentSettingsIn(BaseModel):
    """Schema for configuring agent thresholds"""
    cpu_threshold: float = Field(80, ge=0, le=100)
    memory_threshold: float = Field(85, ge=0, le=100)
    disk_threshold: float = Field(90, ge=0, le=100)
    network_threshold: float = Field(1000, ge=0)


class AgentSettingsOut(BaseModel):
    """Schema for returning agent settings"""
    id: int
    agent_id: int
    cpu_threshold: float
    memory_threshold: float
    disk_threshold: float
    network_threshold: float
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# Alert Schemas
class AlertOut(BaseModel):
    """Schema for returning alert data"""
    id: int
    agent_id: int
    metric_type: str
    current_value: float
    threshold_value: float
    message: Optional[str]
    is_resolved: bool
    created_at: datetime
    resolved_at: Optional[datetime]
    
    model_config = ConfigDict(from_attributes=True)


# Health Schemas
class HealthResponse(BaseModel):
    """Schema for health check response"""
    status: str
    timestamp: datetime
    version: str = "1.0.0"
