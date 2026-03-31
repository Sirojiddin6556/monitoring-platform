"""SQLAlchemy ORM models for the monitoring system"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from .database import Base


class Tenant(Base):
    """Represents an organization/customer"""
    __tablename__ = 'tenants'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    agents = relationship('Agent', back_populates='tenant', cascade='all, delete-orphan')
    users = relationship('User', back_populates='tenant', cascade='all, delete-orphan')


class Agent(Base):
    """Represents a monitoring agent deployed on a client machine"""
    __tablename__ = 'agents'
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False, index=True)
    agent_id = Column(String(255), unique=True, index=True, nullable=False)
    hostname = Column(String(255), nullable=True)
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    tenant = relationship('Tenant', back_populates='agents')
    metrics = relationship('Metric', back_populates='agent', cascade='all, delete-orphan')
    alerts = relationship('Alert', back_populates='agent', cascade='all, delete-orphan')
    settings = relationship('AgentSettings', back_populates='agent', cascade='all, delete-orphan', uselist=False)


class Metric(Base):
    """Represents a single metric measurement"""
    __tablename__ = 'metrics'
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey('agents.id'), nullable=False, index=True)
    cpu_percent = Column(Float, nullable=True)
    memory_percent = Column(Float, nullable=True)
    disk_percent = Column(Float, nullable=True)
    network_sent = Column(Float, nullable=True)
    network_recv = Column(Float, nullable=True)
    load_average_1 = Column(Float, nullable=True)
    load_average_5 = Column(Float, nullable=True)
    load_average_15 = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    agent = relationship('Agent', back_populates='metrics')


class Alert(Base):
    """Represents a threshold breach alert"""
    __tablename__ = 'alerts'
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey('agents.id'), nullable=False, index=True)
    metric_type = Column(String(50), nullable=False)  # 'cpu', 'memory', 'disk', 'network'
    current_value = Column(Float, nullable=False)
    threshold_value = Column(Float, nullable=False)
    message = Column(String(512))
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    resolved_at = Column(DateTime, nullable=True)
    
    agent = relationship('Agent', back_populates='alerts')


class AgentSettings(Base):
    """Configurable thresholds per agent"""
    __tablename__ = 'agent_settings'
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey('agents.id'), nullable=False, unique=True, index=True)
    cpu_threshold = Column(Float, default=80)
    memory_threshold = Column(Float, default=85)
    disk_threshold = Column(Float, default=90)
    network_threshold = Column(Float, default=1000)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    agent = relationship('Agent', back_populates='settings')


class User(Base):
    """Dashboard user with role-based access control"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False, index=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default='user')  # 'observer', 'user', 'admin'
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    tenant = relationship('Tenant', back_populates='users')
