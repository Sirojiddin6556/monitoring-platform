import time
import asyncio
from fastapi import APIRouter, Depends, Request, HTTPException, status, Header, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from ..schemas import AgentMetricsPayload, ProbePayload, LogPayload
from ..security import get_current_user
from ..models import Server as ServerModel, Metric as MetricModel, Probe as ProbeModel, Log as LogModel
from .. import db

router = APIRouter()

@router.post('/api/metrics')
async def receive_metrics(payload: AgentMetricsPayload, request: Request):
    from ..main import (
        verify_ingest_key, APP_SETTINGS, SERVERS, AGENT_METRICS, 
        METRICS_STORE, manager, _persist_metric_async, REQUESTS_METRICS
    )
    # Perform ingest key verification using the helper dependency function directly
    x_ingest_key = request.headers.get("X-Ingest-Key")
    _ingest_auth = await verify_ingest_key(request, x_ingest_key)

    payload_dict = payload.dict(exclude_none=True)
    REQUESTS_METRICS.inc()
    max_metrics = int(APP_SETTINGS.get('max_metrics_store', '1000'))
    ts = int(time.time())

    server_id = payload_dict.get('server_id')
    if not server_id:
        raise HTTPException(status_code=400, detail='server_id is required')
    if _ingest_auth.get('server_id') and _ingest_auth['server_id'] != server_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Ingest key does not match server_id')

    if server_id and payload_dict.get('metrics'):
        sys_info = payload_dict.get('system_info') or {}
        auto_name = sys_info.get('hostname', server_id)
        client_ip = request.client.host if request.client else server_id
        if server_id == 'srv-1' and client_ip in ('127.0.0.1', '::1', 'localhost'):
            client_ip = '172.16.121.32'

        found = False
        for s in SERVERS:
            if s['id'] == server_id:
                found = True
                if s['host'] != client_ip:
                    s['host'] = client_ip
                    try:
                        async with db.get_session() as session:
                            res = await session.execute(select(ServerModel).where(ServerModel.id == server_id))
                            db_srv = res.scalars().first()
                            if db_srv:
                                db_srv.host = client_ip
                                await session.commit()
                    except Exception:
                        pass
                break

        if not found:
            new_srv = {'id': server_id, 'name': auto_name, 'host': client_ip}
            try:
                async with db.get_session() as session:
                    res = await session.execute(select(ServerModel).where(ServerModel.id == server_id))
                    db_srv = res.scalars().first()
                    if not db_srv:
                        session.add(ServerModel(id=server_id, name=auto_name, host=client_ip))
                    else:
                        db_srv.host = client_ip
                    await session.commit()
            except Exception:
                pass
            SERVERS.append(new_srv)

        AGENT_METRICS[server_id] = {
            'metrics': payload_dict['metrics'],
            'status': payload_dict.get('status', 'ok'),
            'timestamp': payload_dict.get('timestamp', ts),
            'agent_version': payload_dict.get('agent_version'),
            'system_info': payload_dict.get('system_info'),
            'cpu_detail': payload_dict.get('cpu_detail'),
            'ram_detail': payload_dict.get('ram_detail'),
            'swap_detail': payload_dict.get('swap_detail'),
            'disks': payload_dict.get('disks'),
            'disk_io': payload_dict.get('disk_io'),
            'network_interfaces': payload_dict.get('network_interfaces'),
            'network_connections': payload_dict.get('network_connections'),
            'temperatures': payload_dict.get('temperatures'),
            'processes_detail': payload_dict.get('processes_detail'),
            'services': payload_dict.get('services'),
            'docker_containers': payload_dict.get('docker_containers'),
            'virtual_machines': payload_dict.get('virtual_machines'),
            'recent_logs': payload_dict.get('recent_logs'),
            'security': payload_dict.get('security'),
            'gpu': payload_dict.get('gpu'),
            'battery': payload_dict.get('battery'),
            'databases': payload_dict.get('databases'),
            'network_equipment': payload_dict.get('network_equipment'),
            'ssl_certificates': payload_dict.get('ssl_certificates'),
        }

    entry = {"payload": payload_dict, "received_at": ts}
    METRICS_STORE.append(entry)
    while len(METRICS_STORE) > max_metrics:
        METRICS_STORE.pop(0)
    asyncio.create_task(_persist_metric_async(payload_dict))
    try:
        ws_event = {
            "server_id": payload_dict.get("server_id"),
            "metric": payload_dict.get("metric"),
            "status": payload_dict.get("status"),
            "timestamp": payload_dict.get("timestamp"),
            "metrics": payload_dict.get("metrics"),
        }
        await manager.send_json({"metric": ws_event})
    except Exception:
        pass
    return {"status": "received"}


@router.post('/api/probe')
async def receive_probe(payload: ProbePayload, request: Request):
    from ..main import verify_ingest_key, PROBES_STORE, REQUESTS_PROBE, _persist_probe_async, manager
    x_ingest_key = request.headers.get("X-Ingest-Key")
    await verify_ingest_key(request, x_ingest_key)

    payload_dict = payload.dict(exclude_none=True)
    REQUESTS_PROBE.inc()
    entry = {"payload": payload_dict, "received_at": int(time.time())}
    PROBES_STORE.append(entry)
    if len(PROBES_STORE) > 1000:
        PROBES_STORE.pop(0)
    asyncio.create_task(_persist_probe_async(payload_dict))
    try:
        await manager.send_json({"probe": payload_dict})
    except Exception:
        pass
    return {"status": "received"}


@router.post('/api/logs')
async def receive_log(payload: LogPayload, request: Request):
    from ..main import verify_ingest_key, LOGS_STORE, _persist_log_async, manager
    x_ingest_key = request.headers.get("X-Ingest-Key")
    await verify_ingest_key(request, x_ingest_key)

    payload_dict = payload.dict(exclude_none=True)
    entry = {"payload": payload_dict, "received_at": int(time.time())}
    LOGS_STORE.append(entry)
    if len(LOGS_STORE) > 5000:
        LOGS_STORE.pop(0)
    asyncio.create_task(_persist_log_async(payload_dict))
    try:
        await manager.send_json({"log": payload_dict})
    except Exception:
        pass
    return {"status": "received"}


@router.get('/api/metrics/history')
async def metrics_history(limit: int = 100, current_user: dict = Depends(get_current_user)):
    from ..main import METRICS_STORE
    try:
        async with db.get_session() as session:
            q = await session.execute(select(MetricModel).order_by(MetricModel.received_at.desc()).limit(limit))
            rows = q.scalars().all()
            return {"metrics": [r.payload for r in reversed(rows)]}
    except Exception:
        return {"metrics": METRICS_STORE[-limit:]}


@router.get('/api/probes/history')
async def probes_history(limit: int = 100, current_user: dict = Depends(get_current_user)):
    from ..main import PROBES_STORE
    try:
        async with db.get_session() as session:
            q = await session.execute(select(ProbeModel).order_by(ProbeModel.received_at.desc()).limit(limit))
            rows = q.scalars().all()
            return {"probes": [r.payload for r in reversed(rows)]}
    except Exception:
        return {"probes": PROBES_STORE[-limit:]}


@router.get('/api/logs/history')
async def logs_history(limit: int = 100, current_user: dict = Depends(get_current_user)):
    from ..main import LOGS_STORE
    try:
        async with db.get_session() as session:
            q = await session.execute(select(LogModel).order_by(LogModel.received_at.desc()).limit(limit))
            rows = q.scalars().all()
            return {"logs": [r.payload for r in reversed(rows)]}
    except Exception:
        return {"logs": LOGS_STORE[-limit:]}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    from ..main import SECRET_KEY, ALGORITHM, manager
    token = websocket.query_params.get("token")
    auth_header = websocket.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]

    if not token:
        await websocket.close(code=4001)
        return

    try:
        from jose import jwt as _jwt
        _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.send_json({"echo": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
