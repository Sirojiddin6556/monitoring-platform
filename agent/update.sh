#!/usr/bin/env bash
# ============================================================
#  Monitoring Agent — Быстрое обновление агента
#  Использование:
#    sudo /opt/monitoring-agent/update.sh
#    или одной командой с бэкенда:
#    curl -sSf http://<IP>:9000/agent/update.sh | sudo bash
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()   { echo -e "${GREEN}[+]${NC} $*"; }
info()  { echo -e "${BLUE}[*]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*"; exit 1; }

# 1. Определение каталога установки
INSTALL_DIR="/opt/monitoring-agent"
if [ ! -d "$INSTALL_DIR" ]; then
    RUNNING_PID=$(pgrep -f "monitoring-agent" | head -n 1 || true)
    if [ -n "$RUNNING_PID" ] && [ -e "/proc/$RUNNING_PID/exe" ]; then
        EXE_PATH=$(readlink -f "/proc/$RUNNING_PID/exe" || true)
        if [ -n "$EXE_PATH" ]; then
            INSTALL_DIR="$(dirname "$EXE_PATH")"
        fi
    fi
fi

if [ ! -d "$INSTALL_DIR" ]; then
    error "Каталог агента не найден ($INSTALL_DIR). Установите агент сначала через install.sh"
fi

# 2. Чтение конфигурации из agent.env
ENV_FILE="$INSTALL_DIR/agent.env"
if [ ! -f "$ENV_FILE" ]; then
    error "Файл конфигурации $ENV_FILE не найден"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${BACKEND_URL:-}" ]; then
    error "BACKEND_URL не указан в $ENV_FILE"
fi

BACKEND_URL="${BACKEND_URL%/}"
BIN_NAME="monitoring-agent"
SERVICE_NAME="monitoring-agent"

# Текущая версия
CUR_VER="unknown"
if [ -f "$INSTALL_DIR/VERSION" ]; then
    CUR_VER="$(cat "$INSTALL_DIR/VERSION" | tr -d ' \r\n')"
fi

info "=== Обновление Monitoring Agent ==="
info "Каталог:         $INSTALL_DIR"
info "Сервер ID:       ${SERVER_ID:-unknown}"
info "Backend URL:     $BACKEND_URL"
info "Текущая версия:  $CUR_VER"

# 3. Определение архитектуры
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64)  ARCH_SUFFIX="amd64" ;;
    aarch64) ARCH_SUFFIX="arm64" ;;
    armv7l)  ARCH_SUFFIX="arm"   ;;
    amd64)   ARCH_SUFFIX="amd64" ;;
    arm64)   ARCH_SUFFIX="arm64" ;;
    arm)     ARCH_SUFFIX="arm" ;;
    *)       ARCH_SUFFIX="$ARCH" ;;
esac

DOWNLOAD_BIN="monitoring-agent-linux-${ARCH_SUFFIX}"
DOWNLOAD_URL="$BACKEND_URL/agent/$DOWNLOAD_BIN"
VERSION_URL="$BACKEND_URL/agent/VERSION"

# 4. Проверка доступной версии на бэкенде
NEW_VER=""
if curl -sSf "$VERSION_URL" -o /tmp/target_agent_ver 2>/dev/null; then
    NEW_VER="$(cat /tmp/target_agent_ver | tr -d ' \r\n')"
    rm -f /tmp/target_agent_ver
    info "Целевая версия:  $NEW_VER"
fi

# 5. Скачивание нового бинарника
TMP_BIN="$(mktemp /tmp/monitoring-agent-new.XXXXXX)"
info "Скачивание нового бинарника: $DOWNLOAD_URL ..."

AUTH_HEADER=""
if [ -n "${INGEST_API_KEY:-}" ]; then
    AUTH_HEADER="X-Ingest-Key: ${INGEST_API_KEY}"
elif [ -n "${AGENT_KEY:-}" ]; then
    AUTH_HEADER="X-Ingest-Key: ${AGENT_KEY}"
fi

CURL_OPTS=("-sSf" "-L" "--max-time" "60")
if [ -n "$AUTH_HEADER" ]; then
    CURL_OPTS+=("-H" "$AUTH_HEADER")
fi

if ! curl "${CURL_OPTS[@]}" "$DOWNLOAD_URL" -o "$TMP_BIN"; then
    rm -f "$TMP_BIN"
    error "Не удалось скачать $DOWNLOAD_URL. Проверьте доступность бэкенда."
fi

BIN_SIZE=$(wc -c < "$TMP_BIN")
if [ "$BIN_SIZE" -lt 1000000 ]; then
    rm -f "$TMP_BIN"
    error "Скачанный файл слишком мал ($BIN_SIZE байт), возможно ошибка загрузки."
fi

chmod +x "$TMP_BIN"

# 6. Замена бинарника и перезапуск службы
info "Остановка службы $SERVICE_NAME..."
if command -v systemctl &>/dev/null; then
    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
else
    pkill -f "$INSTALL_DIR/$BIN_NAME" 2>/dev/null || true
fi

# Бэкап предыдущего бинарника
if [ -f "$INSTALL_DIR/$BIN_NAME" ]; then
    cp -f "$INSTALL_DIR/$BIN_NAME" "$INSTALL_DIR/${BIN_NAME}.backup"
fi

cp -f "$TMP_BIN" "$INSTALL_DIR/$BIN_NAME"
chmod +x "$INSTALL_DIR/$BIN_NAME"
rm -f "$TMP_BIN"

if [ -n "$NEW_VER" ]; then
    echo "$NEW_VER" | sudo tee "$INSTALL_DIR/VERSION" >/dev/null || true
fi

info "Запуск службы $SERVICE_NAME..."
if command -v systemctl &>/dev/null; then
    sudo systemctl daemon-reload 2>/dev/null || true
    sudo systemctl start "$SERVICE_NAME"
    sleep 2
    if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
        log "Служба $SERVICE_NAME успешно запущена!"
    else
        warn "Служба не запустилась автоматически, проверяю статус..."
        sudo systemctl status "$SERVICE_NAME" --no-pager || true
    fi
else
    set -a
    source "$ENV_FILE"
    set +a
    "$INSTALL_DIR/$BIN_NAME" &
    log "Агент запущен в фоне (PID: $!)"
fi

sudo cp -f /opt/monitoring-platform/agent/update.sh "$INSTALL_DIR/update.sh" 2>/dev/null || true
sudo chmod +x "$INSTALL_DIR/update.sh" 2>/dev/null || true

log "Обновление агента успешно завершено! Текущая версия: ${NEW_VER:-$CUR_VER}"
