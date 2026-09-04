from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, status, Depends, Request, Header
from fastapi.responses import JSONResponse, Response
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel
import secrets
import time
import datetime
import asyncio
import httpx
import subprocess
import platform
import psutil
import ssl
import socket
import logging
from collections import defaultdict
from sqlalchemy import select, func
from datetime import timedelta

from . import db
from .models import Server as ServerModel, Website as WebsiteModel, Metric as MetricModel, Probe as ProbeModel, Log as LogModel, User as UserModel, UserRole, Setting as SettingModel, Alert as AlertModel, TelegramBot as TelegramBotModel, TelegramBotUser as TelegramBotUserModel, KubeCluster as KubeClusterModel, Hypervisor as HypervisorModel, Organization as OrganizationModel, UserOrganization as UserOrganizationModel, NotificationChannel as NotificationChannelModel, NotificationRule as NotificationRuleModel, AgentToken as AgentTokenModel, WebsiteProtocolProbe as WebsiteProtocolProbeModel
from .security import get_password_hash, get_current_user, get_admin_user, SECRET_KEY, ALGORITHM
from .crypto import encrypt_field, decrypt_field
from .schemas import UserRegister, UserResponse, UserUpdate, MessageResponse, ServerCreate, WebsiteCreate, SettingItem, SettingsUpdate, OrganizationCreate, OrganizationUpdate, OrganizationResponse, NotificationChannelCreate, NotificationChannelUpdate, NotificationRuleCreate, NotificationRuleUpdate, AgentTokenCreate, AgentTokenResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(title="Ситуационный центр мониторинга - Backend", docs_url=None, redoc_url=None)

# CORS — ограничить источники (настраивается через переменную окружения)
import os as _os

_ENVIRONMENT = _os.getenv("ENVIRONMENT", "production").lower()
_origins_env = _os.getenv("ALLOWED_ORIGINS", "")
if _origins_env.strip():
    ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]
elif _ENVIRONMENT in ("dev", "development", "local"):
    ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
else:
    # In production ALLOWED_ORIGINS must be set explicitly
    ALLOWED_ORIGINS = []
    _logger = logging.getLogger("backend.main")
    _logger.warning("ALLOWED_ORIGINS is not set — all CORS requests will be rejected in production.")

ALLOW_INSECURE_TLS = _os.getenv("ALLOW_INSECURE_TLS", "false").lower() in ("1", "true", "yes")
INGEST_API_KEY = _os.getenv("INGEST_API_KEY", "").strip()
RAW_INGEST_API_KEYS = _os.getenv("INGEST_API_KEYS", "").strip()
INGEST_API_KEYS = {k.strip() for k in RAW_INGEST_API_KEYS.split(",") if k.strip()}
if INGEST_API_KEY:
    INGEST_API_KEYS.add(INGEST_API_KEY)
ALLOW_LOCAL_INGEST_WITHOUT_KEY = _os.getenv("ALLOW_LOCAL_INGEST_WITHOUT_KEY", "false").lower() in ("1", "true", "yes")

# Simple in-memory rate limit for login endpoint (per process).
LOGIN_RATE_LIMIT_MAX = int(_os.getenv("LOGIN_RATE_LIMIT_MAX", "10"))
LOGIN_RATE_LIMIT_WINDOW_SEC = int(_os.getenv("LOGIN_RATE_LIMIT_WINDOW_SEC", "300"))
_login_attempts: dict[str, list[float]] = defaultdict(list)

_logger = logging.getLogger("backend.main")
if ALLOW_INSECURE_TLS:
    _logger.warning("ALLOW_INSECURE_TLS is enabled. HTTPS certificate verification is disabled.")
if not INGEST_API_KEY:
    _logger.warning("INGEST_API_KEY is not set. /api/metrics, /api/probe, /api/logs are open for local development.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Ingest-Key"],
)


def _apply_login_rate_limit(request: Request):
    now = time.time()
    client_ip = request.client.host if request.client else "unknown"
    attempts = _login_attempts[client_ip]
    window_start = now - LOGIN_RATE_LIMIT_WINDOW_SEC
    attempts[:] = [t for t in attempts if t >= window_start]
    if len(attempts) >= LOGIN_RATE_LIMIT_MAX:
        retry_after = int(max(1, attempts[0] + LOGIN_RATE_LIMIT_WINDOW_SEC - now))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def _is_login_rate_limited(request: Request) -> tuple[bool, int]:
    now = time.time()
    client_ip = request.client.host if request.client else "unknown"
    attempts = _login_attempts[client_ip]
    window_start = now - LOGIN_RATE_LIMIT_WINDOW_SEC
    attempts[:] = [t for t in attempts if t >= window_start]
    if len(attempts) >= LOGIN_RATE_LIMIT_MAX:
        retry_after = int(max(1, attempts[0] + LOGIN_RATE_LIMIT_WINDOW_SEC - now))
        return True, retry_after
    return False, 0


def _register_failed_login_attempt(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    _login_attempts[client_ip].append(time.time())


def _clear_login_attempts(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if client_ip in _login_attempts:
        _login_attempts.pop(client_ip, None)


async def _find_agent_token(token: str):
    async with db.get_session() as session:
        res = await session.execute(
            select(AgentTokenModel).where(AgentTokenModel.token == token, AgentTokenModel.is_active == True)
        )
        return res.scalars().first()


def _is_local_request(request: Request) -> bool:
    client_host = request.client.host if request.client else ""
    return client_host in ("127.0.0.1", "::1", "localhost")


async def verify_ingest_key(request: Request, x_ingest_key: str | None = Header(default=None, alias="X-Ingest-Key")):
    if x_ingest_key and x_ingest_key in INGEST_API_KEYS:
        return {"server_id": None}

    if x_ingest_key:
        token = await _find_agent_token(x_ingest_key)
        if token:
            return {"server_id": token.server_id}

    if ALLOW_LOCAL_INGEST_WITHOUT_KEY and _is_local_request(request):
        return {"server_id": None}

    if not INGEST_API_KEYS and not INGEST_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ingest authentication is not configured",
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingest key")

# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# New Sprint 2/3 routers
from .routers import auth as _auth_router
from .routers import incidents as _incidents_router
from .routers import maintenance as _maintenance_router
from .routers import sla as _sla_router
from .routers import server_configs as _server_configs_router
from .routers import dashboards as _dashboards_router
from .routers import metrics as _metrics_router

app.include_router(_auth_router.router)
app.include_router(_incidents_router.router)
app.include_router(_maintenance_router.router)
app.include_router(_sla_router.router)
app.include_router(_server_configs_router.router)
app.include_router(_dashboards_router.router)
app.include_router(_metrics_router.router)


# Payloads moved to schemas.py



@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})


# /api/auth/register, /login, /me, /refresh, /logout are implemented in .routers.auth
# (registered above via app.include_router(_auth_router.router))


@app.get("/api/ping")
async def ping():
    REQUESTS_PING.inc()
    return {"ping": "pong"}


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_json(self, message: dict):
        for conn in list(self.active_connections):
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(conn)


manager = ConnectionManager()

# In-memory stores (simple integrated monitoring)
METRICS_STORE: list[dict] = []
PROBES_STORE: list[dict] = []
LOGS_STORE: list[dict] = []

# Глобальные настройки мониторинга (загружаются из БД при старте)
DEFAULT_SETTINGS = {
    'ping_interval': {'value': '15', 'description': 'Интервал пинга серверов (секунды)'},
    'probe_interval': {'value': '30', 'description': 'Интервал проверки сайтов (секунды)'},
    'protocol_probe_interval': {'value': '60', 'description': 'Интервал мультипротокольных проб сайтов (секунды)'},
    'ping_timeout': {'value': '5', 'description': 'Таймаут пинга (секунды)'},
    'probe_timeout': {'value': '10', 'description': 'Таймаут HTTP-проверки (секунды)'},
    'max_metrics_store': {'value': '1000', 'description': 'Макс. записей метрик в памяти'},
    'max_probes_store': {'value': '1000', 'description': 'Макс. записей проб в памяти'},
    'max_logs_store': {'value': '5000', 'description': 'Макс. записей логов в памяти'},
    'monitoring_enabled': {'value': 'true', 'description': 'Включить автоматический мониторинг'},
    'ping_enabled': {'value': 'true', 'description': 'Включить пинг серверов'},
    'probe_enabled': {'value': 'true', 'description': 'Включить проверку сайтов'},
    'data_retention_hours': {'value': '168', 'description': 'Хранить данные (часов, 0 = бессрочно)'},
    'alert_cpu_threshold': {'value': '90', 'description': 'Алерт: CPU > % (0 = выкл)'},
    'alert_ram_threshold': {'value': '85', 'description': 'Алерт: RAM > % (0 = выкл)'},
    'alert_disk_threshold': {'value': '90', 'description': 'Алерт: Disk > % (0 = выкл)'},
    'alert_swap_threshold': {'value': '80', 'description': 'Алерт: Swap > % (0 = выкл)'},
    'alert_ping_threshold': {'value': '500', 'description': 'Алерт: Ping > мс (0 = выкл)'},
    'alerts_enabled': {'value': 'true', 'description': 'Включить систему алертов'},
    'ssl_check_enabled': {'value': 'true', 'description': 'Проверять SSL-сертификаты'},
    'ssl_expiry_warn_days': {'value': '30', 'description': 'Предупреждение за N дней до истечения SSL'},
    'api_monitor_enabled': {'value': 'true', 'description': 'Включить мониторинг API backend'},
    'api_monitor_interval': {'value': '30', 'description': 'Интервал проверки API (секунды)'},
    'api_monitor_timeout': {'value': '5', 'description': 'Таймаут проверки API (секунды)'},
    'api_monitor_max_store': {'value': '1000', 'description': 'Макс. записей истории API мониторинга'},
}
APP_SETTINGS: dict[str, str] = {k: v['value'] for k, v in DEFAULT_SETTINGS.items()}

# In-memory alert & extended stores
ALERTS_STORE: list[dict] = []
# Track active alerts to avoid duplicates (key = "type:target_id:metric_key")
ACTIVE_ALERT_KEYS: set = set()
# Track timestamps of last sent notifications for alert damping (key = "type:target_id:metric_key", value = timestamp)
LAST_ALERT_SENT: dict[str, float] = {}

# API monitoring stores
API_MONITOR_ENDPOINTS = ["/health", "/api/ping", "/metrics"]
API_MONITOR_HISTORY: list[dict] = []
API_MONITOR_CURRENT: dict = {}
DB_WRITE_LOCK = None


def _get_db_write_lock() -> asyncio.Lock:
    global DB_WRITE_LOCK
    if DB_WRITE_LOCK is None:
        DB_WRITE_LOCK = asyncio.Lock()
    return DB_WRITE_LOCK


async def _persist_metric_async(payload: dict) -> None:
    try:
        async with _get_db_write_lock():
            async with db.get_session() as session:
                metric = MetricModel(
                    server_id=payload.get('server_id'),
                    metric_name=payload.get('metric', 'system'),
                    payload=payload,
                    received_at=datetime.datetime.utcnow()
                )
                session.add(metric)
                await session.commit()
    except Exception:
        pass


async def _persist_probe_async(payload: dict) -> None:
    try:
        async with _get_db_write_lock():
            async with db.get_session() as session:
                probe = ProbeModel(payload=payload, received_at=datetime.datetime.utcnow())
                session.add(probe)
                await session.commit()
    except Exception:
        pass


async def _persist_protocol_probe_async(website_id: str, protocol: str, response_time, status: str) -> None:
    try:
        async with _get_db_write_lock():
            async with db.get_session() as session:
                row = WebsiteProtocolProbeModel(
                    website_id=website_id,
                    protocol=protocol,
                    response_time=response_time,
                    status=status,
                    checked_at=datetime.datetime.utcnow(),
                )
                session.add(row)
                await session.commit()
    except Exception:
        pass


async def _persist_log_async(payload: dict) -> None:
    try:
        async with _get_db_write_lock():
            async with db.get_session() as session:
                log = LogModel(payload=payload, received_at=datetime.datetime.utcnow())
                session.add(log)
                await session.commit()
    except Exception:
        pass


async def _persist_alert_async(**kwargs) -> None:
    try:
        async with _get_db_write_lock():
            async with db.get_session() as session:
                alert = AlertModel(**kwargs)
                session.add(alert)
                await session.commit()
    except Exception:
        pass


async def run_api_monitor_check() -> dict:
    base_url = _os.getenv("API_MONITOR_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    timeout_sec = int(APP_SETTINGS.get('api_monitor_timeout', '5'))
    checks: list[dict] = []

    async with httpx.AsyncClient(timeout=timeout_sec, verify=not ALLOW_INSECURE_TLS) as client:
        for endpoint in API_MONITOR_ENDPOINTS:
            started = time.time()
            url = f"{base_url}{endpoint}"
            status_code = None
            error = None
            try:
                resp = await client.get(url)
                status_code = resp.status_code
            except Exception as e:
                error = str(e)
            latency_ms = round((time.time() - started) * 1000, 2)
            ok = status_code is not None and status_code < 500 and error is None
            checks.append({
                'endpoint': endpoint,
                'url': url,
                'status_code': status_code,
                'latency_ms': latency_ms,
                'ok': ok,
                'error': error,
                'checked_at': int(time.time()),
            })

    up_count = sum(1 for c in checks if c['ok'])
    down_count = len(checks) - up_count
    avg_latency = round(sum(c['latency_ms'] for c in checks) / len(checks), 2) if checks else 0

    snapshot = {
        'timestamp': int(time.time()),
        'base_url': base_url,
        'status': 'up' if down_count == 0 else ('degraded' if up_count > 0 else 'down'),
        'summary': {
            'total': len(checks),
            'up': up_count,
            'down': down_count,
            'avg_latency_ms': avg_latency,
            'uptime_seconds': int(time.time() - START_TIME),
        },
        'checks': checks,
    }

    API_MONITOR_CURRENT.clear()
    API_MONITOR_CURRENT.update(snapshot)
    API_MONITOR_HISTORY.append(snapshot)

    max_store = int(APP_SETTINGS.get('api_monitor_max_store', '1000'))
    while len(API_MONITOR_HISTORY) > max_store:
        API_MONITOR_HISTORY.pop(0)

    return snapshot


async def background_api_monitor():
    while True:
        try:
            if APP_SETTINGS.get('api_monitor_enabled', 'true') == 'true':
                await run_api_monitor_check()
        except Exception:
            pass
        interval = int(APP_SETTINGS.get('api_monitor_interval', '30'))
        await asyncio.sleep(max(5, interval))


@app.on_event('startup')
async def startup_event():
    from .logging_config import configure_logging
    configure_logging()
    await db.init_db()
    # Инициализировать и загрузить настройки из БД
    async with db.get_session() as session:
        for key, info in DEFAULT_SETTINGS.items():
            res = await session.execute(select(SettingModel).where(SettingModel.key == key))
            existing = res.scalars().first()
            if existing:
                APP_SETTINGS[key] = existing.value
            else:
                session.add(SettingModel(key=key, value=info['value'], description=info['description']))
        await session.commit()
    
    # Загрузить серверы и сайты из БД в память
    async with db.get_session() as session:
        # Загрузить все серверы из БД
        res = await session.execute(select(ServerModel))
        db_servers = res.scalars().all()
        existing_ids = {s['id'] for s in SERVERS}
        for srv in db_servers:
            if srv.id not in existing_ids:
                SERVERS.append({
                    'id': srv.id, 'name': srv.name, 'host': srv.host,
                    'org_id': getattr(srv, 'org_id', None),
                    'monitor_type': getattr(srv, 'monitor_type', 'agent'),
                    'ssh_user': getattr(srv, 'ssh_user', None),
                    'ssh_port': getattr(srv, 'ssh_port', 22),
                    'ssh_password': decrypt_field(getattr(srv, 'ssh_password', None)),
                    'ssh_key_path': getattr(srv, 'ssh_key_path', None),
                    'winrm_user': getattr(srv, 'winrm_user', None),
                    'winrm_password': decrypt_field(getattr(srv, 'winrm_password', None)),
                    'winrm_port': getattr(srv, 'winrm_port', 5985),
                    'winrm_use_ssl': getattr(srv, 'winrm_use_ssl', False),
                })
        
        # Загрузить все сайты из БД
        res = await session.execute(select(WebsiteModel))
        db_websites = res.scalars().all()
        existing_ids = {w['id'] for w in WEBSITES}
        for ws in db_websites:
            if ws.id not in existing_ids:
                WEBSITES.append({'id': ws.id, 'name': ws.name, 'url': ws.url})
        
        # Сохранить seed-данные в БД
        for s in SERVERS:
            res = await session.execute(select(ServerModel).where(ServerModel.id == s['id']))
            if not res.scalars().first():
                session.add(ServerModel(id=s['id'], name=s['name'], host=s.get('host')))
        for w in WEBSITES:
            res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == w['id']))
            if not res.scalars().first():
                session.add(WebsiteModel(id=w['id'], name=w['name'], url=w['url']))
        await session.commit()
    
    # Восстановить активные ключи алертов из БД, чтобы избежать дубликатов после рестарта
    async with db.get_session() as session:
        res = await session.execute(select(AlertModel).where(AlertModel.is_active == True))
        db_active_alerts = res.scalars().all()
        for a in db_active_alerts:
            key = f"{a.target_type}:{a.target_id}:{a.metric_key or a.title}"
            ACTIVE_ALERT_KEYS.add(key)
            ALERTS_STORE.append({
                'id': a.id,
                'severity': a.severity,
                'category': a.category,
                'target_type': a.target_type,
                'target_id': a.target_id,
                'target_name': a.target_name,
                'title': a.title,
                'message': a.message,
                'metric_key': a.metric_key,
                'metric_value': a.metric_value,
                'threshold': a.threshold,
                'is_active': a.is_active,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            })

    # Запустить фоновые задачи мониторинга
    asyncio.create_task(background_website_prober())
    asyncio.create_task(background_website_protocol_prober())
    asyncio.create_task(background_server_pinger())
    asyncio.create_task(background_api_monitor())
    asyncio.create_task(background_data_cleanup())

    # Автозапуск Telegram бота как фоновой задачи
    try:
        from .telegram_bot import start_bot_background
        await start_bot_background()
    except Exception as e:
        import logging as _logging
        _logging.getLogger('main').warning(f"Telegram bot auto-start: {e}")

# Seeded resources for integrated monitoring (servers and websites)
SERVERS: list[dict] = []

WEBSITES: list[dict] = []

# Хранилище последних метрик от агентов (server_id -> {metrics, timestamp, ...extended data})
AGENT_METRICS: dict = {}
# Хранилище SSL-информации для сайтов (url -> {issuer, expires, days_left, ...})
SSL_INFO: dict = {}

# WebSocket endpoint moved to routers/metrics.py


# ===========================================
# Фоновые задачи автоматического мониторинга
# ===========================================

async def ping_host(host: str) -> dict:
    """Пинг сервера по ICMP, а если ICMP заблокирован — fallback на TCP connect (порты 445, 3389, 22, 80, 443)"""
    if not host:
        return {'status': 'unknown', 'response_time': None}
    
    timeout_sec = int(APP_SETTINGS.get('ping_timeout', '5'))

    # --- 1. ICMP ping ---
    try:
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        timeout_ms = str(timeout_sec * 1000)
        start = time.time()
        proc = await asyncio.create_subprocess_exec(
            'ping', param, '1', '-w', timeout_ms, host,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_sec + 2)
        elapsed = round((time.time() - start) * 1000, 2)
        if proc.returncode == 0:
            # Попробовать извлечь реальный RTT из вывода ping
            rtt = _parse_ping_rtt(stdout)
            return {'status': 'ok', 'response_time': rtt if rtt is not None else elapsed}
    except Exception:
        pass

    # --- 2. TCP connect fallback (если ICMP заблокирован) ---
    tcp_ports = [445, 3389, 22, 80, 443, 135]
    for port in tcp_ports:
        try:
            start = time.time()
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=min(timeout_sec, 3)
            )
            elapsed = round((time.time() - start) * 1000, 2)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return {'status': 'ok', 'response_time': elapsed, 'method': f'tcp:{port}'}
        except Exception:
            continue

    return {'status': 'down', 'response_time': None}


import re as _re

def _parse_ping_rtt(stdout: bytes) -> float | None:
    """Извлечь RTT из вывода ping (поддержка English и Russian локали Windows, а также Linux)."""
    try:
        text = stdout.decode('utf-8', errors='ignore')
    except Exception:
        try:
            text = stdout.decode('cp866', errors='ignore')
        except Exception:
            return None
    # English: "time=5ms" / "time<1ms"
    # Russian: "время=5мс" / "время<1мс"
    # Linux: "time=0.45 ms"
    m = _re.search(r'(?:time|время)[=<](\d+(?:\.\d+)?)', text)
    if m:
        return round(float(m.group(1)), 2)
    return None


async def health_check_protocol(target: str, protocol: str = 'icmp', port: int = None) -> dict:
    """
    Проверка здоровья сервера/сайта с поддержкой разных протоколов:
    - icmp: ICMP ping
    - tcp: TCP соединение на указанный порт
    - http: HTTP запрос
    - https: HTTPS запрос
    - dns: DNS резолюция
    """
    timeout_sec = int(APP_SETTINGS.get('ping_timeout', '5'))
    start = time.time()
    
    try:
        if protocol.lower() == 'icmp':
            # ICMP ping
            param = '-n' if platform.system().lower() == 'windows' else '-c'
            timeout_ms = str(timeout_sec * 1000)
            proc = await asyncio.create_subprocess_exec(
                'ping', param, '1', '-w', timeout_ms, target,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout_sec + 2)
            elapsed = round((time.time() - start) * 1000, 2)
            if proc.returncode == 0:
                rtt = _parse_ping_rtt(stdout)
                return {
                    'status': 'ok', 
                    'protocol': 'icmp',
                    'response_time': rtt if rtt is not None else elapsed,
                    'checked_at': int(time.time())
                }
            return {'status': 'down', 'protocol': 'icmp', 'response_time': None, 'checked_at': int(time.time())}
        
        elif protocol.lower() == 'tcp':
            # TCP соединение
            if port is None:
                port = 80
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(target, port),
                    timeout=min(timeout_sec, 3)
                )
                elapsed = round((time.time() - start) * 1000, 2)
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                return {
                    'status': 'ok',
                    'protocol': f'tcp:{port}',
                    'response_time': elapsed,
                    'checked_at': int(time.time())
                }
            except Exception:
                return {
                    'status': 'down',
                    'protocol': f'tcp:{port}',
                    'response_time': None,
                    'checked_at': int(time.time())
                }
        
        elif protocol.lower() in ('http', 'https'):
            # HTTP/HTTPS запрос
            url = f"{protocol}://{target}" if not target.startswith(('http://', 'https://')) else target
            timeout_sec_http = int(APP_SETTINGS.get('probe_timeout', '10'))
            async with httpx.AsyncClient(timeout=timeout_sec_http, follow_redirects=True, verify=not ALLOW_INSECURE_TLS) as client:
                resp = await client.get(url)
                elapsed = round((time.time() - start) * 1000, 2)
                status_val = 'ok' if resp.status_code < 400 else 'degraded' if resp.status_code < 500 else 'down'
                return {
                    'status': status_val,
                    'protocol': protocol.lower(),
                    'status_code': resp.status_code,
                    'response_time': elapsed,
                    'checked_at': int(time.time())
                }
        
        elif protocol.lower() == 'dns':
            # DNS резолюция
            loop = asyncio.get_event_loop()
            result = await loop.getaddrinfo(target, None)
            elapsed = round((time.time() - start) * 1000, 2)
            if result:
                return {
                    'status': 'ok',
                    'protocol': 'dns',
                    'response_time': elapsed,
                    'addresses': [r[4][0] for r in result][:3],
                    'checked_at': int(time.time())
                }
            return {'status': 'down', 'protocol': 'dns', 'response_time': None, 'checked_at': int(time.time())}
        
        else:
            return {'status': 'unknown', 'protocol': protocol, 'error': 'Unknown protocol', 'checked_at': int(time.time())}
    
    except asyncio.TimeoutError:
        return {
            'status': 'timeout',
            'protocol': protocol,
            'response_time': round((time.time() - start) * 1000, 2),
            'checked_at': int(time.time())
        }
    except Exception as e:
        return {
            'status': 'error',
            'protocol': protocol,
            'error': str(e),
            'response_time': None,
            'checked_at': int(time.time())
        }


async def probe_url(url: str) -> dict:
    """HTTP проверка сайта + SSL certificate info"""
    result = {
        'status': 'down',
        'status_code': 0,
        'response_time': None,
        'ssl': None,
    }
    # SSL certificate check
    if url.startswith('https://') and APP_SETTINGS.get('ssl_check_enabled', 'true') == 'true':
        try:
            hostname = url.split('//')[1].split('/')[0].split(':')[0]
            ctx = ssl.create_default_context()
            loop = asyncio.get_event_loop()
            def _check_ssl():
                conn = ctx.wrap_socket(socket.socket(socket.AF_INET), server_hostname=hostname)
                conn.settimeout(5)
                conn.connect((hostname, 443))
                cert = conn.getpeercert()
                conn.close()
                return cert
            cert = await loop.run_in_executor(None, _check_ssl)
            not_after = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
            days_left = (not_after - datetime.datetime.utcnow()).days
            issuer_dict = dict(x[0] for x in cert.get('issuer', []))
            ssl_info = {
                'valid': days_left > 0,
                'issuer': issuer_dict.get('organizationName', issuer_dict.get('commonName', 'Unknown')),
                'expires': not_after.isoformat(),
                'days_left': days_left,
                'subject': dict(x[0] for x in cert.get('subject', [])).get('commonName', ''),
            }
            result['ssl'] = ssl_info
            SSL_INFO[url] = ssl_info
            # Alert on SSL expiring soon
            warn_days = int(APP_SETTINGS.get('ssl_expiry_warn_days', '30'))
            if days_left <= warn_days and days_left > 0:
                await create_alert(
                    severity='warning', category='website', target_type='website',
                    target_id=url, target_name=hostname,
                    title=f'SSL сертификат истекает через {days_left} дней',
                    message=f'{hostname}: сертификат действителен до {not_after.strftime("%Y-%m-%d")}',
                    metric_key='ssl_days_left', metric_value=str(days_left), threshold=str(warn_days)
                )
            elif days_left <= 0:
                await create_alert(
                    severity='critical', category='website', target_type='website',
                    target_id=url, target_name=hostname,
                    title=f'SSL сертификат ИСТЁК!',
                    message=f'{hostname}: сертификат истёк {abs(days_left)} дней назад',
                    metric_key='ssl_days_left', metric_value=str(days_left), threshold='0'
                )
        except Exception:
            pass
    # HTTP check
    try:
        timeout_sec = int(APP_SETTINGS.get('probe_timeout', '10'))
        async with httpx.AsyncClient(timeout=timeout_sec, follow_redirects=True, verify=not ALLOW_INSECURE_TLS) as client:
            start = time.time()
            resp = await client.get(url)
            elapsed = round((time.time() - start) * 1000, 2)
            status_str = 'up' if resp.status_code < 400 else 'degraded'
            result['status'] = status_str
            result['status_code'] = resp.status_code
            result['response_time'] = elapsed
    except Exception:
        result['status'] = 'down'
        # Alert on site down
        hostname = url.split('//')[1].split('/')[0] if '//' in url else url
        await create_alert(
            severity='critical', category='website', target_type='website',
            target_id=url, target_name=hostname,
            title=f'Сайт недоступен: {hostname}',
            message=f'URL {url} не отвечает',
            metric_key='availability', metric_value='down', threshold='up'
        )
    return result


# ============================================================
# ALERT ENGINE
# ============================================================

async def create_alert(*, severity, category, target_type, target_id, target_name,
                       title, message, metric_key=None, metric_value=None, threshold=None):
    """Создать алерт, если такой ещё не активен"""
    if APP_SETTINGS.get('alerts_enabled', 'true') != 'true':
        return
    alert_key = f"{target_type}:{target_id}:{metric_key or title}"
    if alert_key in ACTIVE_ALERT_KEYS:
        return  # Already active, don't duplicate

    ACTIVE_ALERT_KEYS.add(alert_key)
    alert_dict = {
        'severity': severity,
        'category': category,
        'target_type': target_type,
        'target_id': target_id,
        'target_name': target_name,
        'title': title,
        'message': message,
        'metric_key': metric_key,
        'metric_value': metric_value,
        'threshold': threshold,
        'is_active': True,
        'created_at': datetime.datetime.utcnow().isoformat(),
    }
    ALERTS_STORE.append(alert_dict)
    while len(ALERTS_STORE) > 500:
        ALERTS_STORE.pop(0)
    # Persist alert off the hot path to reduce SQLite contention during bursts.
    asyncio.create_task(_persist_alert_async(
        severity=severity,
        category=category,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        title=title,
        message=message,
        metric_key=metric_key,
        metric_value=str(metric_value) if metric_value is not None else None,
        threshold=str(threshold) if threshold is not None else None,
        is_active=True,
    ))
    # Broadcast via WebSocket
    try:
        await manager.send_json({"alert": alert_dict})
    except Exception:
        pass
    # Dispatch notifications to all enabled channels
    try:
        asyncio.create_task(dispatch_notifications(alert_dict))
    except Exception:
        pass


async def dispatch_notifications(alert_dict: dict):
    """Отправить уведомления по всем активным каналам и правилам"""
    import time
    severity = alert_dict.get('severity', '')
    category = alert_dict.get('category', '')

    target_type = alert_dict.get('target_type', '')
    target_id = alert_dict.get('target_id', '')
    metric_key = alert_dict.get('metric_key') or alert_dict.get('title', '')
    alert_key = f"{target_type}:{target_id}:{metric_key}"

    now = time.time()
    last_sent = LAST_ALERT_SENT.get(alert_key, 0)
    if now - last_sent < 300:  # 5 minutes damping window
        return
    LAST_ALERT_SENT[alert_key] = now

    try:
        async with db.get_session() as session:
            res = await session.execute(
                select(NotificationChannelModel).where(NotificationChannelModel.is_enabled == True)
            )
            channels = res.scalars().all()
    except Exception:
        channels = []

    for ch in channels:
        if ch.severity_filter != 'all' and ch.severity_filter != severity:
            continue
        if ch.category_filter != 'all' and ch.category_filter != category:
            continue
        try:
            await _send_notification(ch.channel_type, ch.config, alert_dict)
        except Exception:
            pass

    # Check notification rules
    try:
        await _check_notification_rules(alert_dict)
    except Exception:
        pass

    # Send to individual Telegram bot users
    try:
        asyncio.create_task(_notify_telegram_bot_users(alert_dict))
    except Exception:
        pass


async def _notify_telegram_bot_users(alert_dict: dict):
    """Отправить уведомления зарегистрированным пользователям Telegram-ботов"""
    severity = alert_dict.get('severity', '')
    category = alert_dict.get('category', '')
    target_type = alert_dict.get('target_type', '')
    target_id = alert_dict.get('target_id', '')
    title = alert_dict.get('title', 'Alert')
    message = alert_dict.get('message', '')
    target_name = alert_dict.get('target_name', '')
    text = f"🔔 <b>[{severity.upper()}]</b> {title}\n{message}"
    if target_name:
        text += f"\n📍 {target_name}"
    try:
        async with db.get_session() as session:
            # Get all active bots
            bots_res = await session.execute(
                select(TelegramBotModel).where(TelegramBotModel.is_active == True)
            )
            bots = {b.id: b for b in bots_res.scalars().all()}
            if not bots:
                return
            # Get all active telegram users
            users_res = await session.execute(
                select(TelegramBotUserModel).where(TelegramBotUserModel.is_active == True)
            )
            users = users_res.scalars().all()
            # Determine org_id for target from server/website
            alert_org_id = None
            if target_type == 'server' and target_id:
                srv_res = await session.execute(select(ServerModel).where(ServerModel.id == target_id))
                srv = srv_res.scalars().first()
                if srv:
                    alert_org_id = srv.org_id
            elif target_type == 'website' and target_id:
                ws_res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == target_id))
                ws = ws_res.scalars().first()
                if ws:
                    alert_org_id = ws.org_id

            for user in users:
                bot = bots.get(user.bot_id)
                if not bot:
                    continue
                # Check severity filter
                if severity == 'critical' and not user.notify_critical:
                    continue
                if severity == 'warning' and not user.notify_warning:
                    continue
                if severity == 'info' and not user.notify_info:
                    continue
                # Check category filter
                if user.notify_categories and len(user.notify_categories) > 0:
                    if category not in user.notify_categories:
                        continue
                # Check org filter
                if user.org_id and alert_org_id and user.org_id != alert_org_id:
                    continue
                # Send (non-blocking background task to prevent event loop starvation)
                try:
                    asyncio.create_task(_send_telegram_message(bot.token, user.telegram_id, text))
                    await asyncio.sleep(0.3)  # rate limit: max ~3 msgs/sec per alert
                except Exception:
                    pass
    except Exception:
        pass


async def _check_notification_rules(alert_dict: dict):
    """Проверить пользовательские правила уведомлений"""
    now = datetime.datetime.utcnow()
    try:
        async with db.get_session() as session:
            res = await session.execute(
                select(NotificationRuleModel).where(NotificationRuleModel.is_enabled == True)
            )
            rules = res.scalars().all()

            for rule in rules:
                # Check target_type match
                if rule.target_type and rule.target_type != alert_dict.get('target_type', ''):
                    continue
                # Check target_id match
                if rule.target_id and rule.target_id != alert_dict.get('target_id', ''):
                    continue
                # Check metric match
                alert_metric = alert_dict.get('metric_key', '')
                if rule.metric != 'any' and rule.metric != alert_metric:
                    continue
                # Check condition and threshold
                try:
                    alert_val = float(alert_dict.get('metric_value', 0) or 0)
                    rule_thresh = float(rule.threshold_value)
                    if rule.condition == 'gt' and not (alert_val > rule_thresh):
                        continue
                    elif rule.condition == 'lt' and not (alert_val < rule_thresh):
                        continue
                    elif rule.condition == 'eq' and not (alert_val == rule_thresh):
                        continue
                    elif rule.condition == 'neq' and not (alert_val != rule_thresh):
                        continue
                except (ValueError, TypeError):
                    # For non-numeric metrics (availability=down), just match by metric key
                    pass
                # Check cooldown
                if rule.last_triggered:
                    elapsed = (now - rule.last_triggered).total_seconds()
                    if elapsed < rule.cooldown:
                        continue
                # Rule matched — send notification
                if rule.channel_id:
                    ch_res = await session.execute(
                        select(NotificationChannelModel).where(
                            NotificationChannelModel.id == rule.channel_id,
                            NotificationChannelModel.is_enabled == True
                        )
                    )
                    ch = ch_res.scalars().first()
                    if ch:
                        try:
                            await _send_notification(ch.channel_type, ch.config, alert_dict)
                        except Exception:
                            pass
                # Update rule trigger info
                rule.last_triggered = now
                rule.trigger_count = (rule.trigger_count or 0) + 1
            await session.commit()
    except Exception:
        pass


async def _send_notification(channel_type: str, config: dict, alert_dict: dict):
    """Отправить уведомление через конкретный канал"""
    title = alert_dict.get('title', 'Alert')
    message = alert_dict.get('message', '')
    severity = alert_dict.get('severity', 'info').upper()
    target = alert_dict.get('target_name', '')
    text = f"🔔 <b>[{severity}]</b> {title}\n{message}"
    if target:
        text += f"\n📍 {target}"

    if channel_type == 'telegram':
        token = config.get('bot_token', '')
        chat_id = config.get('chat_id', '')
        if token and chat_id:
            await _send_telegram_message(token, chat_id, text)

    elif channel_type == 'email':
        await _send_email_notification(config, alert_dict)

    elif channel_type == 'webhook':
        url = config.get('url', '')
        if url:
            async with httpx.AsyncClient(timeout=10) as client:
                headers = config.get('headers', {})
                headers.setdefault('Content-Type', 'application/json')
                await client.post(url, json={
                    'severity': alert_dict.get('severity'),
                    'category': alert_dict.get('category'),
                    'title': title,
                    'message': message,
                    'target_name': target,
                    'target_type': alert_dict.get('target_type'),
                    'target_id': alert_dict.get('target_id'),
                    'metric_key': alert_dict.get('metric_key'),
                    'metric_value': alert_dict.get('metric_value'),
                    'threshold': alert_dict.get('threshold'),
                    'created_at': alert_dict.get('created_at'),
                }, headers=headers)

    elif channel_type == 'discord':
        webhook_url = config.get('webhook_url', '')
        if webhook_url:
            color_map = {'critical': 0xFF0000, 'warning': 0xFFA500, 'info': 0x00BFFF}
            color = color_map.get(alert_dict.get('severity', 'info'), 0x00BFFF)
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(webhook_url, json={
                    'embeds': [{
                        'title': f'[{severity}] {title}',
                        'description': message,
                        'color': color,
                        'fields': [
                            {'name': 'Target', 'value': target or '—', 'inline': True},
                            {'name': 'Category', 'value': alert_dict.get('category', ''), 'inline': True},
                        ]
                    }]
                })


async def _send_email_notification(config: dict, alert_dict: dict):
    """Отправить email уведомление через SMTP"""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    smtp_host = config.get('smtp_host', '')
    smtp_port = int(config.get('smtp_port', 587))
    smtp_user = config.get('smtp_user', '')
    smtp_password = config.get('smtp_password', '')
    from_email = config.get('from_email', smtp_user)
    to_emails = config.get('to_emails', [])
    use_tls = config.get('use_tls', True)

    if not smtp_host or not to_emails:
        return

    severity = alert_dict.get('severity', 'info').upper()
    title = alert_dict.get('title', 'Alert')
    message = alert_dict.get('message', '')
    target = alert_dict.get('target_name', '')

    subject = f'[{severity}] {title}'
    body = f"""
    <h2 style="color: {'#ef4444' if severity == 'CRITICAL' else '#f59e0b' if severity == 'WARNING' else '#3b82f6'}">[{severity}] {title}</h2>
    <p>{message}</p>
    <table>
        <tr><td><b>Target:</b></td><td>{target or '—'}</td></tr>
        <tr><td><b>Category:</b></td><td>{alert_dict.get('category', '')}</td></tr>
        <tr><td><b>Metric:</b></td><td>{alert_dict.get('metric_key', '')} = {alert_dict.get('metric_value', '')}</td></tr>
        <tr><td><b>Threshold:</b></td><td>{alert_dict.get('threshold', '')}</td></tr>
        <tr><td><b>Time:</b></td><td>{alert_dict.get('created_at', '')}</td></tr>
    </table>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = from_email
    msg['To'] = ', '.join(to_emails) if isinstance(to_emails, list) else to_emails
    msg.attach(MIMEText(body, 'html'))

    loop = asyncio.get_event_loop()
    def _send():
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if use_tls:
                server.starttls()
            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)
            recipients = to_emails if isinstance(to_emails, list) else [to_emails]
            server.sendmail(from_email, recipients, msg.as_string())
    await loop.run_in_executor(None, _send)


async def resolve_alert(target_type, target_id, metric_key):
    """Пометить алерт как решённый"""
    alert_key = f"{target_type}:{target_id}:{metric_key}"
    ACTIVE_ALERT_KEYS.discard(alert_key)
    try:
        async with db.get_session() as session:
            from sqlalchemy import update as sa_update, and_
            await session.execute(
                sa_update(AlertModel).where(
                    and_(
                        AlertModel.target_type == target_type,
                        AlertModel.target_id == target_id,
                        AlertModel.metric_key == metric_key,
                        AlertModel.is_active == True,
                    )
                ).values(is_active=False, resolved_at=datetime.datetime.utcnow())
            )
            await session.commit()
    except Exception:
        pass


async def check_server_alerts(server_id, server_name, metrics_dict):
    """Проверить метрики сервера и создать/разрешить алерты"""
    from .routers.maintenance import is_in_maintenance
    from .routers.server_configs import get_effective_thresholds

    if await is_in_maintenance('server', server_id):
        return

    effective = await get_effective_thresholds(server_id, APP_SETTINGS)
    if not effective.get('alerts_enabled', True):
        return

    metric_units = {'cpu': '%', 'ram': '%', 'disk': '%', 'swap': '%', 'ping': 'мс'}
    for key, unit in metric_units.items():
        thresh = effective.get(key, 0)
        if thresh <= 0:
            continue
        metric_data = metrics_dict.get(key, {})
        value = metric_data.get('value', 0) if isinstance(metric_data, dict) else 0
        if value > thresh:
            severity = 'critical' if value > thresh * 1.1 else 'warning'
            await create_alert(
                severity=severity, category='system', target_type='server',
                target_id=server_id, target_name=server_name,
                title=f'{key.upper()} > {thresh}{unit} на {server_name}',
                message=f'{key.upper()} = {value}{unit} (порог: {thresh}{unit})',
                metric_key=key, metric_value=str(value), threshold=str(thresh)
            )
        else:
            await resolve_alert('server', server_id, key)

    # Check for server down
    status_val = metrics_dict.get('_status')
    if status_val == 'down':
        await create_alert(
            severity='critical', category='system', target_type='server',
            target_id=server_id, target_name=server_name,
            title=f'Сервер недоступен: {server_name}',
            message=f'Сервер {server_name} ({server_id}) не отвечает на ping',
            metric_key='availability', metric_value='down', threshold='up'
        )
    else:
        await resolve_alert('server', server_id, 'availability')

    # Check for zombie processes
    agent_data = AGENT_METRICS.get(server_id, {})
    procs_detail = agent_data.get('processes_detail', {})
    zombie = procs_detail.get('zombie', 0)
    if zombie > 0:
        await create_alert(
            severity='warning', category='system', target_type='server',
            target_id=server_id, target_name=server_name,
            title=f'Zombie-процессы: {zombie} на {server_name}',
            message=f'Обнаружено {zombie} zombie-процессов',
            metric_key='zombie_processes', metric_value=str(zombie), threshold='0'
        )
    else:
        await resolve_alert('server', server_id, 'zombie_processes')

    # Service alerts — only for truly failed services (not inactive/stopped by design)
    # No resolve_alert calls per-service to avoid N+1 DB queries on each metric ingestion
    services = agent_data.get('services', [])
    failed_services = [s for s in services if s.get('status') == 'failed']
    for svc in failed_services:
        svc_name = svc.get('name', '?')
        await create_alert(
            severity='critical', category='service', target_type='service',
            target_id=f"{server_id}:{svc_name}", target_name=svc_name,
            title=f'Сервис {svc_name} упал на {server_name}',
            message=f'Статус: failed',
            metric_key='service_status', metric_value='failed', threshold='active'
        )

    # Check docker containers
    docker_containers = agent_data.get('docker_containers')
    if docker_containers:
        for cont in docker_containers:
            if cont.get('status') != 'running' and cont.get('state') not in ('running',):
                await create_alert(
                    severity='warning', category='docker', target_type='container',
                    target_id=f"{server_id}:{cont['name']}", target_name=cont['name'],
                    title=f'Контейнер {cont["name"]} остановлен на {server_name}',
                    message=f'Статус: {cont.get("status")}',
                    metric_key='container_status', metric_value=cont.get('status'), threshold='running'
                )


async def background_website_prober():
    """Фоновая задача: проверять все сайты с настраиваемым интервалом"""
    await asyncio.sleep(2)  # дать серверу стартовать
    while True:
        try:
            if APP_SETTINGS.get('monitoring_enabled', 'true') == 'true' and APP_SETTINGS.get('probe_enabled', 'true') == 'true':
                max_probes = int(APP_SETTINGS.get('max_probes_store', '1000'))
                for w in list(WEBSITES):
                    url = w.get('url')
                    if not url:
                        continue
                    result = await probe_url(url)
                    payload = {
                        'target': url,
                        'website_id': w['id'],
                        'status': result['status'],
                        'status_code': result.get('status_code', 0),
                        'response_time': result.get('response_time'),
                        'ssl': result.get('ssl'),
                        'timestamp': int(time.time()),
                    }
                    entry = {"payload": payload, "received_at": int(time.time())}
                    PROBES_STORE.append(entry)
                    while len(PROBES_STORE) > max_probes:
                        PROBES_STORE.pop(0)
                    asyncio.create_task(_persist_probe_async(payload))
                    try:
                        await manager.send_json({"probe": payload})
                    except Exception:
                        pass
        except Exception:
            pass
        interval = int(APP_SETTINGS.get('probe_interval', '30'))
        await asyncio.sleep(interval)


async def background_website_protocol_prober():
    """Фоновая задача: мультипротокольные проверки сайтов каждые 60 с, результаты в БД"""
    await asyncio.sleep(15)
    _PROTOCOLS = [
        ('http',    'http',  None),
        ('https',   'https', None),
        ('icmp',    'icmp',  None),
        ('tcp_443', 'tcp',   443),
    ]
    while True:
        try:
            if APP_SETTINGS.get('monitoring_enabled', 'true') == 'true':
                for w in list(WEBSITES):
                    url = w.get('url')
                    if not url:
                        continue
                    try:
                        from urllib.parse import urlparse
                        host = urlparse(url).hostname or url
                    except Exception:
                        host = url
                    for proto_key, proto, port in _PROTOCOLS:
                        try:
                            result = await health_check_protocol(host, proto, port)
                            asyncio.create_task(_persist_protocol_probe_async(
                                w['id'], proto_key,
                                result.get('response_time'),
                                result.get('status', 'unknown'),
                            ))
                        except Exception:
                            pass
        except Exception:
            pass
        interval = int(APP_SETTINGS.get('protocol_probe_interval', '60'))
        await asyncio.sleep(interval)


def collect_real_metrics():
    """Собрать реальные метрики системы через psutil"""
    # CPU
    cpu_pct = psutil.cpu_percent(interval=None)
    # RAM
    mem = psutil.virtual_memory()
    ram_pct = mem.percent
    # Disk
    try:
        disk = psutil.disk_usage('/')
        disk_pct = disk.percent
    except Exception:
        try:
            disk = psutil.disk_usage('C:\\')
            disk_pct = disk.percent
        except Exception:
            disk_pct = 0
    # Swap
    swap = psutil.swap_memory()
    swap_pct = swap.percent
    # Network
    net = psutil.net_io_counters()
    # Load average (на Windows — среднее по процессору за 1/5/15)
    try:
        la = psutil.getloadavg()
        load1, load5, load15 = la[0], la[1], la[2]
    except (AttributeError, OSError):
        load1 = load5 = load15 = cpu_pct / 100.0 * psutil.cpu_count()
    # Processes
    num_procs = len(psutil.pids())
    # Uptime
    boot = psutil.boot_time()
    uptime_hours = (time.time() - boot) / 3600
    # Disk IO
    try:
        dio = psutil.disk_io_counters()
        iops_read = dio.read_count
        iops_write = dio.write_count
    except Exception:
        iops_read = 0
        iops_write = 0
    return {
        'cpu': cpu_pct,
        'ram': ram_pct,
        'disk': disk_pct,
        'swap': swap_pct,
        'net_bytes_sent': net.bytes_sent,
        'net_bytes_recv': net.bytes_recv,
        'load1': load1,
        'load5': load5,
        'load15': load15,
        'processes': num_procs,
        'uptime_hours': uptime_hours,
        'iops_read': iops_read,
        'iops_write': iops_write,
    }


def _make_zero_metrics(ping_ms: float = 0) -> dict:
    """Create a zeroed metrics dict with only ping value set."""
    return {
        'ping': {'value': ping_ms, 'unit': 'ms'},
        'cpu': {'value': 0, 'unit': '%'},
        'ram': {'value': 0, 'unit': '%'},
        'disk': {'value': 0, 'unit': '%'},
        'swap': {'value': 0, 'unit': '%'},
        'net_in': {'value': 0, 'unit': 'Mbps'},
        'net_out': {'value': 0, 'unit': 'Mbps'},
        'load1': {'value': 0, 'unit': ''},
        'load5': {'value': 0, 'unit': ''},
        'load15': {'value': 0, 'unit': ''},
        'processes': {'value': 0, 'unit': ''},
        'uptime_hours': {'value': 0, 'unit': 'h'},
        'iops_read': {'value': 0, 'unit': 'IO/s'},
        'iops_write': {'value': 0, 'unit': 'IO/s'},
    }


async def background_server_pinger():
    """Фоновая задача: пинговать серверы и использовать метрики от агентов (или локальный fallback)"""
    await asyncio.sleep(3)
    # Инициализировать psutil cpu_percent (первый вызов всегда 0)
    psutil.cpu_percent(interval=None)
    # Предыдущие счётчики для расчёта скоростей (fallback для серверов без агента)
    prev_net = psutil.net_io_counters()
    try:
        prev_dio = psutil.disk_io_counters()
    except Exception:
        prev_dio = None
    prev_time = time.time()
    while True:
        try:
            if APP_SETTINGS.get('monitoring_enabled', 'true') == 'true' and APP_SETTINGS.get('ping_enabled', 'true') == 'true':
                max_metrics = int(APP_SETTINGS.get('max_metrics_store', '1000'))
                agent_fresh_ttl = int(APP_SETTINGS.get('agent_fresh_ttl', '20'))
                ts = int(time.time())
                
                # Локальные метрики (fallback для серверов без агента)
                real = collect_real_metrics()
                now = time.time()
                dt = now - prev_time
                if dt < 0.1:
                    dt = 1.0
                cur_net = psutil.net_io_counters()
                local_net_in = round((cur_net.bytes_recv - prev_net.bytes_recv) * 8 / dt / 1_000_000, 2)
                local_net_out = round((cur_net.bytes_sent - prev_net.bytes_sent) * 8 / dt / 1_000_000, 2)
                prev_net = cur_net
                try:
                    cur_dio = psutil.disk_io_counters()
                    if prev_dio:
                        local_iops_r = round((cur_dio.read_count - prev_dio.read_count) / dt, 0)
                        local_iops_w = round((cur_dio.write_count - prev_dio.write_count) / dt, 0)
                    else:
                        local_iops_r = 0
                        local_iops_w = 0
                    prev_dio = cur_dio
                except Exception:
                    local_iops_r = 0
                    local_iops_w = 0
                prev_time = now
                
                for s in list(SERVERS):
                    host = s.get('host')
                    if not host:
                        continue
                    sid = s['id']
                    monitor_type = s.get('monitor_type', 'agent')
                    
                    # Пинг
                    result = await ping_host(host)
                    is_up = result['status'] == 'ok'
                    ping_ms = result.get('response_time') or 0
                    status_value = result['status']
                    
                    # Определить источник метрик по типу мониторинга
                    source_label = 'local'
                    remote_extended = {}

                    if monitor_type in ('ssh', 'winrm') and is_up:
                        # Удалённый сбор метрик через SSH/WinRM
                        try:
                            from .remote_collector import collect_remote_metrics
                            remote_result = await collect_remote_metrics(s)
                            if remote_result.get('status') == 'ok':
                                all_metrics = dict(remote_result['metrics'])
                                all_metrics['ping'] = {'value': ping_ms, 'unit': 'ms'}
                                source_label = monitor_type
                                # Сохранить расширенные данные в AGENT_METRICS для отображения деталей
                                remote_extended = {k: v for k, v in remote_result.items() if k not in ('status', 'timestamp', 'metrics', 'source')}
                                AGENT_METRICS[sid] = {
                                    'metrics': remote_result['metrics'],
                                    'status': 'ok',
                                    'timestamp': ts,
                                    **remote_extended,
                                }
                            else:
                                # Ошибка удалённого сбора — fallback to ping only
                                all_metrics = _make_zero_metrics(ping_ms)
                                source_label = 'remote_error'
                        except Exception:
                            all_metrics = _make_zero_metrics(ping_ms)
                            source_label = 'remote_error'

                    elif monitor_type == 'ping_only':
                        # Только пинг, без сбора метрик
                        all_metrics = _make_zero_metrics(ping_ms)
                        source_label = 'ping_only'

                    else:
                        # Agent mode: проверить, есть ли свежие метрики от агента (не старше 120 сек)
                        agent_data = AGENT_METRICS.get(sid)
                        agent_fresh = agent_data and (ts - agent_data.get('timestamp', 0)) < agent_fresh_ttl
                        
                        if agent_fresh:
                            # Использовать реальные метрики от удалённого агента
                            all_metrics = dict(agent_data['metrics'])
                            all_metrics['ping'] = {'value': ping_ms, 'unit': 'ms'}
                            source_label = 'agent'
                            status_value = 'ok'
                            is_up = True
                        else:
                            # Агент не присылал свежие данные: считаем агент оффлайн.
                            all_metrics = _make_zero_metrics(ping_ms)
                            source_label = 'agent_stale'
                            status_value = 'down'
                    
                    # Если сервер недоступен — обнулить все кроме пинга
                    if not is_up:
                        for k in all_metrics:
                            if k != 'ping':
                                all_metrics[k]['value'] = 0
                    
                    payload = {
                        'service': source_label,
                        'server_id': sid,
                        'metric': 'system',
                        'metrics': all_metrics,
                        'value': ping_ms,
                        'status': status_value,
                        'timestamp': ts,
                    }
                    entry = {"payload": payload, "received_at": ts}
                    METRICS_STORE.append(entry)
                    while len(METRICS_STORE) > max_metrics:
                        METRICS_STORE.pop(0)
                    asyncio.create_task(_persist_metric_async(payload))
                    try:
                        await manager.send_json({"metric": payload})
                    except Exception:
                        pass

                    # Check alerts for this server
                    try:
                        alert_metrics = dict(all_metrics)
                        alert_metrics['_status'] = status_value
                        server_name = s.get('name', sid)
                        await check_server_alerts(sid, server_name, alert_metrics)
                    except Exception:
                        pass
        except Exception:
            pass
        interval = int(APP_SETTINGS.get('ping_interval', '15'))
        await asyncio.sleep(interval)


# Metrics, probes, logs and history endpoints moved to routers/metrics.py



@app.get('/api/api-monitoring/status')
async def api_monitoring_status(current_user: dict = Depends(get_current_user)):
    if not API_MONITOR_CURRENT:
        await run_api_monitor_check()
    return {
        'current': API_MONITOR_CURRENT,
        'recent': API_MONITOR_HISTORY[-20:],
    }


@app.get('/api/api-monitoring/history')
async def api_monitoring_history(limit: int = 100, current_user: dict = Depends(get_current_user)):
    limit = max(1, min(limit, 1000))
    return {
        'history': API_MONITOR_HISTORY[-limit:]
    }


@app.post('/api/api-monitoring/check')
async def api_monitoring_check_now(current_user: dict = Depends(get_admin_user)):
    snapshot = await run_api_monitor_check()
    return {'snapshot': snapshot}


# --- Agent download endpoints ---

_AGENT_DIR = _os.path.normpath(_os.path.join(_os.path.dirname(__file__), '..', '..', 'agent'))
_AGENT_ALLOWED = {'install.ps1', 'install.sh', 'MonitoringAgent.exe', 'MonitoringAgentInstaller.exe',
                  'monitoring-agent-linux-amd64', 'monitoring-agent-linux-arm64', 'monitoring-agent-linux-arm'}

@app.get('/api/agent/info')
async def agent_download_info(current_user: dict = Depends(get_current_user)):
    """Возвращает версию агента и INGEST_API_KEY для wizard установки."""
    version = '—'
    ver_path = _os.path.join(_AGENT_DIR, 'VERSION')
    try:
        with open(ver_path, 'r') as f:
            version = f.read().strip()
    except Exception:
        pass
    available = [f for f in _AGENT_ALLOWED if _os.path.exists(_os.path.join(_AGENT_DIR, f))]
    return {
        'version': version,
        'ingest_api_key': INGEST_API_KEY,
        'available_files': available,
    }


@app.get('/api/agent/keys', response_model=list[AgentTokenResponse])
async def list_agent_keys(current_user: dict = Depends(get_admin_user)):
    async with db.get_session() as session:
        res = await session.execute(select(AgentTokenModel).order_by(AgentTokenModel.created_at.desc()))
        tokens = res.scalars().all()
    return tokens


@app.post('/api/agent/keys', response_model=AgentTokenResponse)
async def create_agent_key(data: AgentTokenCreate, current_user: dict = Depends(get_admin_user)):
    async with db.get_session() as session:
        server = await session.get(ServerModel, data.server_id)
        if not server:
            raise HTTPException(status_code=400, detail='Server not found')
        token = secrets.token_urlsafe(32)
        key = AgentTokenModel(server_id=data.server_id, token=token, is_active=True)
        session.add(key)
        await session.commit()
        await session.refresh(key)
    return key


@app.delete('/api/agent/keys/{key_id}')
async def revoke_agent_key(key_id: int, current_user: dict = Depends(get_admin_user)):
    async with db.get_session() as session:
        token = await session.get(AgentTokenModel, key_id)
        if not token:
            raise HTTPException(status_code=404, detail='Key not found')
        token.is_active = False
        await session.commit()
    return {'message': 'revoked'}


@app.get('/api/agent/download/{filename}')
async def download_agent_file(filename: str):
    """Скачать установщик или бинарь агента (публичный endpoint — файлы не содержат секретов)."""
    from fastapi.responses import FileResponse as _FileResponse
    if filename not in _AGENT_ALLOWED:
        raise HTTPException(status_code=404, detail='File not allowed')
    file_path = _os.path.join(_AGENT_DIR, filename)
    if not _os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f'{filename} not found on server')
    media = 'application/octet-stream'
    if filename.endswith('.ps1') or filename.endswith('.sh'):
        media = 'text/plain; charset=utf-8'
    return _FileResponse(path=file_path, filename=filename, media_type=media)


# --- Resources endpoints for UI tabs ---


@app.get('/api/servers')
async def list_servers(request: Request, current_user: dict = Depends(get_current_user)):
    # Фильтрация по организации
    user_org_ids = None
    role = current_user.get("role")
    if role != "admin":
        user_org_ids = current_user.get("org_ids", [])

    # Загрузить org_id из БД для серверов
    server_org_map = {}
    async with db.get_session() as session:
        res = await session.execute(select(ServerModel))
        db_servers = res.scalars().all()
        existing_ids = {s['id'] for s in SERVERS}
        for srv in db_servers:
            server_org_map[srv.id] = getattr(srv, 'org_id', None)
            if srv.id not in existing_ids:
                SERVERS.append({
                    'id': srv.id, 'name': srv.name, 'host': srv.host,
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
    agent_fresh_ttl = int(APP_SETTINGS.get('agent_fresh_ttl', '20'))
    for s in SERVERS:
        oid = s.get('org_id') or server_org_map.get(s['id'])
        # Фильтр по организации: не-админы видят только серверы своих организаций
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

        # Для monitor_type=agent принудительно считаем down, если агент не присылал
        # свежих данных в пределах TTL. Это убирает эффект "ещё активен" после Stop.
        if s.get('monitor_type', 'agent') == 'agent':
            agent_data = AGENT_METRICS.get(s['id']) or {}
            agent_ts = int(agent_data.get('timestamp') or 0)
            if (now_ts - agent_ts) > agent_fresh_ttl:
                status_val = 'down'

        _agent_full = AGENT_METRICS.get(s['id'])
        # Исключаем тяжёлые поля из списка серверов — они доступны через /detail
        _agent_light = {k: v for k, v in (_agent_full or {}).items()
                        if k not in ('recent_logs', 'processes_detail', 'docker_containers', 'virtual_machines', 'services')} or None
        servers_out.append({
            'id': s['id'], 'name': s['name'], 'host': s.get('host'),
            'org_id': oid,
            'monitor_type': s.get('monitor_type', 'agent'),
            'status': status_val, 'last_ping': last_ping, 'last_metrics': last_metrics,
            'agent_data': _agent_light,
            'agent_key_count': active_token_counts.get(s['id'], 0),
        })
    return {'servers': servers_out}


@app.post('/api/servers')
async def create_server(data: ServerCreate, current_user: dict = Depends(get_current_user)):
    """Добавить новый сервер"""
    # Проверить что ID не занят
    for s in SERVERS:
        if s['id'] == data.id:
            raise HTTPException(status_code=400, detail='Server with this ID already exists')
    async with db.get_session() as session:
        res = await session.execute(select(ServerModel).where(ServerModel.id == data.id))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail='Server with this ID already exists')
        server = ServerModel(
            id=data.id, name=data.name, host=data.host,
            org_id=data.org_id,
            monitor_type=data.monitor_type or 'agent',
            ssh_user=data.ssh_user, ssh_port=data.ssh_port or 22,
            ssh_password=encrypt_field(data.ssh_password), ssh_key_path=data.ssh_key_path,
            winrm_user=data.winrm_user, winrm_password=encrypt_field(data.winrm_password),
            winrm_port=data.winrm_port or 5985, winrm_use_ssl=data.winrm_use_ssl or False,
        )
        session.add(server)
        await session.commit()
    new_server = {
        'id': data.id, 'name': data.name, 'host': data.host,
        'org_id': data.org_id,
        'monitor_type': data.monitor_type or 'agent',
        'ssh_user': data.ssh_user, 'ssh_port': data.ssh_port or 22,
        # Never store plaintext credentials in memory — use encrypted DB values
        'ssh_key_path': data.ssh_key_path,
        'winrm_user': data.winrm_user,
        'winrm_port': data.winrm_port or 5985, 'winrm_use_ssl': data.winrm_use_ssl or False,
    }
    SERVERS.append(new_server)
    response = {
        'id': data.id, 'name': data.name, 'host': data.host, 'org_id': data.org_id,
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


@app.get('/api/servers/{server_id}/agent-keys', response_model=list[AgentTokenResponse])
async def list_server_agent_keys(server_id: str, current_user: dict = Depends(get_admin_user)):
    async with db.get_session() as session:
        server = await session.get(ServerModel, server_id)
        if not server:
            raise HTTPException(status_code=404, detail='Server not found')
        res = await session.execute(select(AgentTokenModel).where(AgentTokenModel.server_id == server_id).order_by(AgentTokenModel.created_at.desc()))
        return res.scalars().all()


@app.post('/api/servers/{server_id}/agent-key', response_model=AgentTokenResponse)
async def create_server_agent_key(server_id: str, current_user: dict = Depends(get_admin_user)):
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


@app.delete('/api/servers/{server_id}/agent-keys/{key_id}')
async def revoke_server_agent_key(server_id: str, key_id: int, current_user: dict = Depends(get_admin_user)):
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


@app.delete('/api/servers/{server_id}')
async def delete_server(server_id: str, current_user: dict = Depends(get_current_user)):
    """Удалить сервер"""
    async with db.get_session() as session:
        res = await session.execute(select(ServerModel).where(ServerModel.id == server_id))
        server = res.scalars().first()
        if not server:
            raise HTTPException(status_code=404, detail='Server not found')
        await session.delete(server)
        await session.commit()
    SERVERS[:] = [s for s in SERVERS if s['id'] != server_id]
    return {'message': 'Server deleted'}


@app.get('/api/servers/{server_id}/metrics')
async def server_metrics(server_id: str, limit: int = 500, from_ts: int = None, to_ts: int = None, current_user: dict = Depends(get_current_user)):
    limit = max(1, min(limit, 1000))
    if from_ts is not None and to_ts is not None and from_ts > to_ts:
        raise HTTPException(status_code=400, detail='from_ts must be less than or equal to to_ts')
    items = [m for m in METRICS_STORE if m.get('payload', {}).get('server_id') == server_id]
    if from_ts is not None:
        items = [m for m in items if m.get('received_at', 0) >= from_ts]
    if to_ts is not None:
        items = [m for m in items if m.get('received_at', 0) <= to_ts]
    return {'metrics': items[-limit:]}


@app.get('/api/websites')
async def list_websites(request: Request, current_user: dict = Depends(get_current_user)):
    # Фильтрация по организации
    user_org_ids = None
    role = current_user.get("role")
    if role != "admin":
        user_org_ids = current_user.get("org_ids", [])

    # Загрузить актуальный список из БД
    website_org_map = {}
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel))
        db_websites = res.scalars().all()
        existing_ids = {w['id'] for w in WEBSITES}
        for ws in db_websites:
            website_org_map[ws.id] = getattr(ws, 'org_id', None)
            if ws.id not in existing_ids:
                WEBSITES.append({'id': ws.id, 'name': ws.name, 'url': ws.url, 'org_id': getattr(ws, 'org_id', None)})

    out = []
    for w in WEBSITES:
        oid = w.get('org_id') or website_org_map.get(w['id'])
        # Фильтр: не-админы видят только сайты своих организаций
        if user_org_ids is not None:
            if oid is None or oid not in user_org_ids:
                continue
        last = None
        for p in reversed(PROBES_STORE[-500:]):
            pl = p.get('payload', {})
            if pl.get('target') == w.get('url'):
                last = pl
                break
        out.append({**w, 'org_id': oid, 'last_probe': last, 'ssl': SSL_INFO.get(w.get('url'))})
    return {'websites': out}


@app.post('/api/websites')
async def create_website(data: WebsiteCreate, current_user: dict = Depends(get_current_user)):
    """Добавить новый сайт"""
    for w in WEBSITES:
        if w['id'] == data.id:
            raise HTTPException(status_code=400, detail='Website with this ID already exists')
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == data.id))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail='Website with this ID already exists')
        website = WebsiteModel(id=data.id, name=data.name, url=data.url, org_id=data.org_id)
        session.add(website)
        await session.commit()
    new_site = {'id': data.id, 'name': data.name, 'url': data.url, 'org_id': data.org_id}
    WEBSITES.append(new_site)
    return new_site


@app.delete('/api/websites/{website_id}')
async def delete_website(website_id: str, current_user: dict = Depends(get_current_user)):
    """Удалить сайт"""
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == website_id))
        website = res.scalars().first()
        if not website:
            raise HTTPException(status_code=404, detail='Website not found')
        await session.delete(website)
        await session.commit()
    WEBSITES[:] = [w for w in WEBSITES if w['id'] != website_id]
    return {'message': 'Website deleted'}


@app.get('/api/websites/{website_id}/probes')
async def website_probes(website_id: str, limit: int = 100, from_ts: int = None, to_ts: int = None, current_user: dict = Depends(get_current_user)):
    limit = max(1, min(limit, 1000))
    if from_ts is not None and to_ts is not None and from_ts > to_ts:
        raise HTTPException(status_code=400, detail='from_ts must be less than or equal to to_ts')
    # Read website by id from DB, then fetch probes matching target
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == website_id))
        wrow = res.scalars().first()
        if not wrow:
            return {'probes': []}
        target = wrow.url
        # fetch recent probes and filter by payload.target == target
        from_dt = datetime.datetime.utcfromtimestamp(from_ts) if from_ts else None
        to_dt = datetime.datetime.utcfromtimestamp(to_ts) if to_ts else None
        stmt = select(ProbeModel).order_by(ProbeModel.received_at.desc())
        if from_dt:
            stmt = stmt.where(ProbeModel.received_at >= from_dt)
        if to_dt:
            stmt = stmt.where(ProbeModel.received_at <= to_dt)
        stmt = stmt.limit(1000)
        q = await session.execute(stmt)
        rows = q.scalars().all()
        filtered = []
        for r in rows:
            pl = r.payload or {}
            if pl.get('target') == target:
                filtered.append({'payload': pl, 'received_at': r.received_at.isoformat()})
                if len(filtered) >= limit:
                    break
        return {'probes': list(reversed(filtered))}


@app.get('/api/websites/{website_id}/protocol-probes')
async def website_protocol_probes(
    website_id: str,
    limit: int = 120,
    from_ts: int = None,
    to_ts: int = None,
    current_user: dict = Depends(get_current_user),
):
    """
    from_ts / to_ts — Unix-секунды (не миллисекунды).
    При их отсутствии возвращаются последние `limit` точек по каждому протоколу.
    """
    limit = max(1, min(limit, 1000))
    from_dt = datetime.datetime.utcfromtimestamp(from_ts) if from_ts else None
    to_dt   = datetime.datetime.utcfromtimestamp(to_ts)   if to_ts   else None

    async with db.get_session() as session:
        from collections import defaultdict
        by_proto = defaultdict(list)
        for proto in ('http', 'https', 'icmp', 'tcp_443'):
            stmt = select(WebsiteProtocolProbeModel).where(
                WebsiteProtocolProbeModel.website_id == website_id,
                WebsiteProtocolProbeModel.protocol == proto,
            )
            if from_dt:
                stmt = stmt.where(WebsiteProtocolProbeModel.checked_at >= from_dt)
            if to_dt:
                stmt = stmt.where(WebsiteProtocolProbeModel.checked_at <= to_dt)

            if from_dt or to_dt:
                # временной диапазон задан — берём всё в хронологическом порядке
                stmt = stmt.order_by(WebsiteProtocolProbeModel.checked_at.asc()).limit(1000)
                res = await session.execute(stmt)
                rows = res.scalars().all()
            else:
                # «все данные» — берём последние N точек, потом разворачиваем
                stmt = stmt.order_by(WebsiteProtocolProbeModel.checked_at.desc()).limit(limit)
                res = await session.execute(stmt)
                rows = list(reversed(res.scalars().all()))

            by_proto[proto] = [
                {
                    'time': r.checked_at.isoformat(),
                    'rt': round(r.response_time, 1) if r.response_time is not None else None,
                    'status': r.status,
                }
                for r in rows
            ]
        return {'website_id': website_id, 'protocols': dict(by_proto)}


@app.get('/api/health-check')
async def health_check_all(current_user: dict = Depends(get_current_user)):
    """Проверить все сайты и серверы — возвращает оперативный health check"""
    user_org_ids = None
    role = current_user.get("role")
    if role != "admin":
        user_org_ids = current_user.get("org_ids", [])

    results = {'websites': [], 'servers': [], 'summary': {}}

    # --- Websites ---
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel))
        websites = res.scalars().all()
        res2 = await session.execute(select(ServerModel))
        servers = res2.scalars().all()

    ws_up = ws_down = ws_degraded = 0
    for w in websites:
        oid = getattr(w, 'org_id', None)
        if user_org_ids is not None and (oid is None or oid not in user_org_ids):
            continue
        probe_result = await probe_url(w.url)
        entry = {
            'id': w.id, 'name': w.name, 'url': w.url, 'org_id': oid,
            'status': probe_result['status'],
            'status_code': probe_result.get('status_code', 0),
            'response_time': probe_result.get('response_time'),
            'ssl': probe_result.get('ssl'),
        }
        results['websites'].append(entry)
        if probe_result['status'] == 'up':
            ws_up += 1
        elif probe_result['status'] == 'degraded':
            ws_degraded += 1
        else:
            ws_down += 1

    # --- Servers ---
    srv_up = srv_down = 0
    for s in servers:
        oid = getattr(s, 'org_id', None)
        if user_org_ids is not None and (oid is None or oid not in user_org_ids):
            continue
        host = s.host
        if not host:
            continue
        ping_result = await ping_host(host)
        entry = {
            'id': s.id, 'name': s.name, 'host': host, 'org_id': oid,
            'status': ping_result['status'],
            'response_time': ping_result.get('response_time'),
        }
        results['servers'].append(entry)
        if ping_result['status'] == 'ok':
            srv_up += 1
        else:
            srv_down += 1

    results['summary'] = {
        'websites_total': ws_up + ws_down + ws_degraded,
        'websites_up': ws_up, 'websites_down': ws_down, 'websites_degraded': ws_degraded,
        'servers_total': srv_up + srv_down,
        'servers_up': srv_up, 'servers_down': srv_down,
        'checked_at': datetime.datetime.utcnow().isoformat(),
    }
    return results


@app.post('/api/health-check/test-protocol')
async def test_protocol_health_check(
    target: str,
    protocol: str = 'icmp',
    port: int = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Проверить здоровье хоста/сайта с указанным протоколом.
    Протоколы: icmp, tcp, http, https, dns
    """
    if not target:
        raise HTTPException(status_code=400, detail="target required")
    
    if protocol not in ('icmp', 'tcp', 'http', 'https', 'dns'):
        raise HTTPException(status_code=400, detail=f"Неизвестный протокол: {protocol}")
    
    result = await health_check_protocol(target, protocol, port)
    return result


@app.get('/api/health-check/multi-protocol')
async def multi_protocol_health_check(
    target: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Проверить здоровье хоста по всем доступным протоколам одновременно.
    Возвращает результаты для: icmp, tcp (80, 443, 22), http, https, dns
    """
    if not target:
        raise HTTPException(status_code=400, detail="target required")
    
    results = {
        'target': target,
        'timestamp': int(time.time()),
        'checks': {}
    }
    
    # Проверить все протоколы параллельно
    tasks = {
        'icmp': health_check_protocol(target, 'icmp'),
        'tcp_80': health_check_protocol(target, 'tcp', 80),
        'tcp_443': health_check_protocol(target, 'tcp', 443),
        'tcp_22': health_check_protocol(target, 'tcp', 22),
        'http': health_check_protocol(target, 'http'),
        'https': health_check_protocol(target, 'https'),
        'dns': health_check_protocol(target, 'dns'),
    }
    
    for check_name, task in tasks.items():
        try:
            results['checks'][check_name] = await task
        except Exception as e:
            results['checks'][check_name] = {
                'status': 'error',
                'error': str(e),
                'checked_at': int(time.time())
            }
    
    # Обобщить результаты
    available_checks = [c for c in results['checks'].values() if c.get('status') in ('ok', 'up')]
    results['summary'] = {
        'total_checks': len(results['checks']),
        'successful': len(available_checks),
        'overall_status': 'up' if available_checks else 'down'
    }
    
    return results


@app.get('/api/health-check/history')
async def health_check_history(website_id: str = None, limit: int = 50, current_user: dict = Depends(get_current_user)):
    """Получить историю проверок сайтов из probes для графиков"""
    async with db.get_session() as session:
        if website_id:
            res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == website_id))
            w = res.scalars().first()
            if not w:
                return {'history': []}
            q = await session.execute(
                select(ProbeModel).order_by(ProbeModel.received_at.desc()).limit(2000)
            )
            rows = q.scalars().all()
            items = []
            for r in rows:
                pl = r.payload or {}
                if pl.get('target') == w.url:
                    items.append({
                        'status': pl.get('status', 'unknown'),
                        'status_code': pl.get('status_code', 0),
                        'response_time': pl.get('response_time'),
                        'timestamp': pl.get('timestamp') or (r.received_at.timestamp() if r.received_at else 0),
                    })
                    if len(items) >= limit:
                        break
            return {'history': list(reversed(items))}
        else:
            # Все сайты — агрегат
            q = await session.execute(
                select(ProbeModel).order_by(ProbeModel.received_at.desc()).limit(500)
            )
            rows = q.scalars().all()
            items = []
            for r in rows:
                pl = r.payload or {}
                items.append({
                    'website_id': pl.get('website_id', ''),
                    'target': pl.get('target', ''),
                    'status': pl.get('status', 'unknown'),
                    'status_code': pl.get('status_code', 0),
                    'response_time': pl.get('response_time'),
                    'timestamp': pl.get('timestamp') or (r.received_at.timestamp() if r.received_at else 0),
                })
            return {'history': list(reversed(items))}


@app.get('/api/alerts')
async def list_alerts(active_only: bool = False, limit: int = 100, org_id: int = None, current_user: dict = Depends(get_current_user)):
    limit = min(max(1, limit), 500)  # cap: 1–500
    """Получить алерты, опционально по организации"""
    try:
        async with db.get_session() as session:
            q = select(AlertModel)
            if active_only:
                q = q.where(AlertModel.is_active == True)

            role = current_user.get('role')
            user_org_ids = None if role == 'admin' else current_user.get('org_ids', [])

            filter_org_ids = None
            if org_id is not None:
                if user_org_ids is not None and org_id not in user_org_ids:
                    return {'alerts': []}
                filter_org_ids = [org_id]
            elif user_org_ids is not None:
                filter_org_ids = user_org_ids

            # Фильтрация по org_id: найти target_id серверов/сайтов этой организации
            if filter_org_ids is not None:
                srv_res = await session.execute(select(ServerModel.id).where(ServerModel.org_id.in_(filter_org_ids)))
                srv_ids = [str(s) for s in srv_res.scalars().all()]
                ws_res = await session.execute(select(WebsiteModel.id).where(WebsiteModel.org_id.in_(filter_org_ids)))
                ws_ids = [str(w) for w in ws_res.scalars().all()]
                from sqlalchemy import or_, and_
                conditions = []
                if srv_ids:
                    conditions.append(and_(AlertModel.target_type == 'server', AlertModel.target_id.in_(srv_ids)))
                if ws_ids:
                    conditions.append(and_(AlertModel.target_type == 'website', AlertModel.target_id.in_(ws_ids)))
                if conditions:
                    q = q.where(or_(*conditions))
                else:
                    return {'alerts': []}

            q = q.order_by(AlertModel.created_at.desc()).limit(limit)
            result = await session.execute(q)
            rows = result.scalars().all()
            alerts = []
            for r in rows:
                alerts.append({
                    'id': r.id,
                    'severity': r.severity,
                    'category': r.category,
                    'target_type': r.target_type,
                    'target_id': r.target_id,
                    'target_name': r.target_name,
                    'title': r.title,
                    'message': r.message,
                    'metric_key': r.metric_key,
                    'metric_value': r.metric_value,
                    'threshold': r.threshold,
                    'is_active': r.is_active,
                    'created_at': r.created_at.isoformat() if r.created_at else None,
                    'resolved_at': r.resolved_at.isoformat() if r.resolved_at else None,
                })
            return {'alerts': alerts}
    except Exception:
        # fallback to memory
        items = ALERTS_STORE[-limit:]
        if active_only:
            items = [a for a in items if a.get('is_active')]
        return {'alerts': list(reversed(items))}


@app.post('/api/alerts/{alert_id}/resolve')
async def resolve_alert_endpoint(alert_id: int, current_user: dict = Depends(get_current_user)):
    """Вручную разрешить алерт"""
    async with db.get_session() as session:
        res = await session.execute(select(AlertModel).where(AlertModel.id == alert_id))
        alert = res.scalars().first()
        if not alert:
            raise HTTPException(status_code=404, detail='Alert not found')
        alert.is_active = False
        alert.resolved_at = datetime.datetime.utcnow()
        await session.commit()
        # Remove from active keys
        key = f"{alert.target_type}:{alert.target_id}:{alert.metric_key or alert.title}"
        ACTIVE_ALERT_KEYS.discard(key)
    return {'message': 'Alert resolved'}


@app.delete('/api/alerts')
async def clear_alerts(current_user: dict = Depends(get_admin_user)):
    """Очистить все решённые алерты"""
    async with db.get_session() as session:
        from sqlalchemy import delete as sa_delete
        r = await session.execute(sa_delete(AlertModel).where(AlertModel.is_active == False))
        await session.commit()
        return {'message': f'Удалено {r.rowcount} решённых алертов'}


@app.get('/api/alerts/stats')
async def alerts_stats(org_id: int = None, current_user: dict = Depends(get_current_user)):
    """Статистика алертов, опционально по организации"""
    try:
        async with db.get_session() as session:
            q = select(AlertModel)

            role = current_user.get('role')
            user_org_ids = None if role == 'admin' else current_user.get('org_ids', [])

            filter_org_ids = None
            if org_id is not None:
                if user_org_ids is not None and org_id not in user_org_ids:
                    return {'total': 0, 'active': 0, 'critical': 0, 'warning': 0, 'resolved': 0}
                filter_org_ids = [org_id]
            elif user_org_ids is not None:
                filter_org_ids = user_org_ids

            if filter_org_ids is not None:
                srv_res = await session.execute(select(ServerModel.id).where(ServerModel.org_id.in_(filter_org_ids)))
                srv_ids = [str(s) for s in srv_res.scalars().all()]
                ws_res = await session.execute(select(WebsiteModel.id).where(WebsiteModel.org_id.in_(filter_org_ids)))
                ws_ids = [str(w) for w in ws_res.scalars().all()]
                from sqlalchemy import or_, and_
                conditions = []
                if srv_ids:
                    conditions.append(and_(AlertModel.target_type == 'server', AlertModel.target_id.in_(srv_ids)))
                if ws_ids:
                    conditions.append(and_(AlertModel.target_type == 'website', AlertModel.target_id.in_(ws_ids)))
                if conditions:
                    q = q.where(or_(*conditions))
                else:
                    return {'total': 0, 'active': 0, 'critical': 0, 'warning': 0, 'resolved': 0}

            total = await session.execute(q)
            all_alerts = total.scalars().all()
            active = sum(1 for a in all_alerts if a.is_active)
            critical = sum(1 for a in all_alerts if a.is_active and a.severity == 'critical')
            warning = sum(1 for a in all_alerts if a.is_active and a.severity == 'warning')
            return {
                'total': len(all_alerts),
                'active': active,
                'critical': critical,
                'warning': warning,
                'resolved': len(all_alerts) - active,
            }
    except Exception:
        return {'total': len(ALERTS_STORE), 'active': len(ACTIVE_ALERT_KEYS), 'critical': 0, 'warning': 0, 'resolved': 0}


# ============================================================
# EXTENDED SERVER ENDPOINTS
# ============================================================

@app.get('/api/servers/{server_id}/detail')
async def server_detail(server_id: str, current_user: dict = Depends(get_current_user)):
    """Получить полные данные от агента для сервера"""
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


# Prometheus metrics
REQUESTS_PING = Counter('backend_requests_ping_total', 'Count of ping requests')
REQUESTS_METRICS = Counter('backend_requests_metrics_total', 'Count of metrics POSTs')
REQUESTS_PROBE = Counter('backend_requests_probe_total', 'Count of probe POSTs')

# Uptime gauge
START_TIME = time.time()
REQUESTS_UPTIME = Gauge('backend_uptime_seconds', 'Backend uptime in seconds')


# --- Admin endpoints for user management ---

@app.get('/api/admin/users', response_model=list[UserResponse])
async def list_users(current_user: dict = Depends(get_admin_user)):
    """Получить список всех пользователей (только админ)"""
    try:
        async with db.get_session() as session:
            res = await session.execute(select(UserModel))
            users = res.scalars().all()
            return users
    except Exception:
        _logger.exception("Failed to list users")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get('/api/admin/users/{user_id}', response_model=UserResponse)
async def get_user(user_id: int, current_user: dict = Depends(get_admin_user)):
    """Получить информацию о пользователе (только админ)"""
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.id == user_id))
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user


@app.put('/api/admin/users/{user_id}', response_model=UserResponse)
async def update_user(user_id: int, user_data: UserUpdate, current_user: dict = Depends(get_admin_user)):
    """Обновить пользователя (только админ)"""
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.id == user_id))
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Обновить поля
        if user_data.email:
            res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
            existing = res.scalars().first()
            if existing and existing.id != user_id:
                raise HTTPException(status_code=400, detail="Email already taken")
            user.email = user_data.email

        if user_data.username:
            res = await session.execute(select(UserModel).where(UserModel.username == user_data.username))
            existing = res.scalars().first()
            if existing and existing.id != user_id:
                raise HTTPException(status_code=400, detail="Username already taken")
            user.username = user_data.username
        
        if user_data.role:
            user.role = user_data.role
        
        if user_data.is_active is not None:
            user.is_active = user_data.is_active
        
        await session.commit()
        await session.refresh(user)
        return user


@app.delete('/api/admin/users/{user_id}', response_model=MessageResponse)
async def delete_user(user_id: int, current_user: dict = Depends(get_admin_user)):
    """Удалить пользователя (только админ)"""
    if int(current_user["user_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.id == user_id))
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        await session.delete(user)
        await session.commit()
        return {"message": "User deleted successfully"}


@app.post('/api/admin/users', response_model=UserResponse)
async def create_user(user_data: UserRegister, current_user: dict = Depends(get_admin_user)):
    """Создать нового пользователя (только админ)"""
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        res = await session.execute(select(UserModel).where(UserModel.username == user_data.username))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail="Username already taken")
        
        role = UserRole.VIEWER
        if hasattr(user_data, 'role') and user_data.role:
            try:
                role = UserRole(user_data.role)
            except ValueError:
                pass
        
        user = UserModel(
            email=user_data.email,
            username=user_data.username,
            hashed_password=get_password_hash(user_data.password),
            role=role,
            is_active=True
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


# --- Settings endpoints ---

@app.get('/api/settings')
async def get_settings(current_user: dict = Depends(get_current_user)):
    """Получить все настройки"""
    async with db.get_session() as session:
        res = await session.execute(select(SettingModel))
        rows = res.scalars().all()
        result = []
        for row in rows:
            result.append({
                'key': row.key,
                'value': row.value,
                'description': row.description or DEFAULT_SETTINGS.get(row.key, {}).get('description', ''),
            })
        # Добавить дефолтные если отсутствуют в БД
        existing_keys = {r['key'] for r in result}
        for key, info in DEFAULT_SETTINGS.items():
            if key not in existing_keys:
                result.append({'key': key, 'value': info['value'], 'description': info['description']})
        return {'settings': result}


@app.put('/api/settings')
async def update_settings(data: SettingsUpdate, current_user: dict = Depends(get_admin_user)):
    """Обновить настройки (только админ)"""
    async with db.get_session() as session:
        for key, value in data.settings.items():
            # Валидация: только известные ключи
            if key not in DEFAULT_SETTINGS:
                continue
            value_str = str(value)
            # Валидация числовых значений
            if key in ('ping_interval', 'probe_interval', 'ping_timeout', 'probe_timeout',
                        'max_metrics_store', 'max_probes_store', 'max_logs_store', 'data_retention_hours',
                        'alert_cpu_threshold', 'alert_ram_threshold', 'alert_disk_threshold',
                        'alert_swap_threshold', 'alert_ping_threshold', 'ssl_expiry_warn_days'):
                try:
                    num = int(value_str)
                    if num < 0:
                        continue
                    if key in ('ping_interval', 'probe_interval') and num < 5:
                        value_str = '5'  # Минимум 5 секунд
                except ValueError:
                    continue
            # Валидация boolean полей
            if key in ('monitoring_enabled', 'ping_enabled', 'probe_enabled', 'alerts_enabled', 'ssl_check_enabled'):
                if value_str not in ('true', 'false'):
                    continue

            res = await session.execute(select(SettingModel).where(SettingModel.key == key))
            existing = res.scalars().first()
            if existing:
                existing.value = value_str
            else:
                desc = DEFAULT_SETTINGS.get(key, {}).get('description', '')
                session.add(SettingModel(key=key, value=value_str, description=desc))
            # Обновить in-memory
            APP_SETTINGS[key] = value_str
        await session.commit()
    return {'message': 'Настройки обновлены', 'settings': dict(APP_SETTINGS)}


@app.post('/api/settings/reset')
async def reset_settings(current_user: dict = Depends(get_admin_user)):
    """Сбросить настройки к значениям по умолчанию (только админ)"""
    async with db.get_session() as session:
        for key, info in DEFAULT_SETTINGS.items():
            res = await session.execute(select(SettingModel).where(SettingModel.key == key))
            existing = res.scalars().first()
            if existing:
                existing.value = info['value']
            APP_SETTINGS[key] = info['value']
        await session.commit()
    return {'message': 'Настройки сброшены', 'settings': dict(APP_SETTINGS)}


async def _run_data_cleanup() -> dict:
    """Выполнить очистку старых данных — возвращает статистику удалённых записей."""
    from sqlalchemy import delete as sa_delete
    retention_hours = int(APP_SETTINGS.get('data_retention_hours', '168'))
    if retention_hours <= 0:
        return {'metrics': 0, 'probes': 0, 'logs': 0}
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=retention_hours)
    deleted = {'metrics': 0, 'probes': 0, 'logs': 0}
    try:
        async with db.get_session() as session:
            r = await session.execute(sa_delete(MetricModel).where(MetricModel.received_at < cutoff))
            deleted['metrics'] = r.rowcount
            r = await session.execute(sa_delete(ProbeModel).where(ProbeModel.received_at < cutoff))
            deleted['probes'] = r.rowcount
            r = await session.execute(sa_delete(LogModel).where(LogModel.received_at < cutoff))
            deleted['logs'] = r.rowcount
            await session.commit()
        cutoff_ts = int(cutoff.timestamp())
        METRICS_STORE[:] = [m for m in METRICS_STORE if m.get('received_at', 0) > cutoff_ts]
        PROBES_STORE[:] = [p for p in PROBES_STORE if p.get('received_at', 0) > cutoff_ts]
        LOGS_STORE[:] = [l for l in LOGS_STORE if l.get('received_at', 0) > cutoff_ts]
    except Exception:
        pass
    return deleted


async def background_data_cleanup():
    """Фоновая задача: автоматическая очистка старых записей из БД раз в час."""
    await asyncio.sleep(300)  # первый запуск через 5 минут после старта
    while True:
        try:
            deleted = await _run_data_cleanup()
            if any(deleted.values()):
                _logger.info("Auto cleanup: metrics=%d probes=%d logs=%d",
                             deleted['metrics'], deleted['probes'], deleted['logs'])
        except Exception as exc:
            _logger.warning("Auto cleanup error: %s", exc)
        await asyncio.sleep(3600)  # раз в час


@app.post('/api/data/cleanup')
async def cleanup_data(current_user: dict = Depends(get_admin_user)):
    """Очистить старые данные мониторинга (только админ)"""
    deleted = await _run_data_cleanup()
    return {'message': f'Очищено: метрик={deleted["metrics"]}, проб={deleted["probes"]}, логов={deleted["logs"]}', 'deleted': deleted}


# ============================================================
# DOCKER — Агрегированный вид со всех серверов
# ============================================================

@app.get('/api/docker/containers')
async def docker_all_containers(current_user: dict = Depends(get_admin_user)):
    """Агрегированный список Docker-контейнеров со всех серверов"""
    result = []
    for s in SERVERS:
        agent = AGENT_METRICS.get(s['id'])
        if not agent:
            continue
        containers = agent.get('docker_containers')
        if not containers:
            continue
        for c in containers:
            result.append({**c, 'server_id': s['id'], 'server_name': s.get('name', s['id'])})
    return {'containers': result, 'total': len(result)}


@app.get('/api/docker/stats')
async def docker_stats(current_user: dict = Depends(get_admin_user)):
    """Статистика Docker по всем серверам"""
    total = 0
    running = 0
    stopped = 0
    servers_with_docker = 0
    for s in SERVERS:
        agent = AGENT_METRICS.get(s['id'])
        if not agent:
            continue
        containers = agent.get('docker_containers')
        if containers is not None:
            servers_with_docker += 1
            for c in containers:
                total += 1
                if c.get('status') == 'running':
                    running += 1
                else:
                    stopped += 1
    return {'total': total, 'running': running, 'stopped': stopped, 'servers_with_docker': servers_with_docker}


# ============================================================
# KUBERNETES — Мониторинг
# ============================================================

KUBE_CACHE: dict = {}  # cluster_id -> {pods, nodes, ...}

@app.get('/api/kubernetes/clusters')
async def kube_list_clusters(current_user: dict = Depends(get_admin_user)):
    """Список кластеров Kubernetes"""
    async with db.get_session() as session:
        res = await session.execute(select(KubeClusterModel))
        clusters = res.scalars().all()
        result = []
        for c in clusters:
            cached = KUBE_CACHE.get(c.id, {})
            result.append({
                'id': c.id, 'name': c.name, 'api_url': c.api_url,
                'is_active': c.is_active, 'last_status': c.last_status,
                'last_check': c.last_check.isoformat() if c.last_check else None,
                'pods': cached.get('pods', []),
                'nodes': cached.get('nodes', []),
                'namespaces': cached.get('namespaces', []),
                'deployments': cached.get('deployments', []),
                'stats': cached.get('stats', {}),
            })
        return {'clusters': result}


@app.post('/api/kubernetes/clusters')
async def kube_add_cluster(request: Request, current_user: dict = Depends(get_current_user)):
    """Добавить кластер Kubernetes"""
    data = await request.json()
    name = data.get('name', '').strip()
    api_url = data.get('api_url', '').strip()
    token = data.get('token', '').strip()
    if not name or not api_url:
        raise HTTPException(status_code=400, detail='name и api_url обязательны')
    async with db.get_session() as session:
        cluster = KubeClusterModel(name=name, api_url=api_url, token=token or None)
        session.add(cluster)
        await session.commit()
        await session.refresh(cluster)
        return {'id': cluster.id, 'name': cluster.name, 'api_url': cluster.api_url}


@app.delete('/api/kubernetes/clusters/{cluster_id}')
async def kube_delete_cluster(cluster_id: int, current_user: dict = Depends(get_current_user)):
    """Удалить кластер Kubernetes"""
    async with db.get_session() as session:
        res = await session.execute(select(KubeClusterModel).where(KubeClusterModel.id == cluster_id))
        cluster = res.scalars().first()
        if not cluster:
            raise HTTPException(status_code=404, detail='Cluster not found')
        await session.delete(cluster)
        await session.commit()
    KUBE_CACHE.pop(cluster_id, None)
    return {'message': 'Cluster deleted'}


@app.post('/api/kubernetes/clusters/{cluster_id}/refresh')
async def kube_refresh_cluster(cluster_id: int, current_user: dict = Depends(get_admin_user)):
    """Обновить данные кластера"""
    async with db.get_session() as session:
        res = await session.execute(select(KubeClusterModel).where(KubeClusterModel.id == cluster_id))
        cluster = res.scalars().first()
        if not cluster:
            raise HTTPException(status_code=404, detail='Cluster not found')
        data = await _fetch_kube_data(cluster.api_url, cluster.token)
        KUBE_CACHE[cluster.id] = data
        cluster.last_check = datetime.datetime.utcnow()
        cluster.last_status = 'ok' if data.get('connected') else 'error'
        await session.commit()
        return {'status': cluster.last_status, 'data': data}


async def _fetch_kube_data(api_url: str, token: str | None) -> dict:
    """Запросить данные из Kubernetes API"""
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    result = {'connected': False, 'pods': [], 'nodes': [], 'namespaces': [], 'deployments': [], 'stats': {}}
    try:
        async with httpx.AsyncClient(verify=not ALLOW_INSECURE_TLS, timeout=10) as client:
            # Nodes
            try:
                r = await client.get(f'{api_url}/api/v1/nodes', headers=headers)
                if r.status_code == 200:
                    result['connected'] = True
                    nodes_data = r.json().get('items', [])
                    for n in nodes_data:
                        meta = n.get('metadata', {})
                        status = n.get('status', {})
                        conditions = {c['type']: c['status'] for c in status.get('conditions', [])}
                        alloc = status.get('allocatable', {})
                        result['nodes'].append({
                            'name': meta.get('name'),
                            'status': 'Ready' if conditions.get('Ready') == 'True' else 'NotReady',
                            'cpu': alloc.get('cpu', '—'),
                            'memory': alloc.get('memory', '—'),
                            'pods_capacity': alloc.get('pods', '—'),
                            'os': status.get('nodeInfo', {}).get('osImage', '—'),
                            'kernel': status.get('nodeInfo', {}).get('kernelVersion', '—'),
                            'runtime': status.get('nodeInfo', {}).get('containerRuntimeVersion', '—'),
                            'kubelet': status.get('nodeInfo', {}).get('kubeletVersion', '—'),
                        })
            except Exception:
                pass
            # Namespaces
            try:
                r = await client.get(f'{api_url}/api/v1/namespaces', headers=headers)
                if r.status_code == 200:
                    for ns in r.json().get('items', []):
                        result['namespaces'].append({
                            'name': ns.get('metadata', {}).get('name'),
                            'status': ns.get('status', {}).get('phase', '—'),
                        })
            except Exception:
                pass
            # Pods
            try:
                r = await client.get(f'{api_url}/api/v1/pods', headers=headers)
                if r.status_code == 200:
                    result['connected'] = True
                    for p in r.json().get('items', []):
                        meta = p.get('metadata', {})
                        spec = p.get('spec', {})
                        pstatus = p.get('status', {})
                        containers = []
                        for cs in pstatus.get('containerStatuses', []):
                            containers.append({
                                'name': cs.get('name'),
                                'ready': cs.get('ready', False),
                                'restarts': cs.get('restartCount', 0),
                                'state': list(cs.get('state', {}).keys())[0] if cs.get('state') else 'unknown',
                                'image': cs.get('image', '—'),
                            })
                        result['pods'].append({
                            'name': meta.get('name'),
                            'namespace': meta.get('namespace'),
                            'node': spec.get('nodeName', '—'),
                            'status': pstatus.get('phase', 'Unknown'),
                            'ip': pstatus.get('podIP', '—'),
                            'containers': containers,
                            'restarts': sum(c.get('restarts', 0) for c in containers),
                            'created': meta.get('creationTimestamp', '—'),
                        })
            except Exception:
                pass
            # Deployments
            try:
                r = await client.get(f'{api_url}/apis/apps/v1/deployments', headers=headers)
                if r.status_code == 200:
                    for d in r.json().get('items', []):
                        meta = d.get('metadata', {})
                        dstatus = d.get('status', {})
                        result['deployments'].append({
                            'name': meta.get('name'),
                            'namespace': meta.get('namespace'),
                            'replicas': dstatus.get('replicas', 0),
                            'ready': dstatus.get('readyReplicas', 0),
                            'available': dstatus.get('availableReplicas', 0),
                            'updated': dstatus.get('updatedReplicas', 0),
                        })
            except Exception:
                pass
            # Stats
            total_pods = len(result['pods'])
            running_pods = sum(1 for p in result['pods'] if p['status'] == 'Running')
            result['stats'] = {
                'total_pods': total_pods,
                'running_pods': running_pods,
                'failed_pods': sum(1 for p in result['pods'] if p['status'] == 'Failed'),
                'pending_pods': sum(1 for p in result['pods'] if p['status'] == 'Pending'),
                'total_nodes': len(result['nodes']),
                'ready_nodes': sum(1 for n in result['nodes'] if n['status'] == 'Ready'),
                'total_deployments': len(result['deployments']),
                'total_namespaces': len(result['namespaces']),
            }
    except Exception:
        pass
    return result


# ============================================================
# TELEGRAM BOTS — Мониторинг
# ============================================================

@app.get('/api/telegram/bots')
async def telegram_list_bots(current_user: dict = Depends(get_admin_user)):
    """Список Telegram-ботов"""
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel))
        bots = res.scalars().all()
        return {'bots': [{
            'id': b.id, 'name': b.name, 'chat_id': b.chat_id,
            'is_active': b.is_active, 'last_status': b.last_status,
            'last_username': b.last_username, 'last_info': b.last_info,
            'last_check': b.last_check.isoformat() if b.last_check else None,
            'created_at': b.created_at.isoformat() if b.created_at else None,
        } for b in bots]}


@app.post('/api/telegram/bots')
async def telegram_add_bot(request: Request, current_user: dict = Depends(get_current_user)):
    """Добавить Telegram-бота"""
    data = await request.json()
    name = data.get('name', '').strip()
    token = data.get('token', '').strip()
    chat_id = data.get('chat_id', '').strip()
    if not name or not token:
        raise HTTPException(status_code=400, detail='name и token обязательны')
    async with db.get_session() as session:
        bot = TelegramBotModel(name=name, token=token, chat_id=chat_id or None)
        session.add(bot)
        await session.commit()
        await session.refresh(bot)
        # Сразу проверить
        info = await _check_telegram_bot(token)
        bot.last_check = datetime.datetime.utcnow()
        bot.last_status = info.get('status', 'unknown')
        bot.last_username = info.get('username')
        bot.last_info = info
        await session.commit()
        return {'id': bot.id, 'name': bot.name, 'status': info.get('status'), 'info': info}


@app.delete('/api/telegram/bots/{bot_id}')
async def telegram_delete_bot(bot_id: int, current_user: dict = Depends(get_current_user)):
    """Удалить Telegram-бота"""
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        await session.delete(bot)
        await session.commit()
    return {'message': 'Bot deleted'}


@app.post('/api/telegram/bots/{bot_id}/check')
async def telegram_check_bot(bot_id: int, current_user: dict = Depends(get_admin_user)):
    """Проверить Telegram-бота"""
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        info = await _check_telegram_bot(bot.token)
        bot.last_check = datetime.datetime.utcnow()
        bot.last_status = info.get('status', 'unknown')
        bot.last_username = info.get('username')
        # Считаем пользователей бота
        users_q = await session.execute(
            select(TelegramBotUserModel).where(TelegramBotUserModel.bot_id == bot_id)
        )
        bot_users = users_q.scalars().all()
        total_users = len(bot_users)
        active_users = sum(1 for u in bot_users if u.is_active)
        notify_critical = sum(1 for u in bot_users if u.is_active and u.notify_critical)
        notify_warning = sum(1 for u in bot_users if u.is_active and u.notify_warning)
        notify_info = sum(1 for u in bot_users if u.is_active and u.notify_info)
        info['users_stats'] = {
            'total': total_users,
            'active': active_users,
            'inactive': total_users - active_users,
            'notify_critical': notify_critical,
            'notify_warning': notify_warning,
            'notify_info': notify_info,
        }
        bot.last_info = info  # assigned after users_stats is populated
        await session.commit()
        return {'status': info.get('status'), 'info': info}


@app.post('/api/telegram/bots/{bot_id}/send')
async def telegram_send_test(bot_id: int, request: Request, current_user: dict = Depends(get_admin_user)):
    """Отправить тестовое сообщение"""
    data = await request.json()
    message = data.get('message', 'Тестовое сообщение от Monitoring System')
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        if not bot.chat_id:
            raise HTTPException(status_code=400, detail='chat_id не задан для бота')
        result = await _send_telegram_message(bot.token, bot.chat_id, message)
        return result


@app.get('/api/telegram/bots/{bot_id}/updates')
async def telegram_get_updates(bot_id: int, current_user: dict = Depends(get_admin_user)):
    """Получить последние обновления бота"""
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        updates = await _get_telegram_updates(bot.token)
        return {'updates': updates}


async def _check_telegram_bot(token: str) -> dict:
    """Проверить бота через Telegram API"""
    import time as _time
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            t0 = _time.time()
            r = await client.get(f'https://api.telegram.org/bot{token}/getMe')
            api_response_time = round((_time.time() - t0) * 1000, 1)
            if r.status_code == 200:
                data = r.json()
                if data.get('ok'):
                    bot_info = data['result']
                    # Получить количество обновлений
                    t1 = _time.time()
                    r2 = await client.get(f'https://api.telegram.org/bot{token}/getWebhookInfo')
                    webhook_response_time = round((_time.time() - t1) * 1000, 1)
                    webhook_info = r2.json().get('result', {}) if r2.status_code == 200 else {}
                    return {
                        'status': 'online',
                        'username': bot_info.get('username'),
                        'first_name': bot_info.get('first_name'),
                        'can_join_groups': bot_info.get('can_join_groups', False),
                        'can_read_messages': bot_info.get('can_read_all_group_messages', False),
                        'supports_inline': bot_info.get('supports_inline_queries', False),
                        'webhook_url': webhook_info.get('url', ''),
                        'pending_updates': webhook_info.get('pending_update_count', 0),
                        'api_response_time': api_response_time,
                        'webhook_response_time': webhook_response_time,
                        'checked_at': datetime.datetime.utcnow().isoformat(),
                    }
            return {'status': 'error', 'error': f'HTTP {r.status_code}', 'api_response_time': api_response_time}
    except Exception as e:
        return {'status': 'offline', 'error': str(e)}


async def _send_telegram_message(token: str, chat_id: str, text: str) -> dict:
    """Отправить сообщение в Telegram"""
    TG_ERROR_MAP = {
        "Forbidden: bots can't send messages to bots": "Невозможно отправить: этот Telegram ID принадлежит боту, а не пользователю",
        "Forbidden: bot was blocked by the user": "Пользователь заблокировал бота",
        "Forbidden: user is deactivated": "Аккаунт пользователя удалён",
        "Bad Request: chat not found": "Чат не найден — пользователь должен сначала написать боту /start",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f'https://api.telegram.org/bot{token}/sendMessage', json={
                'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'
            })
            data = r.json()
            if data.get('ok'):
                return {'sent': True, 'message_id': data['result'].get('message_id')}
            desc = data.get('description', 'Unknown error')
            return {'sent': False, 'error': TG_ERROR_MAP.get(desc, desc)}
    except Exception as e:
        return {'sent': False, 'error': str(e)}


async def _get_telegram_updates(token: str) -> list:
    """Получить последние обновления бота"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f'https://api.telegram.org/bot{token}/getUpdates', params={'limit': 20, 'offset': -20})
            if r.status_code == 200:
                data = r.json()
                if data.get('ok'):
                    updates = []
                    for u in data.get('result', []):
                        msg = u.get('message', {})
                        updates.append({
                            'update_id': u.get('update_id'),
                            'date': msg.get('date'),
                            'from': msg.get('from', {}).get('username', msg.get('from', {}).get('first_name', '—')),
                            'chat_id': msg.get('chat', {}).get('id'),
                            'chat_title': msg.get('chat', {}).get('title') or msg.get('chat', {}).get('first_name', '—'),
                            'text': msg.get('text', ''),
                        })
                    return updates
        return []
    except Exception:
        return []


# ============================================================
# TELEGRAM BOT USERS — Управление пользователями бота
# ============================================================

@app.post('/api/telegram/bots/{bot_id}/webhook')
async def telegram_bot_webhook(bot_id: int, request: Request):
    """Webhook для Telegram — auto-регистрация пользователей при /start"""
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            return {'ok': True}
        data = await request.json()
        msg = data.get('message', {})
        if not msg:
            return {'ok': True}
        from_user = msg.get('from', {})
        tg_id = str(from_user.get('id', ''))
        if not tg_id:
            return {'ok': True}
        text = (msg.get('text') or '').strip()
        # Проверяем, зарегистрирован ли уже
        existing = await session.execute(
            select(TelegramBotUserModel).where(
                TelegramBotUserModel.bot_id == bot_id,
                TelegramBotUserModel.telegram_id == tg_id
            )
        )
        user = existing.scalars().first()
        if text == '/start':
            if not user:
                user = TelegramBotUserModel(
                    bot_id=bot_id,
                    telegram_id=tg_id,
                    username=from_user.get('username'),
                    first_name=from_user.get('first_name'),
                    last_name=from_user.get('last_name'),
                )
                session.add(user)
                await session.commit()
            # Приветственное сообщение
            chat_id = str(msg.get('chat', {}).get('id', tg_id))
            await _send_telegram_message(
                bot.token, chat_id,
                f"✅ <b>Добро пожаловать!</b>\n\n"
                f"Вы зарегистрированы в системе мониторинга.\n"
                f"Администратор настроит для вас уведомления."
            )
        elif text == '/status':
            chat_id = str(msg.get('chat', {}).get('id', tg_id))
            if user and user.is_active:
                org_name = 'Не назначена'
                if user.org_id:
                    org_res = await session.execute(
                        select(OrganizationModel).where(OrganizationModel.id == user.org_id)
                    )
                    org = org_res.scalars().first()
                    if org:
                        org_name = org.name
                sevs = []
                if user.notify_critical:
                    sevs.append('Critical')
                if user.notify_warning:
                    sevs.append('Warning')
                if user.notify_info:
                    sevs.append('Info')
                cats = user.notify_categories if user.notify_categories else ['Все']
                await _send_telegram_message(
                    bot.token, chat_id,
                    f"📊 <b>Ваш статус</b>\n\n"
                    f"👤 {user.first_name or user.username or tg_id}\n"
                    f"🏢 Организация: {org_name}\n"
                    f"🔔 Серьезность: {', '.join(sevs) if sevs else 'Выкл'}\n"
                    f"📂 Категории: {', '.join(cats)}"
                )
            else:
                await _send_telegram_message(
                    bot.token, chat_id,
                    "❌ Вы не зарегистрированы или отключены. Отправьте /start"
                )
        # Обновляем данные пользователя
        if user:
            user.username = from_user.get('username') or user.username
            user.first_name = from_user.get('first_name') or user.first_name
            user.last_name = from_user.get('last_name') or user.last_name
            await session.commit()
    return {'ok': True}


@app.post('/api/telegram/bots/{bot_id}/setup-webhook')
async def telegram_setup_webhook(bot_id: int, request: Request, current_user: dict = Depends(get_admin_user)):
    """Установить webhook URL для бота"""
    data = await request.json()
    webhook_url = data.get('webhook_url', '').strip()
    if not webhook_url:
        raise HTTPException(status_code=400, detail='webhook_url обязателен')
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f'https://api.telegram.org/bot{bot.token}/setWebhook',
                json={'url': webhook_url}
            )
            result = r.json()
        return {'success': result.get('ok', False), 'description': result.get('description', '')}


@app.delete('/api/telegram/bots/{bot_id}/webhook')
async def telegram_remove_webhook(bot_id: int, current_user: dict = Depends(get_admin_user)):
    """Удалить webhook бота"""
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f'https://api.telegram.org/bot{bot.token}/deleteWebhook'
            )
            result = r.json()
        return {'success': result.get('ok', False), 'description': result.get('description', '')}


@app.get('/api/telegram/bots/{bot_id}/users')
async def telegram_list_bot_users(bot_id: int, current_user: dict = Depends(get_admin_user)):
    """Список зарегистрированных пользователей бота"""
    async with db.get_session() as session:
        res = await session.execute(
            select(TelegramBotUserModel).where(TelegramBotUserModel.bot_id == bot_id)
        )
        users = res.scalars().all()
        result = []
        for u in users:
            org_name = None
            if u.org_id:
                org_res = await session.execute(
                    select(OrganizationModel).where(OrganizationModel.id == u.org_id)
                )
                org = org_res.scalars().first()
                org_name = org.name if org else None
            result.append({
                'id': u.id, 'telegram_id': u.telegram_id,
                'username': u.username, 'first_name': u.first_name, 'last_name': u.last_name,
                'org_id': u.org_id, 'org_name': org_name,
                'is_active': u.is_active,
                'notify_critical': u.notify_critical, 'notify_warning': u.notify_warning,
                'notify_info': u.notify_info, 'notify_categories': u.notify_categories or [],
                'registered_at': u.registered_at.isoformat() if u.registered_at else None,
            })
        return {'users': result}


@app.post('/api/telegram/bots/{bot_id}/users')
async def telegram_create_bot_user(bot_id: int, request: Request, current_user: dict = Depends(get_admin_user)):
    """Создать пользователя бота вручную (через веб-интерфейс)"""
    data = await request.json()
    telegram_id = str(data.get('telegram_id', '')).strip()
    if not telegram_id:
        raise HTTPException(status_code=400, detail='telegram_id обязателен')
    async with db.get_session() as session:
        # Проверяем что бот существует
        bot_res = await session.execute(
            select(TelegramBotModel).where(TelegramBotModel.id == bot_id)
        )
        if not bot_res.scalars().first():
            raise HTTPException(status_code=404, detail='Bot not found')
        # Проверяем дубликат
        dup = await session.execute(
            select(TelegramBotUserModel).where(
                TelegramBotUserModel.bot_id == bot_id,
                TelegramBotUserModel.telegram_id == telegram_id,
            )
        )
        if dup.scalars().first():
            raise HTTPException(status_code=409, detail='Пользователь с таким Telegram ID уже существует')
        user = TelegramBotUserModel(
            bot_id=bot_id,
            telegram_id=telegram_id,
            username=data.get('username'),
            first_name=data.get('first_name'),
            last_name=data.get('last_name'),
            org_id=data.get('org_id') if data.get('org_id') else None,
            is_active=True,
            notify_critical=data.get('notify_critical', True),
            notify_warning=data.get('notify_warning', True),
            notify_info=data.get('notify_info', False),
            notify_categories=data.get('notify_categories', []),
        )
        session.add(user)
        await session.commit()
        return {'message': 'Created', 'id': user.id}


@app.put('/api/telegram/bots/{bot_id}/users/{user_id}')
async def telegram_update_bot_user(bot_id: int, user_id: int, request: Request, current_user: dict = Depends(get_admin_user)):
    """Обновить настройки пользователя бота (организация, уведомления)"""
    data = await request.json()
    async with db.get_session() as session:
        res = await session.execute(
            select(TelegramBotUserModel).where(
                TelegramBotUserModel.id == user_id,
                TelegramBotUserModel.bot_id == bot_id
            )
        )
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        if 'org_id' in data:
            user.org_id = data['org_id'] if data['org_id'] else None
        if 'is_active' in data:
            user.is_active = bool(data['is_active'])
        if 'notify_critical' in data:
            user.notify_critical = bool(data['notify_critical'])
        if 'notify_warning' in data:
            user.notify_warning = bool(data['notify_warning'])
        if 'notify_info' in data:
            user.notify_info = bool(data['notify_info'])
        if 'notify_categories' in data:
            user.notify_categories = data['notify_categories']
        await session.commit()
        return {'message': 'Updated'}


@app.delete('/api/telegram/bots/{bot_id}/users/{user_id}')
async def telegram_delete_bot_user(bot_id: int, user_id: int, current_user: dict = Depends(get_admin_user)):
    """Удалить пользователя бота"""
    async with db.get_session() as session:
        res = await session.execute(
            select(TelegramBotUserModel).where(
                TelegramBotUserModel.id == user_id,
                TelegramBotUserModel.bot_id == bot_id
            )
        )
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        await session.delete(user)
        await session.commit()
    return {'message': 'User deleted'}


@app.post('/api/telegram/bots/{bot_id}/users/{user_id}/toggle')
async def telegram_toggle_bot_user(bot_id: int, user_id: int, current_user: dict = Depends(get_admin_user)):
    """Вкл/выкл пользователя бота"""
    async with db.get_session() as session:
        res = await session.execute(
            select(TelegramBotUserModel).where(
                TelegramBotUserModel.id == user_id,
                TelegramBotUserModel.bot_id == bot_id
            )
        )
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        user.is_active = not user.is_active
        await session.commit()
        return {'is_active': user.is_active}


@app.post('/api/telegram/bots/{bot_id}/users/{user_id}/send')
async def telegram_send_to_user(bot_id: int, user_id: int, request: Request, current_user: dict = Depends(get_admin_user)):
    """Отправить сообщение конкретному пользователю бота"""
    data = await request.json()
    message = data.get('message', '').strip()
    if not message:
        raise HTTPException(status_code=400, detail='message обязателен')
    async with db.get_session() as session:
        res = await session.execute(
            select(TelegramBotUserModel).where(
                TelegramBotUserModel.id == user_id,
                TelegramBotUserModel.bot_id == bot_id
            )
        )
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        bot_res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = bot_res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        result = await _send_telegram_message(bot.token, user.telegram_id, message)
        return result


@app.post('/api/telegram/bots/{bot_id}/import-users')
async def telegram_import_users(bot_id: int, current_user: dict = Depends(get_admin_user)):
    """Импортировать пользователей из getUpdates бота (для ботов без webhook)"""
    async with db.get_session() as session:
        res = await session.execute(select(TelegramBotModel).where(TelegramBotModel.id == bot_id))
        bot = res.scalars().first()
        if not bot:
            raise HTTPException(status_code=404, detail='Bot not found')
        updates = await _get_telegram_updates(bot.token)
        imported = 0
        seen = set()
        for u in updates:
            chat_id = str(u.get('chat_id', ''))
            if not chat_id or chat_id in seen:
                continue
            seen.add(chat_id)
            existing = await session.execute(
                select(TelegramBotUserModel).where(
                    TelegramBotUserModel.bot_id == bot_id,
                    TelegramBotUserModel.telegram_id == chat_id
                )
            )
            if existing.scalars().first():
                continue
            new_user = TelegramBotUserModel(
                bot_id=bot_id,
                telegram_id=chat_id,
                username=u.get('from'),
                first_name=u.get('chat_title'),
            )
            session.add(new_user)
            imported += 1
        await session.commit()
        return {'imported': imported, 'total_updates': len(updates)}


# ============================================================
# NOTIFICATION CHANNELS — Интеграции уведомлений
# ============================================================

@app.get('/api/notifications/channels')
async def list_notification_channels(current_user: dict = Depends(get_admin_user)):
    """Список каналов уведомлений"""
    async with db.get_session() as session:
        res = await session.execute(select(NotificationChannelModel))
        channels = res.scalars().all()
        result = []
        for ch in channels:
            cfg = dict(ch.config) if ch.config else {}
            # Mask sensitive fields
            if ch.channel_type == 'telegram' and 'bot_token' in cfg:
                t = cfg['bot_token']
                cfg['bot_token'] = t[:8] + '...' + t[-4:] if len(t) > 12 else '***'
            if ch.channel_type == 'email' and 'smtp_password' in cfg:
                cfg['smtp_password'] = '********'
            if ch.channel_type == 'discord' and 'webhook_url' in cfg:
                u = cfg['webhook_url']
                cfg['webhook_url'] = u[:40] + '...' if len(u) > 40 else u
            result.append({
                'id': ch.id, 'name': ch.name, 'channel_type': ch.channel_type,
                'config': cfg, 'is_enabled': ch.is_enabled,
                'severity_filter': ch.severity_filter, 'category_filter': ch.category_filter,
                'created_at': ch.created_at.isoformat() if ch.created_at else None,
                'updated_at': ch.updated_at.isoformat() if ch.updated_at else None,
            })
        return {'channels': result}


@app.post('/api/notifications/channels')
async def create_notification_channel(body: NotificationChannelCreate, current_user: dict = Depends(get_admin_user)):
    """Создать канал уведомлений"""
    async with db.get_session() as session:
        ch = NotificationChannelModel(
            name=body.name,
            channel_type=body.channel_type,
            config=body.config,
            is_enabled=body.is_enabled,
            severity_filter=body.severity_filter,
            category_filter=body.category_filter,
        )
        session.add(ch)
        await session.commit()
        await session.refresh(ch)
        return {'message': 'Channel created', 'id': ch.id}


@app.put('/api/notifications/channels/{channel_id}')
async def update_notification_channel(channel_id: int, body: NotificationChannelUpdate, current_user: dict = Depends(get_admin_user)):
    """Обновить канал уведомлений"""
    async with db.get_session() as session:
        res = await session.execute(
            select(NotificationChannelModel).where(NotificationChannelModel.id == channel_id)
        )
        ch = res.scalars().first()
        if not ch:
            raise HTTPException(status_code=404, detail='Channel not found')
        if body.name is not None:
            ch.name = body.name
        if body.config is not None:
            ch.config = body.config
        if body.is_enabled is not None:
            ch.is_enabled = body.is_enabled
        if body.severity_filter is not None:
            ch.severity_filter = body.severity_filter
        if body.category_filter is not None:
            ch.category_filter = body.category_filter
        await session.commit()
    return {'message': 'Channel updated'}


@app.delete('/api/notifications/channels/{channel_id}')
async def delete_notification_channel(channel_id: int, current_user: dict = Depends(get_admin_user)):
    """Удалить канал уведомлений"""
    async with db.get_session() as session:
        res = await session.execute(
            select(NotificationChannelModel).where(NotificationChannelModel.id == channel_id)
        )
        ch = res.scalars().first()
        if not ch:
            raise HTTPException(status_code=404, detail='Channel not found')
        await session.delete(ch)
        await session.commit()
    return {'message': 'Channel deleted'}


@app.post('/api/notifications/channels/{channel_id}/test')
async def test_notification_channel(channel_id: int, current_user: dict = Depends(get_admin_user)):
    """Отправить тестовое уведомление"""
    async with db.get_session() as session:
        res = await session.execute(
            select(NotificationChannelModel).where(NotificationChannelModel.id == channel_id)
        )
        ch = res.scalars().first()
        if not ch:
            raise HTTPException(status_code=404, detail='Channel not found')

        test_alert = {
            'severity': 'info',
            'category': 'system',
            'target_type': 'test',
            'target_id': 'test',
            'target_name': 'Test Server',
            'title': 'Тестовое уведомление',
            'message': 'Это тестовое уведомление от системы мониторинга.',
            'metric_key': 'test',
            'metric_value': '100',
            'threshold': '90',
            'created_at': datetime.datetime.utcnow().isoformat(),
        }
        try:
            await _send_notification(ch.channel_type, ch.config, test_alert)
            return {'message': 'Test notification sent', 'success': True}
        except Exception as e:
            return {'message': f'Failed to send: {str(e)}', 'success': False}


@app.post('/api/notifications/channels/{channel_id}/toggle')
async def toggle_notification_channel(channel_id: int, current_user: dict = Depends(get_admin_user)):
    """Включить/выключить канал"""
    async with db.get_session() as session:
        res = await session.execute(
            select(NotificationChannelModel).where(NotificationChannelModel.id == channel_id)
        )
        ch = res.scalars().first()
        if not ch:
            raise HTTPException(status_code=404, detail='Channel not found')
        ch.is_enabled = not ch.is_enabled
        await session.commit()
        return {'message': f'Channel {"enabled" if ch.is_enabled else "disabled"}', 'is_enabled': ch.is_enabled}


# ============================================================
# NOTIFICATION RULES — Пользовательские правила уведомлений
# ============================================================

@app.get('/api/notifications/rules')
async def list_notification_rules(current_user: dict = Depends(get_current_user)):
    """Список правил уведомлений"""
    async with db.get_session() as session:
        res = await session.execute(select(NotificationRuleModel))
        rules = res.scalars().all()
        result = []
        for r in rules:
            # Get channel name
            ch_name = None
            if r.channel_id:
                ch_res = await session.execute(
                    select(NotificationChannelModel).where(NotificationChannelModel.id == r.channel_id)
                )
                ch = ch_res.scalars().first()
                if ch:
                    ch_name = ch.name
            # Get org name
            org_name = None
            if r.org_id:
                org_res = await session.execute(
                    select(OrganizationModel).where(OrganizationModel.id == r.org_id)
                )
                org = org_res.scalars().first()
                if org:
                    org_name = org.name
            # Get target name
            target_name = None
            if r.target_id and r.target_type == 'server':
                srv_res = await session.execute(
                    select(ServerModel).where(ServerModel.id == r.target_id)
                )
                srv = srv_res.scalars().first()
                if srv:
                    target_name = srv.name
            elif r.target_id and r.target_type == 'website':
                ws_res = await session.execute(
                    select(WebsiteModel).where(WebsiteModel.id == r.target_id)
                )
                ws = ws_res.scalars().first()
                if ws:
                    target_name = ws.name
            elif r.target_id and r.target_type == 'hypervisor':
                hv_res = await session.execute(
                    select(HypervisorModel).where(HypervisorModel.id == int(r.target_id))
                )
                hv = hv_res.scalars().first()
                if hv:
                    target_name = hv.name
            result.append({
                'id': r.id, 'name': r.name, 'is_enabled': r.is_enabled,
                'org_id': r.org_id, 'org_name': org_name,
                'target_type': r.target_type, 'target_id': r.target_id, 'target_name': target_name,
                'metric': r.metric, 'condition': r.condition, 'threshold_value': r.threshold_value,
                'severity': r.severity, 'channel_id': r.channel_id, 'channel_name': ch_name,
                'cooldown': r.cooldown, 'last_triggered': r.last_triggered.isoformat() if r.last_triggered else None,
                'trigger_count': r.trigger_count or 0,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        return {'rules': result}


@app.post('/api/notifications/rules')
async def create_notification_rule(body: NotificationRuleCreate, current_user: dict = Depends(get_current_user)):
    """Создать правило уведомления"""
    async with db.get_session() as session:
        rule = NotificationRuleModel(
            name=body.name, is_enabled=body.is_enabled,
            org_id=body.org_id, target_type=body.target_type, target_id=body.target_id,
            metric=body.metric, condition=body.condition, threshold_value=body.threshold_value,
            severity=body.severity, channel_id=body.channel_id, cooldown=body.cooldown,
        )
        session.add(rule)
        await session.commit()
        await session.refresh(rule)
        return {'message': 'Rule created', 'id': rule.id}


@app.put('/api/notifications/rules/{rule_id}')
async def update_notification_rule(rule_id: int, body: NotificationRuleUpdate, current_user: dict = Depends(get_current_user)):
    """Обновить правило уведомления"""
    async with db.get_session() as session:
        res = await session.execute(
            select(NotificationRuleModel).where(NotificationRuleModel.id == rule_id)
        )
        rule = res.scalars().first()
        if not rule:
            raise HTTPException(status_code=404, detail='Rule not found')
        for field in ['name', 'is_enabled', 'org_id', 'target_type', 'target_id', 'metric', 'condition', 'threshold_value', 'severity', 'channel_id', 'cooldown']:
            val = getattr(body, field, None)
            if val is not None:
                setattr(rule, field, val)
        await session.commit()
    return {'message': 'Rule updated'}


@app.delete('/api/notifications/rules/{rule_id}')
async def delete_notification_rule(rule_id: int, current_user: dict = Depends(get_current_user)):
    """Удалить правило уведомления"""
    async with db.get_session() as session:
        res = await session.execute(
            select(NotificationRuleModel).where(NotificationRuleModel.id == rule_id)
        )
        rule = res.scalars().first()
        if not rule:
            raise HTTPException(status_code=404, detail='Rule not found')
        await session.delete(rule)
        await session.commit()
    return {'message': 'Rule deleted'}


@app.post('/api/notifications/rules/{rule_id}/toggle')
async def toggle_notification_rule(rule_id: int, current_user: dict = Depends(get_current_user)):
    """Включить/выключить правило"""
    async with db.get_session() as session:
        res = await session.execute(
            select(NotificationRuleModel).where(NotificationRuleModel.id == rule_id)
        )
        rule = res.scalars().first()
        if not rule:
            raise HTTPException(status_code=404, detail='Rule not found')
        rule.is_enabled = not rule.is_enabled
        await session.commit()
        return {'message': f'Rule {"enabled" if rule.is_enabled else "disabled"}', 'is_enabled': rule.is_enabled}


# ============================================================
#  VIRTUAL MACHINES — Гипервизоры и ВМ
# ============================================================

VM_CACHE: dict = {}  # hypervisor_id -> {vms: [...], timestamp}

@app.get('/api/vm/hypervisors')
async def list_hypervisors(current_user: dict = Depends(get_admin_user)):
    """Список гипервизоров с кэшированными данными ВМ"""
    async with db.async_session() as session:
        result = await session.execute(select(HypervisorModel))
        hypervisors = result.scalars().all()
    
    items = []
    for h in hypervisors:
        cached = VM_CACHE.get(h.id, {})
        vms = cached.get('vms', [])
        if not vms and h.last_data:
            vms = h.last_data if isinstance(h.last_data, list) else h.last_data.get('vms', [])
        
        running = sum(1 for v in vms if (v.get('state', '') or '').lower() in ('running', 'started', 'on'))
        stopped = sum(1 for v in vms if (v.get('state', '') or '').lower() in ('stopped', 'off', 'shutoff', 'poweroff'))
        paused = sum(1 for v in vms if (v.get('state', '') or '').lower() in ('paused', 'suspended'))
        
        items.append({
            'id': h.id,
            'name': h.name,
            'hv_type': h.hv_type,
            'api_url': h.api_url,
            'server_id': h.server_id,
            'is_active': h.is_active,
            'last_check': h.last_check.isoformat() if h.last_check else None,
            'last_status': h.last_status,
            'vms': vms,
            'stats': {
                'total': len(vms),
                'running': running,
                'stopped': stopped,
                'paused': paused,
            },
            'created_at': h.created_at.isoformat() if h.created_at else None,
        })
    return {'hypervisors': items}


@app.post('/api/vm/hypervisors')
async def add_hypervisor(request: Request, current_user: dict = Depends(get_admin_user)):
    """Добавить гипервизор"""
    body = await request.json()
    name = body.get('name', '').strip()
    hv_type = body.get('hv_type', 'hyperv').strip()
    if not name:
        raise HTTPException(400, 'Name is required')
    if hv_type not in ('hyperv', 'proxmox', 'vmware'):
        raise HTTPException(400, 'hv_type must be one of: hyperv, proxmox, vmware')
    
    hv = HypervisorModel(
        name=name,
        hv_type=hv_type,
        api_url=body.get('api_url', '').strip() or None,
        username=body.get('username', '').strip() or None,
        password=body.get('password', '').strip() or None,
        token=body.get('token', '').strip() or None,
        server_id=body.get('server_id', '').strip() or None,
    )
    async with db.async_session() as session:
        session.add(hv)
        await session.commit()
        await session.refresh(hv)
    return {'id': hv.id, 'name': hv.name, 'hv_type': hv.hv_type}


@app.delete('/api/vm/hypervisors/{hv_id}')
async def delete_hypervisor(hv_id: int, current_user: dict = Depends(get_admin_user)):
    async with db.async_session() as session:
        result = await session.execute(select(HypervisorModel).where(HypervisorModel.id == hv_id))
        hv = result.scalar_one_or_none()
        if not hv:
            raise HTTPException(404, 'Not found')
        await session.delete(hv)
        await session.commit()
    VM_CACHE.pop(hv_id, None)
    return {'deleted': True}


@app.post('/api/vm/hypervisors/{hv_id}/refresh')
async def refresh_hypervisor(hv_id: int, current_user: dict = Depends(get_admin_user)):
    """Обновить данные ВМ с гипервизора"""
    async with db.async_session() as session:
        result = await session.execute(select(HypervisorModel).where(HypervisorModel.id == hv_id))
        hv = result.scalar_one_or_none()
        if not hv:
            raise HTTPException(404, 'Not found')
        
        vms = []
        error = None
        
        if hv.hv_type == 'hyperv' and hv.server_id:
            # Получаем данные ВМ из агента (Hyper-V через PowerShell)
            agent_data = AGENT_METRICS.get(hv.server_id, {})
            agent_vms = agent_data.get('virtual_machines', [])
            if agent_vms:
                vms = agent_vms
            else:
                error = 'Агент не передаёт данные ВМ. Обновите агент.'
        
        elif hv.hv_type == 'proxmox' and hv.api_url:
            vms, error = await _fetch_proxmox_vms(hv.api_url, hv.username, hv.password, hv.token)
        
        elif hv.hv_type == 'vmware' and hv.api_url:
            vms, error = await _fetch_vmware_vms(hv.api_url, hv.username, hv.password)
        
        else:
            error = 'Не настроен источник данных'
        
        now = datetime.datetime.utcnow()
        hv.last_check = now
        hv.last_status = 'online' if vms and not error else ('error' if error else 'offline')
        hv.last_data = vms
        await session.commit()
        
        VM_CACHE[hv_id] = {'vms': vms, 'timestamp': now.isoformat()}
        
        return {
            'vms': vms,
            'status': hv.last_status,
            'error': error,
            'count': len(vms),
        }


@app.get('/api/vm/all')
async def all_vms(current_user: dict = Depends(get_admin_user)):
    """Агрегированный список всех ВМ со всех гипервизоров + из агентов"""
    all_vms_list = []
    
    # Из агентов (Hyper-V / VMware / VirtualBox)
    for sid, data in AGENT_METRICS.items():
        agent_vms = data.get('virtual_machines') or []
        for vm in agent_vms:
            vm_copy = dict(vm)
            vm_copy['source'] = 'agent'
            vm_copy['source_name'] = sid
            # Preserve actual VM type reported by agent; fall back to 'hyperv' for legacy agents
            vm_type = (vm_copy.get('type') or '').lower()
            vm_copy['hv_type'] = 'vmware' if 'vmware' in vm_type else 'virtualbox' if 'virtualbox' in vm_type else 'hyperv'
            all_vms_list.append(vm_copy)
    
    # Из зарегистрированных гипервизоров (кэш)
    async with db.async_session() as session:
        result = await session.execute(select(HypervisorModel))
        hypervisors = result.scalars().all()
    
    agent_server_ids = set()
    for h in hypervisors:
        if h.hv_type == 'hyperv' and h.server_id:
            agent_server_ids.add(h.server_id)
    
    # Удалить дубли агентских ВМ, если гипервизор привязан к агенту
    all_vms_list = [v for v in all_vms_list if v.get('source_name') not in agent_server_ids]
    
    for h in hypervisors:
        cached = VM_CACHE.get(h.id, {})
        vms = cached.get('vms', [])
        if not vms and h.last_data:
            vms = h.last_data if isinstance(h.last_data, list) else h.last_data.get('vms', [])
        for vm in vms:
            vm_copy = dict(vm)
            vm_copy['source'] = h.hv_type
            vm_copy['source_name'] = h.name
            vm_copy['hypervisor_id'] = h.id
            all_vms_list.append(vm_copy)
    
    running = sum(1 for v in all_vms_list if (v.get('state', '') or '').lower() in ('running', 'started', 'on'))
    stopped = sum(1 for v in all_vms_list if (v.get('state', '') or '').lower() in ('stopped', 'off', 'shutoff', 'poweroff'))
    paused = sum(1 for v in all_vms_list if (v.get('state', '') or '').lower() in ('paused', 'suspended'))
    
    return {
        'vms': all_vms_list,
        'stats': {
            'total': len(all_vms_list),
            'running': running,
            'stopped': stopped,
            'paused': paused,
        }
    }


@app.get('/api/vm/stats')
async def vm_stats(current_user: dict = Depends(get_admin_user)):
    """Статистика ВМ"""
    data = await all_vms(current_user=current_user)
    return data['stats']


async def _fetch_proxmox_vms(api_url: str, username: str = None, password: str = None, token: str = None):
    """Получить ВМ из Proxmox VE API"""
    vms = []
    try:
        headers = {}
        async with httpx.AsyncClient(verify=not ALLOW_INSECURE_TLS, timeout=15) as client:
            # Авторизация
            if token:
                headers['Authorization'] = f'PVEAPIToken={token}'
            elif username and password:
                auth_resp = await client.post(f'{api_url}/api2/json/access/ticket', data={
                    'username': username, 'password': password
                })
                if auth_resp.status_code == 200:
                    ticket_data = auth_resp.json().get('data', {})
                    headers['Cookie'] = f"PVEAuthCookie={ticket_data.get('ticket', '')}"
                    headers['CSRFPreventionToken'] = ticket_data.get('CSRFPreventionToken', '')
                else:
                    return [], f'Auth failed: {auth_resp.status_code}'
            
            # Получить ноды
            nodes_resp = await client.get(f'{api_url}/api2/json/nodes', headers=headers)
            if nodes_resp.status_code != 200:
                return [], f'Nodes request failed: {nodes_resp.status_code}'
            
            nodes = nodes_resp.json().get('data', [])
            for node in nodes:
                node_name = node.get('node', '')
                # QEMU VMs
                qemu_resp = await client.get(f'{api_url}/api2/json/nodes/{node_name}/qemu', headers=headers)
                if qemu_resp.status_code == 200:
                    for vm in qemu_resp.json().get('data', []):
                        vms.append({
                            'name': vm.get('name', f"VM-{vm.get('vmid')}"),
                            'vmid': vm.get('vmid'),
                            'state': vm.get('status', 'unknown'),
                            'cpu_count': vm.get('cpus', 0),
                            'cpu_usage': round(vm.get('cpu', 0) * 100, 1),
                            'ram_mb': round(vm.get('maxmem', 0) / 1024 / 1024),
                            'ram_used_mb': round(vm.get('mem', 0) / 1024 / 1024),
                            'disk_gb': round(vm.get('maxdisk', 0) / 1024 / 1024 / 1024, 1),
                            'uptime': vm.get('uptime', 0),
                            'node': node_name,
                            'type': 'qemu',
                        })
                # LXC Containers
                lxc_resp = await client.get(f'{api_url}/api2/json/nodes/{node_name}/lxc', headers=headers)
                if lxc_resp.status_code == 200:
                    for ct in lxc_resp.json().get('data', []):
                        vms.append({
                            'name': ct.get('name', f"CT-{ct.get('vmid')}"),
                            'vmid': ct.get('vmid'),
                            'state': ct.get('status', 'unknown'),
                            'cpu_count': ct.get('cpus', 0),
                            'cpu_usage': round(ct.get('cpu', 0) * 100, 1),
                            'ram_mb': round(ct.get('maxmem', 0) / 1024 / 1024),
                            'ram_used_mb': round(ct.get('mem', 0) / 1024 / 1024),
                            'disk_gb': round(ct.get('maxdisk', 0) / 1024 / 1024 / 1024, 1),
                            'uptime': ct.get('uptime', 0),
                            'node': node_name,
                            'type': 'lxc',
                        })
        return vms, None
    except Exception as e:
        return vms, str(e)


async def _fetch_vmware_vms(api_url: str, username: str = None, password: str = None):
    """Получить ВМ из VMware vSphere REST API"""
    vms = []
    try:
        async with httpx.AsyncClient(verify=not ALLOW_INSECURE_TLS, timeout=15) as client:
            # Session auth
            auth_resp = await client.post(f'{api_url}/api/session',
                auth=(username or '', password or ''))
            if auth_resp.status_code not in (200, 201):
                return [], f'Auth failed: {auth_resp.status_code}'
            
            session_id = auth_resp.json() if auth_resp.headers.get('content-type', '').startswith('application/json') else auth_resp.text.strip('"')
            headers = {'vmware-api-session-id': session_id}
            
            # Get VMs
            vms_resp = await client.get(f'{api_url}/api/vcenter/vm', headers=headers)
            if vms_resp.status_code != 200:
                return [], f'VMs request failed: {vms_resp.status_code}'
            
            for vm in vms_resp.json():
                state_map = {'POWERED_ON': 'running', 'POWERED_OFF': 'stopped', 'SUSPENDED': 'paused'}
                vms.append({
                    'name': vm.get('name', ''),
                    'vmid': vm.get('vm', ''),
                    'state': state_map.get(vm.get('power_state', ''), vm.get('power_state', 'unknown')),
                    'cpu_count': vm.get('cpu_count', 0),
                    'ram_mb': vm.get('memory_size_MiB', 0),
                    'type': 'vm',
                })
            
            # Cleanup session
            await client.delete(f'{api_url}/api/session', headers=headers)
        
        return vms, None
    except Exception as e:
        return vms, str(e)


# ===================== ОРГАНИЗАЦИИ =====================

@app.get('/api/organizations')
async def list_organizations(current_user: dict = Depends(get_current_user)):
    """Список организаций"""
    async with db.get_session() as session:
        if current_user['role'] == 'admin':
            res = await session.execute(select(OrganizationModel))
        else:
            org_ids = current_user.get('org_ids', [])
            if org_ids:
                res = await session.execute(
                    select(OrganizationModel).where(OrganizationModel.id.in_(org_ids))
                )
            else:
                return {'organizations': []}
        orgs = res.scalars().all()
        result = []
        for org in orgs:
            # Подсчитать кол-во ресурсов и пользователей
            members_res = await session.execute(
                select(UserOrganizationModel).where(UserOrganizationModel.org_id == org.id)
            )
            members_count = len(members_res.scalars().all())
            servers_res = await session.execute(
                select(ServerModel).where(ServerModel.org_id == org.id)
            )
            servers_count = len(servers_res.scalars().all())
            websites_res = await session.execute(
                select(WebsiteModel).where(WebsiteModel.org_id == org.id)
            )
            websites_count = len(websites_res.scalars().all())
            result.append({
                'id': org.id, 'name': org.name, 'description': org.description,
                'color': org.color, 'created_at': org.created_at.isoformat() if org.created_at else None,
                'members_count': members_count,
                'servers_count': servers_count,
                'websites_count': websites_count,
            })
        return {'organizations': result}


@app.post('/api/organizations')
async def create_organization(data: OrganizationCreate, current_user: dict = Depends(get_admin_user)):
    """Создать организацию (только админ)"""
    async with db.get_session() as session:
        # Проверить уникальность имени
        res = await session.execute(select(OrganizationModel).where(OrganizationModel.name == data.name))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail='Organization with this name already exists')
        org = OrganizationModel(name=data.name, description=data.description, color=data.color)
        session.add(org)
        await session.commit()
        await session.refresh(org)
        return {
            'id': org.id, 'name': org.name, 'description': org.description,
            'color': org.color, 'created_at': org.created_at.isoformat() if org.created_at else None,
        }


@app.put('/api/organizations/{org_id}')
async def update_organization(org_id: int, data: OrganizationUpdate, current_user: dict = Depends(get_admin_user)):
    """Обновить организацию (только админ)"""
    async with db.get_session() as session:
        res = await session.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        org = res.scalars().first()
        if not org:
            raise HTTPException(status_code=404, detail='Organization not found')
        if data.name is not None:
            # Проверить уникальность нового имени
            name_res = await session.execute(
                select(OrganizationModel).where(OrganizationModel.name == data.name, OrganizationModel.id != org_id)
            )
            if name_res.scalars().first():
                raise HTTPException(status_code=400, detail='Organization with this name already exists')
            org.name = data.name
        if data.description is not None:
            org.description = data.description
        if data.color is not None:
            org.color = data.color
        await session.commit()
        await session.refresh(org)
        return {
            'id': org.id, 'name': org.name, 'description': org.description,
            'color': org.color, 'created_at': org.created_at.isoformat() if org.created_at else None,
        }


@app.delete('/api/organizations/{org_id}')
async def delete_organization(org_id: int, current_user: dict = Depends(get_admin_user)):
    """Удалить организацию (только админ)"""
    async with db.get_session() as session:
        res = await session.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        org = res.scalars().first()
        if not org:
            raise HTTPException(status_code=404, detail='Organization not found')
        # Удалить привязки пользователей
        user_orgs = await session.execute(
            select(UserOrganizationModel).where(UserOrganizationModel.org_id == org_id)
        )
        for uo in user_orgs.scalars().all():
            await session.delete(uo)
        # Обнулить org_id у серверов и сайтов
        servers = await session.execute(select(ServerModel).where(ServerModel.org_id == org_id))
        for srv in servers.scalars().all():
            srv.org_id = None
        websites = await session.execute(select(WebsiteModel).where(WebsiteModel.org_id == org_id))
        for ws in websites.scalars().all():
            ws.org_id = None
        await session.delete(org)
        await session.commit()
    return {'message': 'Organization deleted'}


@app.get('/api/organizations/{org_id}/members')
async def list_org_members(org_id: int, current_user: dict = Depends(get_current_user)):
    """Список пользователей в организации"""
    async with db.get_session() as session:
        res = await session.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        if not res.scalars().first():
            raise HTTPException(status_code=404, detail='Organization not found')
        user_orgs = await session.execute(
            select(UserOrganizationModel).where(UserOrganizationModel.org_id == org_id)
        )
        user_ids = [uo.user_id for uo in user_orgs.scalars().all()]
        users = []
        for uid in user_ids:
            user_res = await session.execute(select(UserModel).where(UserModel.id == uid))
            user = user_res.scalars().first()
            if user:
                users.append({
                    'id': user.id, 'name': user.username, 'email': user.email, 'role': user.role.value,
                })
        return {'members': users}


@app.post('/api/organizations/{org_id}/members')
async def add_org_member(org_id: int, request: Request, current_user: dict = Depends(get_admin_user)):
    """Добавить пользователя в организацию (только админ)"""
    body = await request.json()
    user_id = body.get('user_id')
    if not user_id:
        raise HTTPException(status_code=400, detail='user_id is required')
    async with db.get_session() as session:
        # Проверить что org существует
        org_res = await session.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
        if not org_res.scalars().first():
            raise HTTPException(status_code=404, detail='Organization not found')
        # Проверить что user существует
        user_res = await session.execute(select(UserModel).where(UserModel.id == user_id))
        if not user_res.scalars().first():
            raise HTTPException(status_code=404, detail='User not found')
        # Проверить что привязка ещё не существует
        existing = await session.execute(
            select(UserOrganizationModel).where(
                UserOrganizationModel.org_id == org_id,
                UserOrganizationModel.user_id == user_id
            )
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail='User already in this organization')
        uo = UserOrganizationModel(user_id=user_id, org_id=org_id)
        session.add(uo)
        await session.commit()
    return {'message': 'User added to organization'}


@app.delete('/api/organizations/{org_id}/members/{user_id}')
async def remove_org_member(org_id: int, user_id: int, current_user: dict = Depends(get_admin_user)):
    """Удалить пользователя из организации (только админ)"""
    async with db.get_session() as session:
        res = await session.execute(
            select(UserOrganizationModel).where(
                UserOrganizationModel.org_id == org_id,
                UserOrganizationModel.user_id == user_id
            )
        )
        uo = res.scalars().first()
        if not uo:
            raise HTTPException(status_code=404, detail='User not in this organization')
        await session.delete(uo)
        await session.commit()
    return {'message': 'User removed from organization'}


@app.put('/api/servers/{server_id}/organization')
async def assign_server_to_org(server_id: str, request: Request, current_user: dict = Depends(get_admin_user)):
    """Привязать сервер к организации"""
    body = await request.json()
    org_id = body.get('org_id')  # None = убрать из организации
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
    # Обновить in-memory
    for s in SERVERS:
        if s['id'] == server_id:
            s['org_id'] = org_id
            break
    return {'message': 'Server organization updated'}


@app.put('/api/websites/{website_id}/organization')
async def assign_website_to_org(website_id: str, request: Request, current_user: dict = Depends(get_admin_user)):
    """Привязать сайт к организации"""
    body = await request.json()
    org_id = body.get('org_id')
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == website_id))
        website = res.scalars().first()
        if not website:
            raise HTTPException(status_code=404, detail='Website not found')
        if org_id is not None:
            org_res = await session.execute(select(OrganizationModel).where(OrganizationModel.id == org_id))
            if not org_res.scalars().first():
                raise HTTPException(status_code=404, detail='Organization not found')
        website.org_id = org_id
        await session.commit()
    # Обновить in-memory
    for w in WEBSITES:
        if w['id'] == website_id:
            w['org_id'] = org_id
            break
    return {'message': 'Website organization updated'}


@app.get('/metrics')
async def metrics():
    # Incrementing not needed here; counters updated in handlers
    # update uptime gauge
    try:
        REQUESTS_UPTIME.set(time.time() - START_TIME)
    except Exception:
        pass
    data_bytes = generate_latest()
    data = data_bytes.decode('utf-8')

    lines = []
    lines.append("\n# HELP server_cpu_percent CPU utilization percentage")
    lines.append("# TYPE server_cpu_percent gauge")
    lines.append("# HELP server_ram_percent Memory utilization percentage")
    lines.append("# TYPE server_ram_percent gauge")
    lines.append("# HELP server_disk_percent Disk space utilization percentage")
    lines.append("# TYPE server_disk_percent gauge")
    lines.append("# HELP server_swap_percent Swap utilization percentage")
    lines.append("# TYPE server_swap_percent gauge")
    lines.append("# HELP server_processes Process count gauge")
    lines.append("# TYPE server_processes gauge")
    lines.append("# HELP server_uptime_hours System uptime in hours")
    lines.append("# TYPE server_uptime_hours gauge")
    
    lines.append("# HELP server_security_active_users Count of active system users")
    lines.append("# TYPE server_security_active_users gauge")
    lines.append("# HELP server_security_active_ssh_sessions Count of active SSH sessions")
    lines.append("# TYPE server_security_active_ssh_sessions gauge")
    lines.append("# HELP server_security_active_vpn_sessions Count of active VPN connections")
    lines.append("# TYPE server_security_active_vpn_sessions gauge")
    lines.append("# HELP server_security_failed_logins_24h Count of failed logins within 24h")
    lines.append("# TYPE server_security_failed_logins_24h gauge")

    for server_id, ag_data in AGENT_METRICS.items():
        srv_metrics = ag_data.get("metrics") or {}
        sys_info = ag_data.get("system_info") or {}
        os = sys_info.get("os", "unknown")
        
        for name in ["cpu", "ram", "disk", "swap", "processes", "uptime_hours"]:
            m_data = srv_metrics.get(name) or {}
            val = m_data.get("value")
            if val is not None:
                if name in ["cpu", "ram", "disk", "swap"]:
                    lines.append(f'server_{name}_percent{{server_id="{server_id}",os="{os}"}} {val}')
                else:
                    lines.append(f'server_{name}{{server_id="{server_id}",os="{os}"}} {val}')

        sec = ag_data.get("security") or {}
        for name in ["active_users", "active_ssh_sessions", "active_vpn_sessions", "failed_logins_24h"]:
            val = sec.get(name)
            if val is not None:
                lines.append(f'server_security_{name}{{server_id="{server_id}"}} {val}')
                
    combined = data + "\n" + "\n".join(lines) + "\n"
    return Response(content=combined, media_type=CONTENT_TYPE_LATEST)
