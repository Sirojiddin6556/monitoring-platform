"""Centralized Application State and In-Memory Stores.
Thread-safe singleton stores decoupling routers and services from main.py.
"""
from typing import List, Dict, Set, Any
from fastapi import WebSocket

class ConnectionManager:
    """Manages active WebSocket connections for real-time dashboard events."""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

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

# Global WebSocket broadcast manager
manager = ConnectionManager()

# Global Resource Registries
SERVERS: List[Dict[str, Any]] = []
WEBSITES: List[Dict[str, Any]] = []

# Telemetry Caches
AGENT_METRICS: Dict[str, Dict[str, Any]] = {}
SSL_INFO: Dict[str, Dict[str, Any]] = {}

# Time-Series Ring Buffers
METRICS_STORE: List[Dict[str, Any]] = []
PROBES_STORE: List[Dict[str, Any]] = []
LOGS_STORE: List[Dict[str, Any]] = []

# Dynamic Application Settings & Upgrade Trackers
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
APP_SETTINGS: Dict[str, str] = {k: v['value'] for k, v in DEFAULT_SETTINGS.items()}
PENDING_AGENT_UPGRADES: Set[str] = set()
