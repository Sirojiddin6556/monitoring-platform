#!/usr/bin/env bash
# ============================================================
#  Monitoring Agent — установка на Linux/macOS сервер
#  Использование:
#    ./install.sh --backend http://10.0.0.1:8000 --server-id my-server
#    ./install.sh --backend http://10.0.0.1:8000 --server-id my-server --interval 30 --agent-key secret
# ============================================================

set -euo pipefail

BACKEND_URL=""
SERVER_ID=""
INTERVAL=15
INGEST_API_KEY=""
AGENT_KEY=""
ARCH_OVERRIDE=""
INSTALL_DIR="/opt/monitoring-agent"
SERVICE_NAME="monitoring-agent"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()   { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*"; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --backend)     BACKEND_URL="$2";    shift 2 ;;
        --server-id)   SERVER_ID="$2";      shift 2 ;;
        --interval)    INTERVAL="$2";       shift 2 ;;
        --install-dir) INSTALL_DIR="$2";    shift 2 ;;
        --ingest-key)  INGEST_API_KEY="$2"; shift 2 ;;
        --agent-key)   AGENT_KEY="$2";      shift 2 ;;
        --arch)        ARCH_OVERRIDE="$2";  shift 2 ;;
        -h|--help)
            echo "Использование: $0 --backend <URL> --server-id <ID> [--interval 15] [--ingest-key KEY|--agent-key KEY] [--arch amd64|arm64]"
            exit 0 ;;
        *) error "Неизвестный аргумент: $1" ;;
    esac
done

if [ -n "$ARCH_OVERRIDE" ]; then
    ARCH="$ARCH_OVERRIDE"
else
    ARCH="$(uname -m)"
fi

[ -z "$BACKEND_URL" ] && read -rp "Введите URL бэкенда (http://ip:8000): " BACKEND_URL
[ -z "$SERVER_ID" ]   && read -rp "Введите ID сервера: " SERVER_ID
[ -z "$BACKEND_URL" ] && error "BACKEND_URL обязателен"
[ -z "$SERVER_ID" ]   && error "SERVER_ID обязателен"

log "Установка Monitoring Agent (Go)"
log "  Backend:   $BACKEND_URL"
log "  Server ID: $SERVER_ID"
log "  Interval:  ${INTERVAL}s"
log "  Каталог:   $INSTALL_DIR"
echo ""

# ── Найти бинарь рядом со скриптом ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_NAME="monitoring-agent"
SOURCE_BIN=""

# Detect arch
case "$ARCH" in
    x86_64)  ARCH_SUFFIX="amd64" ;;
    aarch64) ARCH_SUFFIX="arm64" ;;
    armv7l)  ARCH_SUFFIX="arm"   ;;
    amd64)   ARCH_SUFFIX="amd64" ;;
    arm64)   ARCH_SUFFIX="arm64" ;;
    arm)     ARCH_SUFFIX="arm" ;;
    *)       ARCH_SUFFIX="$ARCH" ;;
esac

for candidate in \
    "$SCRIPT_DIR/monitoring-agent-linux-${ARCH_SUFFIX}" \
    "$SCRIPT_DIR/monitoring-agent-linux" \
    "$SCRIPT_DIR/monitoring-agent"
do
    if [ -f "$candidate" ]; then
        SOURCE_BIN="$candidate"
        break
    fi
done

if [ -z "$SOURCE_BIN" ]; then
    # Попытка скачать с бэкенда
    DOWNLOAD_URL="$BACKEND_URL/agent/monitoring-agent-linux-${ARCH_SUFFIX}"
    warn "Бинарь не найден рядом со скриптом. Пробую скачать: $DOWNLOAD_URL"
    TMP_BIN="$(mktemp)"
    if curl -sSf "$DOWNLOAD_URL" -o "$TMP_BIN" 2>/dev/null; then
        SOURCE_BIN="$TMP_BIN"
        log "Бинарь скачан с бэкенда"
    else
        rm -f "$TMP_BIN"
        error "Бинарь не найден и не удалось скачать с бэкенда.\n   Соберите: GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o monitoring-agent-linux-amd64 .\n   Поместите рядом с install.sh"
    fi
fi

# ── Создать каталог ───────────────────────────────────────────────────────────
if [ ! -d "$INSTALL_DIR" ]; then
    sudo mkdir -p "$INSTALL_DIR"
fi
sudo chown "$(whoami):$(id -gn)" "$INSTALL_DIR"

# ── Остановить старый процесс ─────────────────────────────────────────────────
if command -v systemctl &>/dev/null; then
    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
fi

# ── Скопировать бинарь ────────────────────────────────────────────────────────
cp "$SOURCE_BIN" "$INSTALL_DIR/$BIN_NAME"
chmod +x "$INSTALL_DIR/$BIN_NAME"
log "Бинарь установлен: $INSTALL_DIR/$BIN_NAME"

# Скопировать VERSION если есть
[ -f "$SCRIPT_DIR/VERSION" ] && cp "$SCRIPT_DIR/VERSION" "$INSTALL_DIR/VERSION"

# ── Создать agent.env ─────────────────────────────────────────────────────────
if [ -n "$AGENT_KEY" ] && [ -z "$INGEST_API_KEY" ]; then
    INGEST_API_KEY="$AGENT_KEY"
fi
if [ -n "$INGEST_API_KEY" ] && [ -z "$AGENT_KEY" ]; then
    AGENT_KEY="$INGEST_API_KEY"
fi
cat > "$INSTALL_DIR/agent.env" << EOF
BACKEND_URL=$BACKEND_URL
SERVER_ID=$SERVER_ID
INTERVAL=$INTERVAL
INGEST_API_KEY=$INGEST_API_KEY
AGENT_KEY=$AGENT_KEY
EOF
log "Конфигурация записана: $INSTALL_DIR/agent.env"

# ── Скрипт удаления ───────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/uninstall.sh" << EOF
#!/usr/bin/env bash
sudo systemctl stop $SERVICE_NAME 2>/dev/null || true
sudo systemctl disable $SERVICE_NAME 2>/dev/null || true
sudo rm -f /etc/systemd/system/${SERVICE_NAME}.service
sudo systemctl daemon-reload
echo "[+] Агент остановлен и удалён из автозагрузки."
echo "    Каталог $INSTALL_DIR не удалён — удалите вручную при необходимости."
EOF
chmod +x "$INSTALL_DIR/uninstall.sh"

# ── Systemd сервис ────────────────────────────────────────────────────────────
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
EnvironmentFile=$INSTALL_DIR/agent.env
ExecStart=$INSTALL_DIR/$BIN_NAME
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
    echo "  sudo systemctl status $SERVICE_NAME     — статус"
    echo "  sudo journalctl -u $SERVICE_NAME -f     — логи"
    echo "  sudo systemctl restart $SERVICE_NAME    — перезапуск"
    echo "  $INSTALL_DIR/uninstall.sh               — удалить"
else
    warn "systemd не найден. Запустите вручную:"
    echo "  set -a; source $INSTALL_DIR/agent.env; set +a"
    echo "  $INSTALL_DIR/$BIN_NAME &"
fi

echo ""
log "Установка завершена! Агент отправляет метрики на $BACKEND_URL каждые ${INTERVAL}с"
