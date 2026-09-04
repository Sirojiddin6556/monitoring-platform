from sqlalchemy import Column, Integer, String, JSON, DateTime, Boolean, Enum, ForeignKey, Index, Float
from sqlalchemy.orm import declarative_base
import datetime
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


class Organization(Base):
    __tablename__ = 'organizations'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    color = Column(String, default='#6c5ce7')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class UserOrganization(Base):
    """Привязка пользователей к организациям (многие-ко-многим)"""
    __tablename__ = 'user_organizations'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)


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
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True, index=True)
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


class AgentToken(Base):
    __tablename__ = 'agent_tokens'
    id = Column(Integer, primary_key=True, autoincrement=True)
    server_id = Column(String, ForeignKey('servers.id', ondelete='CASCADE'), nullable=False, index=True)
    token = Column(String, nullable=False, unique=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Website(Base):
    __tablename__ = 'websites'
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True, index=True)


class Metric(Base):
    __tablename__ = 'metrics'
    id = Column(Integer, primary_key=True, autoincrement=True)
    received_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    server_id = Column(String, nullable=True, index=True)
    metric_name = Column(String, nullable=True, index=True)
    payload = Column(JSON)

    __table_args__ = (
        Index('ix_metrics_server_time', 'server_id', 'received_at'),
    )


class Probe(Base):
    __tablename__ = 'probes'
    id = Column(Integer, primary_key=True, autoincrement=True)
    received_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    target_url = Column(String, nullable=True, index=True)
    website_id = Column(String, nullable=True, index=True)
    payload = Column(JSON)

    __table_args__ = (
        Index('ix_probes_website_time', 'website_id', 'received_at'),
    )


class WebsiteProtocolProbe(Base):
    __tablename__ = 'website_protocol_probes'
    id = Column(Integer, primary_key=True, autoincrement=True)
    website_id = Column(String, ForeignKey('websites.id', ondelete='CASCADE'), nullable=False)
    protocol = Column(String, nullable=False)   # http, https, icmp, tcp_443
    response_time = Column(Float, nullable=True)
    status = Column(String, nullable=False, default='unknown')
    checked_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    __table_args__ = (
        Index('ix_wpp_site_proto_time', 'website_id', 'protocol', 'checked_at'),
    )


class Log(Base):
    __tablename__ = 'logs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    received_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    server_id = Column(String, nullable=True, index=True)
    level = Column(String, nullable=True)
    payload = Column(JSON)


class Alert(Base):
    __tablename__ = 'alerts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    severity = Column(String, default='warning')  # critical, warning, info
    category = Column(String, default='system')  # system, website, service, docker, security
    target_type = Column(String, nullable=True)  # server, website, service, container
    target_id = Column(String, nullable=True, index=True)
    target_name = Column(String, nullable=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=True)
    metric_key = Column(String, nullable=True)
    metric_value = Column(String, nullable=True)
    threshold = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, index=True)

    __table_args__ = (
        Index('ix_alerts_active_severity', 'is_active', 'severity'),
    )


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


class TelegramBotUser(Base):
    """Пользователи, зарегистрировавшиеся через Telegram-бота (/start)"""
    __tablename__ = 'telegram_bot_users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    bot_id = Column(Integer, ForeignKey('telegram_bots.id', ondelete='CASCADE'), nullable=False)
    telegram_id = Column(String, nullable=False)
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True)
    is_active = Column(Boolean, default=True)
    notify_critical = Column(Boolean, default=True)
    notify_warning = Column(Boolean, default=True)
    notify_info = Column(Boolean, default=False)
    notify_categories = Column(JSON, default=list)  # пустой = все категории
    registered_at = Column(DateTime, default=datetime.datetime.utcnow)


class NotificationChannel(Base):
    __tablename__ = 'notification_channels'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    channel_type = Column(String, nullable=False)  # telegram, email, webhook, discord
    config = Column(JSON, nullable=False, default=dict)
    is_enabled = Column(Boolean, default=True)
    severity_filter = Column(String, default='all')  # all, critical, warning, info
    category_filter = Column(String, default='all')  # all, system, website, service, docker, security
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class NotificationRule(Base):
    __tablename__ = 'notification_rules'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    is_enabled = Column(Boolean, default=True)
    # Target scope
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True)
    target_type = Column(String, nullable=True)  # server, website, hypervisor, or null = all
    target_id = Column(String, nullable=True)  # specific target id or null = all of type
    # Criteria
    metric = Column(String, nullable=False)  # cpu, ram, disk, swap, ping, response_time, availability, ssl_expiry, service_status, container_status, custom
    condition = Column(String, default='gt')  # gt, lt, eq, neq
    threshold_value = Column(String, nullable=False)  # threshold value
    severity = Column(String, default='warning')  # critical, warning, info
    # Notification channel
    channel_id = Column(Integer, ForeignKey('notification_channels.id', ondelete='CASCADE'), nullable=True)
    # Cooldown (seconds between repeated notifications)
    cooldown = Column(Integer, default=300)
    last_triggered = Column(DateTime, nullable=True)
    trigger_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


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


# ============================================================
# Sprint 2: Refresh tokens (secure logout + token rotation)
# ============================================================

class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_revoked = Column(Boolean, default=False, nullable=False)
    device_info = Column(String, nullable=True)


# ============================================================
# Sprint 3: Maintenance Windows — suppress alerts during planned downtime
# ============================================================

class MaintenanceWindow(Base):
    __tablename__ = 'maintenance_windows'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    start_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=False)
    target_type = Column(String, nullable=True)   # server, website, all
    target_ids = Column(JSON, nullable=True)       # list of IDs; empty = all of type
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True)
    suppress_alerts = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        Index('ix_maintenance_windows_time', 'start_at', 'end_at'),
        Index('ix_maintenance_windows_active', 'is_active'),
    )


# ============================================================
# Sprint 3: Per-server alert thresholds (override global settings)
# ============================================================

class ServerAlertConfig(Base):
    __tablename__ = 'server_alert_configs'
    id = Column(Integer, primary_key=True, autoincrement=True)
    server_id = Column(String, ForeignKey('servers.id', ondelete='CASCADE'), nullable=False, unique=True)
    cpu_threshold = Column(Integer, nullable=True)    # None = use global setting
    ram_threshold = Column(Integer, nullable=True)
    disk_threshold = Column(Integer, nullable=True)
    swap_threshold = Column(Integer, nullable=True)
    ping_threshold = Column(Integer, nullable=True)
    alerts_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ============================================================
# Sprint 3: Incident Management
# ============================================================

class Incident(Base):
    __tablename__ = 'incidents'
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    severity = Column(String, nullable=False)  # critical, warning, info
    status = Column(String, nullable=False, default='open')  # open, acknowledged, resolved, closed
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True, index=True)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    alert_ids = Column(JSON, nullable=True)       # linked alert IDs
    assignee_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    opened_at = Column(DateTime, default=datetime.datetime.utcnow)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    resolution_note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index('ix_incidents_status', 'status'),
    )


class IncidentComment(Base):
    __tablename__ = 'incident_comments'
    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(Integer, ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ============================================================
# Sprint 3+4: SLA Records (computed hourly by Celery)
# ============================================================

class SLARecord(Base):
    __tablename__ = 'sla_records'
    id = Column(Integer, primary_key=True, autoincrement=True)
    target_type = Column(String, nullable=False)   # server, website
    target_id = Column(String, nullable=False)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    total_minutes = Column(Integer, nullable=False)
    downtime_minutes = Column(Integer, nullable=False, default=0)
    uptime_pct = Column(Float, nullable=True)
    checks_total = Column(Integer, nullable=False, default=0)
    checks_ok = Column(Integer, nullable=False, default=0)
    avg_response_ms = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        Index('ix_sla_records_target', 'target_type', 'target_id'),
        Index('ix_sla_records_period', 'period_start', 'period_end'),
    )


# ============================================================
# Sprint 4: Custom Dashboards
# ============================================================

class Dashboard(Base):
    __tablename__ = 'dashboards'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    org_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True)
    owner_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    is_public = Column(Boolean, default=False, nullable=False)
    layout = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class DashboardWidget(Base):
    __tablename__ = 'dashboard_widgets'
    id = Column(Integer, primary_key=True, autoincrement=True)
    dashboard_id = Column(Integer, ForeignKey('dashboards.id', ondelete='CASCADE'), nullable=False, index=True)
    widget_type = Column(String, nullable=False)  # metric_chart, uptime_bar, alert_list, server_status, website_status, stats_card
    title = Column(String, nullable=True)
    config = Column(JSON, nullable=True)
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    width = Column(Integer, default=4)
    height = Column(Integer, default=3)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
