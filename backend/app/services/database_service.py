"""Database Service: Isolated domain logic for PostgreSQL, Redis, backups and database discovery."""
import os
import glob
import logging
from typing import Dict, Any, List
import sqlalchemy as sa

from .. import db
from ..redis_client import get_redis
from ..core.state import SERVERS, AGENT_METRICS

logger = logging.getLogger("backend.services.database")

class DatabaseService:
    @staticmethod
    async def get_telemetry() -> Dict[str, Any]:
        """Collect deep telemetry for primary PostgreSQL, Redis broker, automated backups, and distributed DBs."""
        out = {
            'postgres_summary': None,
            'redis_summary': None,
            'backup_summary': None,
            'databases': []
        }

        # 1. PostgreSQL Engine Metrics
        try:
            async with db.get_session() as session:
                q_size = await session.execute(sa.text("""
                    SELECT datname, pg_size_pretty(pg_database_size(datname)) as size_pretty, pg_database_size(datname) as size_bytes
                    FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC
                """))
                db_sizes = [dict(r._mapping) for r in q_size.fetchall()]

                q_conn = await session.execute(sa.text("""
                    SELECT
                        count(*) as total_connections,
                        count(*) FILTER (WHERE state = 'active') as active_connections,
                        count(*) FILTER (WHERE state = 'idle') as idle_connections,
                        (SELECT setting::int FROM pg_settings WHERE name='max_connections') as max_connections
                    FROM pg_stat_activity
                """))
                conn_stats = dict(q_conn.fetchone()._mapping)

                q_cache = await session.execute(sa.text("""
                    SELECT
                        sum(blks_hit) as hit,
                        sum(blks_read) as read,
                        CASE WHEN sum(blks_hit + blks_read) = 0 THEN 100.0
                             ELSE round((sum(blks_hit)::numeric / sum(blks_hit + blks_read)) * 100, 2)
                        END as cache_hit_ratio
                    FROM pg_stat_database
                """))
                cache_stats = dict(q_cache.fetchone()._mapping)

                max_c = conn_stats.get('max_connections') or 100
                total_c = conn_stats.get('total_connections') or 0
                out['postgres_summary'] = {
                    'engine': 'PostgreSQL 15',
                    'host': '192.168.17.50:5432',
                    'status': 'healthy',
                    'total_connections': total_c,
                    'active_connections': conn_stats.get('active_connections', 0),
                    'idle_connections': conn_stats.get('idle_connections', 0),
                    'max_connections': max_c,
                    'connection_load_pct': round((total_c / max(1, max_c)) * 100, 1),
                    'cache_hit_ratio': float(cache_stats.get('cache_hit_ratio') or 99.0),
                    'databases': db_sizes,
                }
        except Exception as e:
            logger.error("Failed to collect PostgreSQL telemetry: %s", e)
            out['postgres_summary'] = {'status': 'error', 'error': str(e)}

        # 2. Redis Metrics
        try:
            r = await get_redis()
            if r:
                info = await r.info()
                out['redis_summary'] = {
                    'engine': f"Redis {info.get('redis_version', '7.x')}",
                    'host': '192.168.17.50:6379',
                    'status': 'healthy',
                    'used_memory_human': info.get('used_memory_human', '—'),
                    'used_memory_peak_human': info.get('used_memory_peak_human', '—'),
                    'connected_clients': info.get('connected_clients', 0),
                    'uptime_in_days': info.get('uptime_in_days', 0),
                    'role': 'Кэш сессий & Брокер Celery',
                }
            else:
                out['redis_summary'] = {'status': 'unavailable'}
        except Exception as e:
            logger.error("Failed to collect Redis telemetry: %s", e)
            out['redis_summary'] = {'status': 'error', 'error': str(e)}

        # 3. Backup Status
        backup_files = glob.glob('/backups/*.sql.gz') or glob.glob('/opt/monitoring-platform/backups/*.sql.gz')
        if backup_files:
            latest = max(backup_files, key=os.path.getmtime)
            mtime = os.path.getmtime(latest)
            size_bytes = os.path.getsize(latest)
            size_mb = round(size_bytes / (1024 * 1024), 1)
            out['backup_summary'] = {
                'latest_file': os.path.basename(latest),
                'latest_timestamp': mtime,
                'size_mb': size_mb,
                'total_backups': len(backup_files),
                'retention_days': 14,
                'schedule': '0 3 * * * (Ежедневно в 03:00)',
                'status': 'healthy'
            }
        else:
            out['backup_summary'] = {
                'status': 'configured',
                'schedule': '0 3 * * * (Ежедневно в 03:00)',
                'retention_days': 14
            }

        # 4. Aggregated Database Instances
        instances = []
        if out['postgres_summary'] and out['postgres_summary'].get('status') == 'healthy':
            for d in out['postgres_summary'].get('databases', []):
                instances.append({
                    'name': d.get('datname'),
                    'type': 'PostgreSQL',
                    'version': 'PostgreSQL 15',
                    'host': '192.168.17.50',
                    'port': 5432,
                    'server_name': 'Monitoring-platform',
                    'server_id': 'Monitoring-platform',
                    'status': 'running',
                    'size_pretty': d.get('size_pretty'),
                    'size_bytes': d.get('size_bytes'),
                    'connections': out['postgres_summary'].get('active_connections'),
                    'source': 'PostgreSQL Engine',
                })

        if out['redis_summary'] and out['redis_summary'].get('status') == 'healthy':
            instances.append({
                'name': 'Redis In-Memory',
                'type': 'Redis',
                'version': out['redis_summary'].get('engine'),
                'host': '192.168.17.50',
                'port': 6379,
                'server_name': 'Monitoring-platform',
                'server_id': 'Monitoring-platform',
                'status': 'running',
                'memory_used': out['redis_summary'].get('used_memory_human'),
                'clients': out['redis_summary'].get('connected_clients'),
                'source': 'Redis Service',
            })

        for s in SERVERS:
            agent = AGENT_METRICS.get(s['id'])
            if not agent:
                continue
            containers = agent.get('docker_containers') or []
            for c in containers:
                img = (c.get('image') or '').lower()
                name = (c.get('name') or '').lower()
                if any(k in img or k in name for k in ('postgres', 'redis', 'mysql', 'mariadb', 'mongo', '-db')):
                    if s['id'] == 'Monitoring-platform' and ('infrastructure-db-postgres' in name or 'infrastructure-redis' in name):
                        continue
                    db_type = 'PostgreSQL' if 'postgres' in img or 'postgres' in name else 'Redis' if 'redis' in img else 'Database'
                    instances.append({
                        'name': c.get('name'),
                        'type': db_type,
                        'version': c.get('image'),
                        'host': s.get('host', '—'),
                        'port': 5432 if db_type == 'PostgreSQL' else 6379 if db_type == 'Redis' else '—',
                        'server_name': s.get('name', s['id']),
                        'server_id': s['id'],
                        'status': c.get('status', 'running'),
                        'cpu_pct': c.get('cpu_percent'),
                        'memory_mb': c.get('mem_mb'),
                        'source': 'Docker Контейнер',
                    })

        out['databases'] = instances
        return out
