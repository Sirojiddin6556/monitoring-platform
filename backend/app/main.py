from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, status, Depends, Request
from fastapi.responses import JSONResponse, Response
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
import time
import datetime
import asyncio
import httpx
import subprocess
import platform
import psutil
import ssl
import socket
from sqlalchemy import select
from datetime import timedelta

from . import db
from .models import Server as ServerModel, Website as WebsiteModel, Metric as MetricModel, Probe as ProbeModel, Log as LogModel, User as UserModel, UserRole, Setting as SettingModel, Alert as AlertModel, TelegramBot as TelegramBotModel, KubeCluster as KubeClusterModel, Hypervisor as HypervisorModel
from .security import get_password_hash, verify_password, create_access_token, get_current_user, get_admin_user
from .schemas import UserRegister, UserLogin, Token, UserResponse, UserUpdate, MessageResponse, ServerCreate, WebsiteCreate, SettingItem, SettingsUpdate
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Ситуационный центр мониторинга - Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})


@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_data: UserRegister):
    """Регистрация нового пользователя"""
    async with db.get_session() as session:
        # Проверить что пользователь еще не существует
        res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
        if res.scalars().first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        
        res = await session.execute(select(UserModel).where(UserModel.username == user_data.username))
        if res.scalars().first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        
        # Создать нового пользователя
        user = UserModel(
            email=user_data.email,
            username=user_data.username,
            hashed_password=get_password_hash(user_data.password),
            role=UserRole.VIEWER,  # По умолчанию viewers
            is_active=True
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """Вход пользователя"""
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
        user = res.scalars().first()
        
        if not user or not verify_password(user_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")
        
        # Создать JWT токен
        access_token_expires = timedelta(minutes=30)
        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role.value},
            expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "role": user.role.value
            }
        }


@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Получить информацию о текущем пользователе"""
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.id == int(current_user["user_id"])))
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user


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
}
APP_SETTINGS: dict[str, str] = {k: v['value'] for k, v in DEFAULT_SETTINGS.items()}

# In-memory alert & extended stores
ALERTS_STORE: list[dict] = []
# Track active alerts to avoid duplicates (key = "type:target_id:metric_key")
ACTIVE_ALERT_KEYS: set = set()


@app.on_event('startup')
async def startup_event():
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
                SERVERS.append({'id': srv.id, 'name': srv.name, 'host': srv.host})
        
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
    
    # Запустить фоновые задачи мониторинга
    asyncio.create_task(background_website_prober())
    asyncio.create_task(background_server_pinger())

# Seeded resources for integrated monitoring (servers and websites)
SERVERS: list[dict] = [
    {"id": "srv-1", "name": "localhost", "host": "127.0.0.1"},
]

WEBSITES: list[dict] = [
    {"id": "site-1", "name": "Example", "url": "https://example.com"},
    {"id": "site-2", "name": "Example2", "url": "https://example.org"},
]

# Хранилище последних метрик от агентов (server_id -> {metrics, timestamp, ...extended data})
AGENT_METRICS: dict = {}
# Хранилище SSL-информации для сайтов (url -> {issuer, expires, days_left, ...})
SSL_INFO: dict = {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # echo for now
            await manager.send_json({"echo": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


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
        async with httpx.AsyncClient(timeout=timeout_sec, follow_redirects=True, verify=False) as client:
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
    # Save to DB
    try:
        async with db.get_session() as session:
            a = AlertModel(
                severity=severity, category=category, target_type=target_type,
                target_id=target_id, target_name=target_name, title=title,
                message=message, metric_key=metric_key,
                metric_value=str(metric_value) if metric_value is not None else None,
                threshold=str(threshold) if threshold is not None else None,
                is_active=True,
            )
            session.add(a)
            await session.commit()
    except Exception:
        pass
    # Broadcast via WebSocket
    try:
        await manager.send_json({"alert": alert_dict})
    except Exception:
        pass


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
    thresholds = {
        'cpu': ('alert_cpu_threshold', '%'),
        'ram': ('alert_ram_threshold', '%'),
        'disk': ('alert_disk_threshold', '%'),
        'swap': ('alert_swap_threshold', '%'),
        'ping': ('alert_ping_threshold', 'мс'),
    }
    for key, (setting_key, unit) in thresholds.items():
        thresh = int(APP_SETTINGS.get(setting_key, '0'))
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

    # Check for stopped services
    services = agent_data.get('services', [])
    for svc in services:
        if svc.get('status') in ('inactive', 'failed'):
            await create_alert(
                severity='warning' if svc['status'] == 'inactive' else 'critical',
                category='service', target_type='service',
                target_id=f"{server_id}:{svc['name']}", target_name=svc['name'],
                title=f'Сервис {svc["name"]} не работает на {server_name}',
                message=f'Статус: {svc["status"]}',
                metric_key='service_status', metric_value=svc['status'], threshold='active'
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
                    try:
                        async with db.get_session() as session:
                            p = ProbeModel(payload=payload, received_at=datetime.datetime.utcnow())
                            session.add(p)
                            await session.commit()
                    except Exception:
                        pass
                    try:
                        await manager.send_json({"probe": payload})
                    except Exception:
                        pass
        except Exception:
            pass
        interval = int(APP_SETTINGS.get('probe_interval', '30'))
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
                        agent_fresh = agent_data and (ts - agent_data.get('timestamp', 0)) < 120
                        
                        if agent_fresh:
                            # Использовать реальные метрики от удалённого агента
                            all_metrics = dict(agent_data['metrics'])
                            all_metrics['ping'] = {'value': ping_ms, 'unit': 'ms'}
                            source_label = 'agent'
                        else:
                            # Fallback: локальные метрики этой машины
                            all_metrics = {
                                'ping': {'value': ping_ms, 'unit': 'ms'},
                                'cpu': {'value': round(real['cpu'], 1), 'unit': '%'},
                                'ram': {'value': round(real['ram'], 1), 'unit': '%'},
                                'disk': {'value': round(real['disk'], 1), 'unit': '%'},
                                'swap': {'value': round(real['swap'], 1), 'unit': '%'},
                                'net_in': {'value': max(0, local_net_in), 'unit': 'Mbps'},
                                'net_out': {'value': max(0, local_net_out), 'unit': 'Mbps'},
                                'load1': {'value': round(real['load1'], 2), 'unit': ''},
                                'load5': {'value': round(real['load5'], 2), 'unit': ''},
                                'load15': {'value': round(real['load15'], 2), 'unit': ''},
                                'processes': {'value': real['processes'], 'unit': ''},
                                'uptime_hours': {'value': round(real['uptime_hours'], 1), 'unit': 'ч'},
                                'iops_read': {'value': max(0, local_iops_r), 'unit': 'IO/s'},
                                'iops_write': {'value': max(0, local_iops_w), 'unit': 'IO/s'},
                            }
                    
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
                        'status': result['status'],
                        'timestamp': ts,
                    }
                    entry = {"payload": payload, "received_at": ts}
                    METRICS_STORE.append(entry)
                    while len(METRICS_STORE) > max_metrics:
                        METRICS_STORE.pop(0)
                    try:
                        async with db.get_session() as session:
                            m = MetricModel(payload=payload, received_at=datetime.datetime.utcnow())
                            session.add(m)
                            await session.commit()
                    except Exception:
                        pass
                    try:
                        await manager.send_json({"metric": payload})
                    except Exception:
                        pass

                    # Check alerts for this server
                    try:
                        alert_metrics = dict(all_metrics)
                        alert_metrics['_status'] = result['status']
                        server_name = s.get('name', sid)
                        await check_server_alerts(sid, server_name, alert_metrics)
                    except Exception:
                        pass
        except Exception:
            pass
        interval = int(APP_SETTINGS.get('ping_interval', '15'))
        await asyncio.sleep(interval)


@app.post('/api/metrics')
async def receive_metrics(payload: dict, request: Request):
    REQUESTS_METRICS.inc()
    max_metrics = int(APP_SETTINGS.get('max_metrics_store', '1000'))
    ts = int(time.time())

    # Если агент прислал метрики для конкретного сервера — запоминаем
    server_id = payload.get('server_id')
    if server_id and payload.get('metrics'):
        # Авторегистрация сервера если ещё не существует
        existing_ids = {s['id'] for s in SERVERS}
        if server_id not in existing_ids:
            sys_info = payload.get('system_info') or {}
            auto_name = sys_info.get('hostname', server_id)
            client_ip = request.client.host if request.client else server_id
            new_srv = {'id': server_id, 'name': auto_name, 'host': client_ip}
            try:
                async with db.get_session() as session:
                    res = await session.execute(select(ServerModel).where(ServerModel.id == server_id))
                    if not res.scalars().first():
                        session.add(ServerModel(id=server_id, name=auto_name, host=client_ip))
                        await session.commit()
                SERVERS.append(new_srv)
            except Exception:
                SERVERS.append(new_srv)

        AGENT_METRICS[server_id] = {
            'metrics': payload['metrics'],
            'status': payload.get('status', 'ok'),
            'timestamp': payload.get('timestamp', ts),
            # Extended data from agent
            'system_info': payload.get('system_info'),
            'cpu_detail': payload.get('cpu_detail'),
            'ram_detail': payload.get('ram_detail'),
            'swap_detail': payload.get('swap_detail'),
            'disks': payload.get('disks'),
            'disk_io': payload.get('disk_io'),
            'network_interfaces': payload.get('network_interfaces'),
            'network_connections': payload.get('network_connections'),
            'temperatures': payload.get('temperatures'),
            'processes_detail': payload.get('processes_detail'),
            'services': payload.get('services'),
            'docker_containers': payload.get('docker_containers'),
            'virtual_machines': payload.get('virtual_machines'),
            'recent_logs': payload.get('recent_logs'),
            'security': payload.get('security'),
        }

    entry = {"payload": payload, "received_at": ts}
    METRICS_STORE.append(entry)
    while len(METRICS_STORE) > max_metrics:
        METRICS_STORE.pop(0)
    # persist to DB
    try:
        async with db.get_session() as session:
            metric = MetricModel(payload=payload, received_at=datetime.datetime.utcnow())
            session.add(metric)
            await session.commit()
    except Exception:
        pass
    # broadcast via WebSocket
    try:
        await manager.send_json({"metric": payload})
    except Exception:
        pass
    return {"status": "received"}


@app.post('/api/probe')
async def receive_probe(payload: dict):
    # In real implementation store probe result, generate alerts
    REQUESTS_PROBE.inc()
    # store in probes store
    entry = {"payload": payload, "received_at": int(time.time())}
    PROBES_STORE.append(entry)
    if len(PROBES_STORE) > 1000:
        PROBES_STORE.pop(0)
    # persist probe
    try:
        async with db.get_session() as session:
            p = ProbeModel(payload=payload, received_at=datetime.datetime.utcnow())
            session.add(p)
            await session.commit()
    except Exception:
        pass
    try:
        await manager.send_json({"probe": payload})
    except Exception:
        pass
    return {"status": "received"}


@app.post('/api/logs')
async def receive_log(payload: dict):
    # accept logs from agents/probers and store in memory
    entry = {"payload": payload, "received_at": int(time.time())}
    LOGS_STORE.append(entry)
    if len(LOGS_STORE) > 5000:
        LOGS_STORE.pop(0)
    # persist log
    try:
        async with db.get_session() as session:
            l = LogModel(payload=payload, received_at=datetime.datetime.utcnow())
            session.add(l)
            await session.commit()
    except Exception:
        pass
    try:
        await manager.send_json({"log": payload})
    except Exception:
        pass
    return {"status": "received"}


@app.get('/api/metrics/history')
async def metrics_history(limit: int = 100):
    try:
        async with db.get_session() as session:
            q = await session.execute(select(MetricModel).order_by(MetricModel.received_at.desc()).limit(limit))
            rows = q.scalars().all()
            return {"metrics": [r.payload for r in reversed(rows)]}
    except Exception:
        return {"metrics": METRICS_STORE[-limit:]}


@app.get('/api/probes/history')
async def probes_history(limit: int = 100):
    try:
        async with db.get_session() as session:
            q = await session.execute(select(ProbeModel).order_by(ProbeModel.received_at.desc()).limit(limit))
            rows = q.scalars().all()
            return {"probes": [r.payload for r in reversed(rows)]}
    except Exception:
        return {"probes": PROBES_STORE[-limit:]}


@app.get('/api/logs/history')
async def logs_history(limit: int = 100):
    try:
        async with db.get_session() as session:
            q = await session.execute(select(LogModel).order_by(LogModel.received_at.desc()).limit(limit))
            rows = q.scalars().all()
            return {"logs": [r.payload for r in reversed(rows)]}
    except Exception:
        return {"logs": LOGS_STORE[-limit:]}


# --- Resources endpoints for UI tabs ---


@app.get('/api/servers')
async def list_servers():
    async with db.get_session() as session:
        res = await session.execute(select(ServerModel))
        db_servers = res.scalars().all()
        existing_ids = {s['id'] for s in SERVERS}
        for srv in db_servers:
            if srv.id not in existing_ids:
                SERVERS.append({
                    'id': srv.id, 'name': srv.name, 'host': srv.host,
                    'monitor_type': getattr(srv, 'monitor_type', 'agent') or 'agent',
                    'ssh_user': getattr(srv, 'ssh_user', None),
                    'ssh_port': getattr(srv, 'ssh_port', 22),
                    'ssh_password': getattr(srv, 'ssh_password', None),
                    'ssh_key_path': getattr(srv, 'ssh_key_path', None),
                    'winrm_user': getattr(srv, 'winrm_user', None),
                    'winrm_password': getattr(srv, 'winrm_password', None),
                    'winrm_port': getattr(srv, 'winrm_port', 5985),
                    'winrm_use_ssl': getattr(srv, 'winrm_use_ssl', False),
                })
    
    servers_out = []
    for s in SERVERS:
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
        servers_out.append({
            'id': s['id'], 'name': s['name'], 'host': s.get('host'),
            'monitor_type': s.get('monitor_type', 'agent'),
            'status': status_val, 'last_ping': last_ping, 'last_metrics': last_metrics,
            'agent_data': AGENT_METRICS.get(s['id']),
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
            monitor_type=data.monitor_type or 'agent',
            ssh_user=data.ssh_user, ssh_port=data.ssh_port or 22,
            ssh_password=data.ssh_password, ssh_key_path=data.ssh_key_path,
            winrm_user=data.winrm_user, winrm_password=data.winrm_password,
            winrm_port=data.winrm_port or 5985, winrm_use_ssl=data.winrm_use_ssl or False,
        )
        session.add(server)
        await session.commit()
    new_server = {
        'id': data.id, 'name': data.name, 'host': data.host,
        'monitor_type': data.monitor_type or 'agent',
        'ssh_user': data.ssh_user, 'ssh_port': data.ssh_port or 22,
        'ssh_password': data.ssh_password, 'ssh_key_path': data.ssh_key_path,
        'winrm_user': data.winrm_user, 'winrm_password': data.winrm_password,
        'winrm_port': data.winrm_port or 5985, 'winrm_use_ssl': data.winrm_use_ssl or False,
    }
    SERVERS.append(new_server)
    return {'id': data.id, 'name': data.name, 'host': data.host, 'monitor_type': data.monitor_type or 'agent'}


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
async def server_metrics(server_id: str, limit: int = 500):
    items = [m for m in METRICS_STORE if m.get('payload', {}).get('server_id') == server_id]
    return {'metrics': items[-limit:]}


@app.get('/api/websites')
async def list_websites():
    # Загрузить актуальный список из БД
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel))
        db_websites = res.scalars().all()
        existing_ids = {w['id'] for w in WEBSITES}
        for ws in db_websites:
            if ws.id not in existing_ids:
                WEBSITES.append({'id': ws.id, 'name': ws.name, 'url': ws.url})

    out = []
    for w in WEBSITES:
        last = None
        for p in reversed(PROBES_STORE[-500:]):
            pl = p.get('payload', {})
            if pl.get('target') == w.get('url'):
                last = pl
                break
        out.append({**w, 'last_probe': last, 'ssl': SSL_INFO.get(w.get('url'))})
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
        website = WebsiteModel(id=data.id, name=data.name, url=data.url)
        session.add(website)
        await session.commit()
    new_site = {'id': data.id, 'name': data.name, 'url': data.url}
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
async def website_probes(website_id: str, limit: int = 100):
    # Read website by id from DB, then fetch probes matching target
    async with db.get_session() as session:
        res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == website_id))
        wrow = res.scalars().first()
        if not wrow:
            return {'probes': []}
        target = wrow.url
        # fetch recent probes and filter by payload.target == target
        q = await session.execute(select(ProbeModel).order_by(ProbeModel.received_at.desc()).limit(1000))
        rows = q.scalars().all()
        filtered = []
        for r in rows:
            pl = r.payload or {}
            if pl.get('target') == target:
                filtered.append({'payload': pl, 'received_at': r.received_at.isoformat()})
                if len(filtered) >= limit:
                    break
        return {'probes': list(reversed(filtered))}


@app.get('/api/alerts')
async def list_alerts(active_only: bool = False, limit: int = 100):
    """Получить алерты"""
    try:
        async with db.get_session() as session:
            if active_only:
                q = await session.execute(
                    select(AlertModel).where(AlertModel.is_active == True)
                    .order_by(AlertModel.created_at.desc()).limit(limit)
                )
            else:
                q = await session.execute(
                    select(AlertModel).order_by(AlertModel.created_at.desc()).limit(limit)
                )
            rows = q.scalars().all()
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
async def alerts_stats():
    """Статистика алертов"""
    try:
        async with db.get_session() as session:
            total = await session.execute(select(AlertModel))
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
async def server_detail(server_id: str):
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
            # Проверить что email еще не занят
            res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
            if res.scalars().first() and res.scalars().first().id != user_id:
                raise HTTPException(status_code=400, detail="Email already taken")
            user.email = user_data.email
        
        if user_data.username:
            # Проверить что username еще не занят
            res = await session.execute(select(UserModel).where(UserModel.username == user_data.username))
            if res.scalars().first() and res.scalars().first().id != user_id:
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
    """Создать новго пользователя (только админ)"""
    async with db.get_session() as session:
        res = await session.execute(select(UserModel).where(UserModel.email == user_data.email))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        res = await session.execute(select(UserModel).where(UserModel.username == user_data.username))
        if res.scalars().first():
            raise HTTPException(status_code=400, detail="Username already taken")
        
        user = UserModel(
            email=user_data.email,
            username=user_data.username,
            hashed_password=get_password_hash(user_data.password),
            role=UserRole.VIEWER,
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


@app.post('/api/data/cleanup')
async def cleanup_data(current_user: dict = Depends(get_admin_user)):
    """Очистить старые данные мониторинга (только админ)"""
    retention_hours = int(APP_SETTINGS.get('data_retention_hours', '168'))
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=retention_hours) if retention_hours > 0 else None
    deleted = {'metrics': 0, 'probes': 0, 'logs': 0}
    
    async with db.get_session() as session:
        if cutoff:
            from sqlalchemy import delete as sa_delete
            r = await session.execute(sa_delete(MetricModel).where(MetricModel.received_at < cutoff))
            deleted['metrics'] = r.rowcount
            r = await session.execute(sa_delete(ProbeModel).where(ProbeModel.received_at < cutoff))
            deleted['probes'] = r.rowcount
            r = await session.execute(sa_delete(LogModel).where(LogModel.received_at < cutoff))
            deleted['logs'] = r.rowcount
            await session.commit()
    
    # Очистить in-memory stores
    if cutoff:
        cutoff_ts = int(cutoff.timestamp())
        METRICS_STORE[:] = [m for m in METRICS_STORE if m.get('received_at', 0) > cutoff_ts]
        PROBES_STORE[:] = [p for p in PROBES_STORE if p.get('received_at', 0) > cutoff_ts]
        LOGS_STORE[:] = [l for l in LOGS_STORE if l.get('received_at', 0) > cutoff_ts]
    
    return {'message': f'Очищено: метрик={deleted["metrics"]}, проб={deleted["probes"]}, логов={deleted["logs"]}', 'deleted': deleted}


# ============================================================
# DOCKER — Агрегированный вид со всех серверов
# ============================================================

@app.get('/api/docker/containers')
async def docker_all_containers():
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
async def docker_stats():
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
async def kube_list_clusters():
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
async def kube_refresh_cluster(cluster_id: int):
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
        async with httpx.AsyncClient(verify=False, timeout=10) as client:
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
async def telegram_list_bots():
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
async def telegram_check_bot(bot_id: int):
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
        bot.last_info = info
        await session.commit()
        return {'status': info.get('status'), 'info': info}


@app.post('/api/telegram/bots/{bot_id}/send')
async def telegram_send_test(bot_id: int, request: Request):
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
async def telegram_get_updates(bot_id: int):
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
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f'https://api.telegram.org/bot{token}/getMe')
            if r.status_code == 200:
                data = r.json()
                if data.get('ok'):
                    bot_info = data['result']
                    # Получить количество обновлений
                    r2 = await client.get(f'https://api.telegram.org/bot{token}/getWebhookInfo')
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
                    }
            return {'status': 'error', 'error': f'HTTP {r.status_code}'}
    except Exception as e:
        return {'status': 'offline', 'error': str(e)}


async def _send_telegram_message(token: str, chat_id: str, text: str) -> dict:
    """Отправить сообщение в Telegram"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f'https://api.telegram.org/bot{token}/sendMessage', json={
                'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'
            })
            data = r.json()
            if data.get('ok'):
                return {'sent': True, 'message_id': data['result'].get('message_id')}
            return {'sent': False, 'error': data.get('description', 'Unknown error')}
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
#  VIRTUAL MACHINES — Гипервизоры и ВМ
# ============================================================

VM_CACHE: dict = {}  # hypervisor_id -> {vms: [...], timestamp}

@app.get('/api/vm/hypervisors')
async def list_hypervisors():
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
async def add_hypervisor(request: Request):
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
async def delete_hypervisor(hv_id: int):
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
async def refresh_hypervisor(hv_id: int):
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
async def all_vms():
    """Агрегированный список всех ВМ со всех гипервизоров + из агентов"""
    all_vms_list = []
    
    # Из агентов (Hyper-V)
    for sid, data in AGENT_METRICS.items():
        agent_vms = data.get('virtual_machines') or []
        for vm in agent_vms:
            vm_copy = dict(vm)
            vm_copy['source'] = 'agent'
            vm_copy['source_name'] = sid
            vm_copy['hv_type'] = 'hyperv'
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
async def vm_stats():
    """Статистика ВМ"""
    data = await all_vms()
    return data['stats']


async def _fetch_proxmox_vms(api_url: str, username: str = None, password: str = None, token: str = None):
    """Получить ВМ из Proxmox VE API"""
    vms = []
    try:
        headers = {}
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
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
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
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


@app.get('/metrics')
async def metrics():
    # Incrementing not needed here; counters updated in handlers
    # update uptime gauge
    try:
        REQUESTS_UPTIME.set(time.time() - START_TIME)
    except Exception:
        pass
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)
