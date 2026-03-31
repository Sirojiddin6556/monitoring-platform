from sqlalchemy import Column, Integer, String, JSON, DateTime, Boolean, Enum
from sqlalchemy.orm import declarative_base
import datetime
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Server(Base):
    __tablename__ = 'servers'
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    host = Column(String, nullable=True)
    # Remote monitoring fields
    monitor_type = Column(String, default='agent')  # agent, ssh, winrm, ping_only
    ssh_user = Column(String, nullable=True)
    ssh_port = Column(Integer, default=22)
    ssh_password = Column(String, nullable=True)
    ssh_key_path = Column(String, nullable=True)
    winrm_user = Column(String, nullable=True)
    winrm_password = Column(String, nullable=True)
    winrm_port = Column(Integer, default=5985)
    winrm_use_ssl = Column(Boolean, default=False)


class Website(Base):
    __tablename__ = 'websites'
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)


class Metric(Base):
    __tablename__ = 'metrics'
    id = Column(Integer, primary_key=True, autoincrement=True)
    received_at = Column(DateTime, default=datetime.datetime.utcnow)
    payload = Column(JSON)


class Probe(Base):
    __tablename__ = 'probes'
    id = Column(Integer, primary_key=True, autoincrement=True)
    received_at = Column(DateTime, default=datetime.datetime.utcnow)
    payload = Column(JSON)


class Log(Base):
    __tablename__ = 'logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    received_at = Column(DateTime, default=datetime.datetime.utcnow)
    payload = Column(JSON)


class Alert(Base):
    __tablename__ = 'alerts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    severity = Column(String, default='warning')  # critical, warning, info
    category = Column(String, default='system')  # system, website, service, docker, security
    target_type = Column(String, nullable=True)  # server, website, service, container
    target_id = Column(String, nullable=True)
    target_name = Column(String, nullable=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=True)
    metric_key = Column(String, nullable=True)
    metric_value = Column(String, nullable=True)
    threshold = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)


class Setting(Base):
    __tablename__ = 'settings'
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    description = Column(String, nullable=True)


class TelegramBot(Base):
    __tablename__ = 'telegram_bots'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    token = Column(String, nullable=False)
    chat_id = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_check = Column(DateTime, nullable=True)
    last_status = Column(String, default='unknown')  # online, offline, error, unknown
    last_username = Column(String, nullable=True)
    last_info = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class KubeCluster(Base):
    __tablename__ = 'kube_clusters'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    api_url = Column(String, nullable=False)
    token = Column(String, nullable=True)
    kubeconfig = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_check = Column(DateTime, nullable=True)
    last_status = Column(String, default='unknown')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Hypervisor(Base):
    __tablename__ = 'hypervisors'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    hv_type = Column(String, nullable=False)  # hyperv, proxmox, vmware
    api_url = Column(String, nullable=True)  # for proxmox/vmware
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    token = Column(String, nullable=True)  # API token
    server_id = Column(String, nullable=True)  # link to agent server (for hyperv)
    is_active = Column(Boolean, default=True)
    last_check = Column(DateTime, nullable=True)
    last_status = Column(String, default='unknown')  # online, offline, error
    last_data = Column(JSON, nullable=True)  # cached VM list
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
