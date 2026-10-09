"""Server Service: Isolated domain business logic for servers, agent tokens, and metrics."""
import time
import secrets
import logging
from typing import Dict, Any, List, Optional
import sqlalchemy as sa
from sqlalchemy import select, func
from fastapi import HTTPException

from .. import db
from ..crypto import encrypt_field, decrypt_field
from ..models import Server as ServerModel, AgentToken as AgentTokenModel, Organization as OrganizationModel
from ..schemas import ServerCreate
from ..core.state import SERVERS, AGENT_METRICS, METRICS_STORE, APP_SETTINGS

logger = logging.getLogger("backend.services.server")

class ServerService:
    @staticmethod
    async def list_servers(user_org_ids: Optional[List[int]] = None) -> Dict[str, Any]:
        """List all monitored servers with realtime telemetry, filtered by organization access."""
        server_org_map = {}
        active_token_counts = {}

        async with db.get_session() as session:
            res = await session.execute(select(ServerModel))
            db_servers = res.scalars().all()
            existing_ids = {s['id'] for s in SERVERS}
            for srv in db_servers:
                server_org_map[srv.id] = getattr(srv, 'org_id', None)
                if srv.id not in existing_ids:
                    SERVERS.append({
                        'id': srv.id,
                        'name': srv.name,
                        'host': srv.host,
                        'org_id': getattr(srv, 'org_id', None),
                        'monitor_type': getattr(srv, 'monitor_type', 'agent') or 'agent',
                        'ssh_user': getattr(srv, 'ssh_user', None),
                        'ssh_port': getattr(srv, 'ssh_port', 22),
                        'ssh_password': decrypt_field(getattr(srv, 'ssh_password', None)),
                        'ssh_key_path': getattr(srv, 'ssh_key_path', None),
                        'winrm_user': getattr(srv, 'winrm_user', None),
                        'winrm_password': decrypt_field(getattr(srv, 'winrm_password', None)),
                        'winrm_port': getattr(srv, 'winrm_port', 5985),
                        'winrm_use_ssl': getattr(srv, 'winrm_use_ssl', False),
                    })

            res2 = await session.execute(
                select(AgentTokenModel.server_id, func.count())
                .where(AgentTokenModel.is_active == True)
                .group_by(AgentTokenModel.server_id)
            )
            active_token_counts = {row[0]: row[1] for row in res2.all()}

        servers_out = []
        now_ts = int(time.time())
        agent_fresh_ttl = int(APP_SETTINGS.get('agent_fresh_ttl', '90'))

        for s in SERVERS:
            oid = s.get('org_id') or server_org_map.get(s['id'])
            if user_org_ids is not None:
                if oid is None or oid not in user_org_ids:
                    continue

            status_val = 'unknown'
            last_ping = None
            last_metrics = None

            for m in reversed(METRICS_STORE[-500:]):
                payload = m.get('payload', {})
                if payload.get('server_id') == s['id']:
                    status_val = payload.get('status', 'ok')
                    last_ping = payload.get('value')
                    last_metrics = payload.get('metrics')
                    break

            # If agent monitor, check agent heartbeat freshness
            if s.get('monitor_type', 'agent') == 'agent':
                agent_data = AGENT_METRICS.get(s['id']) or {}
                agent_ts = int(agent_data.get('timestamp') or 0)
                if (now_ts - agent_ts) > agent_fresh_ttl:
                    status_val = 'down'

            _agent_full = AGENT_METRICS.get(s['id'])
            _agent_light = {
                k: v for k, v in (_agent_full or {}).items()
                if k not in ('recent_logs', 'processes_detail', 'docker_containers', 'virtual_machines', 'services')
            } or None

            servers_out.append({
                'id': s['id'],
                'name': s['name'],
                'host': s.get('host'),
                'org_id': oid,
                'monitor_type': s.get('monitor_type', 'agent'),
                'status': status_val,
                'last_ping': last_ping,
                'last_metrics': last_metrics,
                'agent_data': _agent_light,
                'agent_key_count': active_token_counts.get(s['id'], 0),
            })

        return {'servers': servers_out}

    @staticmethod
    def get_server_detail(server_id: str) -> Dict[str, Any]:
        """Return comprehensive hardware, network, process, container, and log telemetry."""
        agent = AGENT_METRICS.get(server_id)
        if not agent:
            return {'detail': None, 'message': 'No agent data available'}
        return {
            'detail': {
                'system_info': agent.get('system_info'),
                'cpu_detail': agent.get('cpu_detail'),
                'ram_detail': agent.get('ram_detail'),
                'swap_detail': agent.get('swap_detail'),
                'disks': agent.get('disks'),
                'disk_io': agent.get('disk_io'),
                'network_interfaces': agent.get('network_interfaces'),
                'network_connections': agent.get('network_connections'),
                'temperatures': agent.get('temperatures'),
                'processes_detail': agent.get('processes_detail'),
                'services': agent.get('services'),
                'docker_containers': agent.get('docker_containers'),
                'recent_logs': agent.get('recent_logs'),
                'security': agent.get('security'),
                'databases': agent.get('databases'),
                'network_equipment': agent.get('network_equipment'),
                'ssl_certificates': agent.get('ssl_certificates'),
                'timestamp': agent.get('timestamp'),
            }
        }

    @staticmethod
    async def create_server(data: ServerCreate) -> Dict[str, Any]:
        """Create and register a new server."""
        for s in SERVERS:
            if s['id'] == data.id:
                raise HTTPException(status_code=400, detail='Server with this ID already exists')

        async with db.get_session() as session:
            res = await session.execute(select(ServerModel).where(ServerModel.id == data.id))
            if res.scalars().first():
                raise HTTPException(status_code=400, detail='Server with this ID already exists')

            server = ServerModel(
                id=data.id,
                name=data.name,
                host=data.host,
                org_id=data.org_id,
                monitor_type=data.monitor_type or 'agent',
                ssh_user=data.ssh_user,
                ssh_port=data.ssh_port or 22,
                ssh_password=encrypt_field(data.ssh_password),
                ssh_key_path=data.ssh_key_path,
                winrm_user=data.winrm_user,
                winrm_password=encrypt_field(data.winrm_password),
                winrm_port=data.winrm_port or 5985,
                winrm_use_ssl=data.winrm_use_ssl or False,
            )
            session.add(server)
            await session.commit()

        new_server = {
            'id': data.id,
            'name': data.name,
            'host': data.host,
            'org_id': data.org_id,
            'monitor_type': data.monitor_type or 'agent',
            'ssh_user': data.ssh_user,
            'ssh_port': data.ssh_port or 22,
            'ssh_key_path': data.ssh_key_path,
            'winrm_user': data.winrm_user,
            'winrm_port': data.winrm_port or 5985,
            'winrm_use_ssl': data.winrm_use_ssl or False,
        }
        SERVERS.append(new_server)

        response = {
            'id': data.id,
            'name': data.name,
            'host': data.host,
            'org_id': data.org_id,
            'monitor_type': data.monitor_type or 'agent'
        }

        if data.create_agent_token:
            token_value = secrets.token_urlsafe(32)
            async with db.get_session() as session:
                key = AgentTokenModel(server_id=data.id, token=token_value, is_active=True)
                session.add(key)
                await session.commit()
                await session.refresh(key)
            response['agent_token'] = token_value

        return response

    @staticmethod
    async def delete_server(server_id: str) -> Dict[str, str]:
        """Delete server from persistence and in-memory stores."""
        async with db.get_session() as session:
            res = await session.execute(select(ServerModel).where(ServerModel.id == server_id))
            server = res.scalars().first()
            if not server:
                raise HTTPException(status_code=404, detail='Server not found')
            await session.delete(server)
            await session.commit()

        SERVERS[:] = [s for s in SERVERS if s['id'] != server_id]
        AGENT_METRICS.pop(server_id, None)
        return {'message': 'Server deleted'}

    @staticmethod
    def get_server_metrics(server_id: str, limit: int = 500, from_ts: Optional[int] = None, to_ts: Optional[int] = None) -> Dict[str, Any]:
        """Retrieve recent ring-buffer metrics for a given server."""
        limit = max(1, min(limit, 1000))
        if from_ts is not None and to_ts is not None and from_ts > to_ts:
            raise HTTPException(status_code=400, detail='from_ts must be less than or equal to to_ts')

        items = [m for m in METRICS_STORE if m.get('payload', {}).get('server_id') == server_id]
        if from_ts is not None:
            items = [m for m in items if m.get('received_at', 0) >= from_ts]
        if to_ts is not None:
            items = [m for m in items if m.get('received_at', 0) <= to_ts]

        return {'metrics': items[-limit:]}

    @staticmethod
    async def list_agent_keys(server_id: str) -> List[Any]:
        """List active agent authentication keys for a server."""
        async with db.get_session() as session:
            server = await session.get(ServerModel, server_id)
            if not server:
                raise HTTPException(status_code=404, detail='Server not found')
            res = await session.execute(
                select(AgentTokenModel)
                .where(AgentTokenModel.server_id == server_id)
                .order_by(AgentTokenModel.created_at.desc())
            )
            return res.scalars().all()

    @staticmethod
    async def create_agent_key(server_id: str) -> Any:
        """Create a new agent authentication key."""
        async with db.get_session() as session:
            server = await session.get(ServerModel, server_id)
            if not server:
                raise HTTPException(status_code=404, detail='Server not found')
            token_value = secrets.token_urlsafe(32)
            key = AgentTokenModel(server_id=server_id, token=token_value, is_active=True)
            session.add(key)
            await session.commit()
            await session.refresh(key)
            return key

    @staticmethod
    async def revoke_agent_key(server_id: str, key_id: int) -> Dict[str, str]:
        """Revoke an agent authentication key."""
        async with db.get_session() as session:
            server = await session.get(ServerModel, server_id)
            if not server:
                raise HTTPException(status_code=404, detail='Server not found')
            token = await session.get(AgentTokenModel, key_id)
            if not token or token.server_id != server_id:
                raise HTTPException(status_code=404, detail='Agent key not found for this server')
            token.is_active = False
            await session.commit()
        return {'message': 'revoked'}

    @staticmethod
    async def assign_server_to_org(server_id: str, org_id: Optional[int]) -> Dict[str, str]:
        """Assign or remove server from an organization."""
        async with db.get_session() as session:
            res = await session.execute(select(ServerModel).where(ServerModel.id == server_id))
            server = res.scalars().first()
            if not server:
                raise HTTPException(status_code=404, detail='Server not found')
            if org_id is not None:
                org_res = await session.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
                if not org_res.scalars().first():
                    raise HTTPException(status_code=404, detail='Organization not found')
            server.org_id = org_id
            await session.commit()

        for s in SERVERS:
            if s['id'] == server_id:
                s['org_id'] = org_id
                break

        return {'message': 'Server organization updated'}
