"""initial schema with normalized metrics and new business models

Revision ID: 0001
Revises:
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('organizations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table('users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('username'),
    )
    op.create_index('ix_users_email', 'users', ['email'])

    op.create_table('user_organizations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('org_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('servers',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('host', sa.String(), nullable=True),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.Column('monitor_type', sa.String(), nullable=True),
        sa.Column('ssh_user', sa.String(), nullable=True),
        sa.Column('ssh_port', sa.Integer(), nullable=True),
        sa.Column('ssh_password', sa.String(), nullable=True),
        sa.Column('ssh_key_path', sa.String(), nullable=True),
        sa.Column('winrm_user', sa.String(), nullable=True),
        sa.Column('winrm_password', sa.String(), nullable=True),
        sa.Column('winrm_port', sa.Integer(), nullable=True),
        sa.Column('winrm_use_ssl', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_servers_org_id', 'servers', ['org_id'])

    op.create_table('agent_tokens',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('server_id', sa.String(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['server_id'], ['servers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token'),
    )
    op.create_index('ix_agent_tokens_server_id', 'agent_tokens', ['server_id'])
    op.create_index('ix_agent_tokens_token', 'agent_tokens', ['token'])

    op.create_table('websites',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_websites_org_id', 'websites', ['org_id'])

    # Normalized metrics: server_id + metric_name as indexed columns
    op.create_table('metrics',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('received_at', sa.DateTime(), nullable=True),
        sa.Column('server_id', sa.String(), nullable=True),
        sa.Column('metric_name', sa.String(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_metrics_received_at', 'metrics', ['received_at'])
    op.create_index('ix_metrics_server_id', 'metrics', ['server_id'])
    op.create_index('ix_metrics_server_time', 'metrics', ['server_id', 'received_at'])

    # Normalized probes: target_url + website_id as indexed columns
    op.create_table('probes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('received_at', sa.DateTime(), nullable=True),
        sa.Column('target_url', sa.String(), nullable=True),
        sa.Column('website_id', sa.String(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_probes_received_at', 'probes', ['received_at'])
    op.create_index('ix_probes_target_url', 'probes', ['target_url'])
    op.create_index('ix_probes_website_time', 'probes', ['website_id', 'received_at'])

    # Normalized logs: server_id + level as indexed columns
    op.create_table('logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('received_at', sa.DateTime(), nullable=True),
        sa.Column('server_id', sa.String(), nullable=True),
        sa.Column('level', sa.String(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_logs_received_at', 'logs', ['received_at'])
    op.create_index('ix_logs_server_id', 'logs', ['server_id'])

    op.create_table('alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('target_type', sa.String(), nullable=True),
        sa.Column('target_id', sa.String(), nullable=True),
        sa.Column('target_name', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.String(), nullable=True),
        sa.Column('metric_key', sa.String(), nullable=True),
        sa.Column('metric_value', sa.String(), nullable=True),
        sa.Column('threshold', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_alerts_target_id', 'alerts', ['target_id'])
    op.create_index('ix_alerts_is_active', 'alerts', ['is_active'])
    op.create_index('ix_alerts_active_severity', 'alerts', ['is_active', 'severity'])

    op.create_table('settings',
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('key'),
    )

    op.create_table('telegram_bots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('chat_id', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('last_check', sa.DateTime(), nullable=True),
        sa.Column('last_status', sa.String(), nullable=True),
        sa.Column('last_username', sa.String(), nullable=True),
        sa.Column('last_info', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('telegram_bot_users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('bot_id', sa.Integer(), nullable=False),
        sa.Column('telegram_id', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('first_name', sa.String(), nullable=True),
        sa.Column('last_name', sa.String(), nullable=True),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('notify_critical', sa.Boolean(), nullable=True),
        sa.Column('notify_warning', sa.Boolean(), nullable=True),
        sa.Column('notify_info', sa.Boolean(), nullable=True),
        sa.Column('notify_categories', sa.JSON(), nullable=True),
        sa.Column('registered_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['bot_id'], ['telegram_bots.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('notification_channels',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('channel_type', sa.String(), nullable=False),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=True),
        sa.Column('severity_filter', sa.String(), nullable=True),
        sa.Column('category_filter', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('notification_rules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=True),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.Column('target_type', sa.String(), nullable=True),
        sa.Column('target_id', sa.String(), nullable=True),
        sa.Column('metric', sa.String(), nullable=False),
        sa.Column('condition', sa.String(), nullable=True),
        sa.Column('threshold_value', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('channel_id', sa.Integer(), nullable=True),
        sa.Column('cooldown', sa.Integer(), nullable=True),
        sa.Column('last_triggered', sa.DateTime(), nullable=True),
        sa.Column('trigger_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['channel_id'], ['notification_channels.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('kube_clusters',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('api_url', sa.String(), nullable=False),
        sa.Column('token', sa.String(), nullable=True),
        sa.Column('kubeconfig', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('last_check', sa.DateTime(), nullable=True),
        sa.Column('last_status', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('hypervisors',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('hv_type', sa.String(), nullable=False),
        sa.Column('api_url', sa.String(), nullable=True),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('password', sa.String(), nullable=True),
        sa.Column('token', sa.String(), nullable=True),
        sa.Column('server_id', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('last_check', sa.DateTime(), nullable=True),
        sa.Column('last_status', sa.String(), nullable=True),
        sa.Column('last_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # Sprint 2: Refresh tokens (secure logout + token rotation)
    op.create_table('refresh_tokens',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('device_info', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index('ix_refresh_tokens_user_id', 'refresh_tokens', ['user_id'])
    op.create_index('ix_refresh_tokens_token_hash', 'refresh_tokens', ['token_hash'])

    # Sprint 3: Maintenance windows — suppress alerts during planned downtime
    op.create_table('maintenance_windows',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('start_at', sa.DateTime(), nullable=False),
        sa.Column('end_at', sa.DateTime(), nullable=False),
        sa.Column('target_type', sa.String(), nullable=True),
        sa.Column('target_ids', sa.JSON(), nullable=True),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.Column('suppress_alerts', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_maintenance_windows_active', 'maintenance_windows', ['is_active'])
    op.create_index('ix_maintenance_windows_time', 'maintenance_windows', ['start_at', 'end_at'])

    # Sprint 3: Per-server alert thresholds (override global settings)
    op.create_table('server_alert_configs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('server_id', sa.String(), nullable=False),
        sa.Column('cpu_threshold', sa.Integer(), nullable=True),
        sa.Column('ram_threshold', sa.Integer(), nullable=True),
        sa.Column('disk_threshold', sa.Integer(), nullable=True),
        sa.Column('swap_threshold', sa.Integer(), nullable=True),
        sa.Column('ping_threshold', sa.Integer(), nullable=True),
        sa.Column('alerts_enabled', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['server_id'], ['servers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('server_id'),
    )

    # Sprint 3: Incident management
    op.create_table('incidents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default="'open'"),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.Column('target_type', sa.String(), nullable=True),
        sa.Column('target_id', sa.String(), nullable=True),
        sa.Column('alert_ids', sa.JSON(), nullable=True),
        sa.Column('assignee_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('opened_at', sa.DateTime(), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('resolution_note', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_incidents_status', 'incidents', ['status'])
    op.create_index('ix_incidents_org_id', 'incidents', ['org_id'])

    op.create_table('incident_comments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('content', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_incident_comments_incident_id', 'incident_comments', ['incident_id'])

    # Sprint 3+4: SLA records computed hourly by Celery
    op.create_table('sla_records',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('target_type', sa.String(), nullable=False),
        sa.Column('target_id', sa.String(), nullable=False),
        sa.Column('period_start', sa.DateTime(), nullable=False),
        sa.Column('period_end', sa.DateTime(), nullable=False),
        sa.Column('total_minutes', sa.Integer(), nullable=False),
        sa.Column('downtime_minutes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('uptime_pct', sa.Float(), nullable=True),
        sa.Column('checks_total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('checks_ok', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_response_ms', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sla_records_target', 'sla_records', ['target_type', 'target_id'])
    op.create_index('ix_sla_records_period', 'sla_records', ['period_start', 'period_end'])

    # Sprint 4: Custom dashboards
    op.create_table('dashboards',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('org_id', sa.Integer(), nullable=True),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('layout', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('dashboard_widgets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('dashboard_id', sa.Integer(), nullable=False),
        sa.Column('widget_type', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('position_x', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('position_y', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('width', sa.Integer(), nullable=True, server_default='4'),
        sa.Column('height', sa.Integer(), nullable=True, server_default='3'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboards.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dashboard_widgets_dashboard_id', 'dashboard_widgets', ['dashboard_id'])


def downgrade() -> None:
    op.drop_table('dashboard_widgets')
    op.drop_table('dashboards')
    op.drop_table('sla_records')
    op.drop_table('incident_comments')
    op.drop_table('incidents')
    op.drop_table('server_alert_configs')
    op.drop_table('maintenance_windows')
    op.drop_table('refresh_tokens')
    op.drop_table('hypervisors')
    op.drop_table('kube_clusters')
    op.drop_table('notification_rules')
    op.drop_table('notification_channels')
    op.drop_table('telegram_bot_users')
    op.drop_table('telegram_bots')
    op.drop_table('settings')
    op.drop_table('alerts')
    op.drop_table('logs')
    op.drop_table('probes')
    op.drop_table('metrics')
    op.drop_table('websites')
    op.drop_table('agent_tokens')
    op.drop_table('servers')
    op.drop_table('user_organizations')
    op.drop_table('users')
    op.drop_table('organizations')
