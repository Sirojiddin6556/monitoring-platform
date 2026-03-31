#!/usr/bin/env bash
# ============================================================
#  Monitoring Agent — установка на удалённый Linux-сервер
#  Использование:
#    curl -sSL http://<backend_ip>:8000/agent/install.sh | bash -s -- \
#        --backend http://<backend_ip>:8000 \
#        --server-id srv-2 \
#        --interval 15
#
#  Или скопировать на сервер и запустить:
#    chmod +x install.sh
#    ./install.sh --backend http://10.0.0.1:8000 --server-id my-server
# ============================================================

set -euo pipefail

# ── Значения по умолчанию ──
BACKEND_URL=""
SERVER_ID=""
INTERVAL=15
INSTALL_DIR="/opt/monitoring-agent"
SERVICE_NAME="monitoring-agent"
PYTHON_CMD=""

# ── Цвета ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── Парсинг аргументов ──
while [[ $# -gt 0 ]]; do
    case "$1" in
        --backend)     BACKEND_URL="$2";  shift 2 ;;
        --server-id)   SERVER_ID="$2";    shift 2 ;;
        --interval)    INTERVAL="$2";     shift 2 ;;
        --install-dir) INSTALL_DIR="$2";  shift 2 ;;
        -h|--help)
            echo "Использование: $0 --backend <URL> --server-id <ID> [--interval 15] [--install-dir /opt/monitoring-agent]"
            exit 0
            ;;
        *) error "Неизвестный аргумент: $1" ;;
    esac
done

# ── Валидация ──
[ -z "$BACKEND_URL" ] && read -rp "Введите URL бэкенда (http://ip:8000): " BACKEND_URL
[ -z "$SERVER_ID" ]   && read -rp "Введите ID сервера: " SERVER_ID
[ -z "$BACKEND_URL" ] && error "BACKEND_URL обязателен"
[ -z "$SERVER_ID" ]   && error "SERVER_ID обязателен"

# ── Определить Python 3 ──
find_python() {
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            ver=$("$cmd" -c "import sys; print(sys.version_info.major)")
            if [ "$ver" = "3" ]; then
                PYTHON_CMD="$cmd"
                return 0
            fi
        fi
    done
    return 1
}

log "Установка Monitoring Agent"
log "  Backend:   $BACKEND_URL"
log "  Server ID: $SERVER_ID"
log "  Interval:  ${INTERVAL}s"
log "  Каталог:   $INSTALL_DIR"
echo ""

# ── Проверить/установить Python 3 ──
if ! find_python; then
    warn "Python 3 не найден. Устанавливаю..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq python3 python3-pip python3-venv
    elif command -v yum &>/dev/null; then
        sudo yum install -y python3 python3-pip
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y python3 python3-pip
    else
        error "Не могу установить Python 3. Установите вручную."
    fi
    find_python || error "Python 3 не найден после установки"
fi
log "Python: $PYTHON_CMD ($($PYTHON_CMD --version 2>&1))"

# ── Создать каталог ──
sudo mkdir -p "$INSTALL_DIR"
sudo chown "$(whoami):$(whoami)" "$INSTALL_DIR"

# ── Создать venv ──
log "Создаю виртуальное окружение..."
$PYTHON_CMD -m venv "$INSTALL_DIR/venv" 2>/dev/null || {
    warn "venv не сработал, устанавливаю python3-venv..."
    sudo apt-get install -y -qq python3-venv 2>/dev/null || true
    $PYTHON_CMD -m venv "$INSTALL_DIR/venv"
}

# ── Записать agent.py ──
log "Записываю агент..."
cat > "$INSTALL_DIR/agent.py" << 'AGENT_EOF'
import os
import asyncio
import httpx
import time
import psutil
import platform
import logging

try:
    from prometheus_client import Counter, start_http_server
    HAS_PROMETHEUS = True
except ImportError:
    HAS_PROMETHEUS = False

try:
    from pythonjsonlogger import jsonlogger
    HAS_JSON_LOGGER = True
except ImportError:
    HAS_JSON_LOGGER = False

BACKEND_URL = os.getenv('BACKEND_URL', 'http://127.0.0.1:8000')
SERVER_ID = os.getenv('SERVER_ID', 'srv-1')
INTERVAL = int(os.getenv('INTERVAL', '15'))
METRICS_PORT = int(os.getenv('METRICS_PORT', '8001'))

logger = logging.getLogger('monitoring-agent')
handler = logging.StreamHandler()
if HAS_JSON_LOGGER:
    handler.setFormatter(jsonlogger.JsonFormatter('%(asctime)s %(name)s %(levelname)s %(message)s'))
else:
    handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(handler)
logger.setLevel(logging.INFO)

if HAS_PROMETHEUS:
    SENT_METRICS = Counter('agent_sent_metrics_total', 'Metrics sent')


def collect():
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    try:
        disk = psutil.disk_usage('/')
        disk_pct = disk.percent
    except Exception:
        try:
            disk_pct = psutil.disk_usage('C:\\').percent
        except Exception:
            disk_pct = 0.0
    swap = psutil.swap_memory()
    try:
        la = psutil.getloadavg()
        l1, l5, l15 = la
    except (AttributeError, OSError):
        l1 = l5 = l15 = cpu / 100.0 * psutil.cpu_count()
    procs = len(psutil.pids())
    uptime_h = (time.time() - psutil.boot_time()) / 3600
    return {
        'cpu': round(cpu, 1),
        'ram': round(mem.percent, 1),
        'disk': round(disk_pct, 1),
        'swap': round(swap.percent, 1),
        'load1': round(l1, 2), 'load5': round(l5, 2), 'load15': round(l15, 2),
        'processes': procs,
        'uptime_hours': round(uptime_h, 1),
    }


async def run():
    if HAS_PROMETHEUS:
        try:
            start_http_server(METRICS_PORT)
            logger.info(f"Prometheus metrics on :{METRICS_PORT}")
        except Exception:
            pass

    psutil.cpu_percent(interval=None)
    prev_net = psutil.net_io_counters()
    try:
        prev_dio = psutil.disk_io_counters()
    except Exception:
        prev_dio = None
    prev_t = time.time()

    async with httpx.AsyncClient() as client:
        while True:
            try:
                real = collect()
                now = time.time()
                dt = max(now - prev_t, 0.1)

                cur_net = psutil.net_io_counters()
                net_in = round((cur_net.bytes_recv - prev_net.bytes_recv) * 8 / dt / 1e6, 2)
                net_out = round((cur_net.bytes_sent - prev_net.bytes_sent) * 8 / dt / 1e6, 2)
                prev_net = cur_net

                try:
                    cur_dio = psutil.disk_io_counters()
                    iops_r = round((cur_dio.read_count - (prev_dio.read_count if prev_dio else 0)) / dt) if prev_dio else 0
                    iops_w = round((cur_dio.write_count - (prev_dio.write_count if prev_dio else 0)) / dt) if prev_dio else 0
                    prev_dio = cur_dio
                except Exception:
                    iops_r = iops_w = 0

                prev_t = now

                payload = {
                    'service': 'agent',
                    'timestamp': int(now),
                    'server_id': SERVER_ID,
                    'metric': 'system',
                    'metrics': {
                        'cpu':          {'value': real['cpu'],              'unit': '%'},
                        'ram':          {'value': real['ram'],              'unit': '%'},
                        'disk':         {'value': real['disk'],             'unit': '%'},
                        'swap':         {'value': real['swap'],             'unit': '%'},
                        'net_in':       {'value': max(0, net_in),           'unit': 'Mbps'},
                        'net_out':      {'value': max(0, net_out),          'unit': 'Mbps'},
                        'load1':        {'value': real['load1'],            'unit': ''},
                        'load5':        {'value': real['load5'],            'unit': ''},
                        'load15':       {'value': real['load15'],           'unit': ''},
                        'processes':    {'value': real['processes'],         'unit': ''},
                        'uptime_hours': {'value': real['uptime_hours'],     'unit': 'ч'},
                        'iops_read':    {'value': max(0, iops_r),           'unit': 'IO/s'},
                        'iops_write':   {'value': max(0, iops_w),           'unit': 'IO/s'},
                    },
                    'status': 'ok',
                }

                resp = await client.post(f"{BACKEND_URL}/api/metrics", json=payload, timeout=10)
                if HAS_PROMETHEUS:
                    SENT_METRICS.inc()
                logger.info(f"OK [{resp.status_code}] cpu={real['cpu']}% ram={real['ram']}% disk={real['disk']}%")
            except Exception as e:
                logger.warning(f"FAIL: {e}")

            await asyncio.sleep(INTERVAL)


if __name__ == '__main__':
    logger.info(f"Agent starting | server_id={SERVER_ID} backend={BACKEND_URL} interval={INTERVAL}s platform={platform.system()}")
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Agent stopped")
AGENT_EOF

# ── Установить зависимости ──
log "Устанавливаю зависимости..."
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet psutil httpx

# Опционально (могут быть не нужны)
"$INSTALL_DIR/venv/bin/pip" install --quiet prometheus_client python-json-logger 2>/dev/null || true

# ── Создать .env файл ──
cat > "$INSTALL_DIR/.env" << EOF
BACKEND_URL=$BACKEND_URL
SERVER_ID=$SERVER_ID
INTERVAL=$INTERVAL
METRICS_PORT=8001
EOF
log "Конфигурация записана в $INSTALL_DIR/.env"

# ── Создать systemd сервис ──
if command -v systemctl &>/dev/null; then
    log "Создаю systemd сервис..."
    sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=Monitoring Agent ($SERVER_ID)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/agent.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    sudo systemctl start "$SERVICE_NAME"
    log "Сервис запущен и включён в автозагрузку"
    echo ""
    log "Полезные команды:"
    echo "  sudo systemctl status $SERVICE_NAME   — статус"
    echo "  sudo journalctl -u $SERVICE_NAME -f   — логи"
    echo "  sudo systemctl restart $SERVICE_NAME   — перезапуск"
    echo "  sudo systemctl stop $SERVICE_NAME      — остановка"
else
    warn "systemd не найден — запустите агент вручную:"
    echo "  source $INSTALL_DIR/venv/bin/activate"
    echo "  BACKEND_URL=$BACKEND_URL SERVER_ID=$SERVER_ID python $INSTALL_DIR/agent.py"
fi

echo ""
log "Установка завершена!"
log "Агент отправляет метрики на $BACKEND_URL каждые ${INTERVAL} сек"
